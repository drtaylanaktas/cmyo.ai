import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/rate-limiter';
import { findRelevantDocuments, generateWithOpenAIStream, buildSystemPrompt, buildContext, logChatDebug, sanitizeUserMessage, detectKanitFormuFillIntent } from '@/lib/chat-engine';

const DAILY_LIMIT = 100;

// SSE yardımcı: her olay tek satır JSON olarak gönderilir → `data: {...}\n\n`
function sseLine(obj: unknown): string {
    return `data: ${JSON.stringify(obj)}\n\n`;
}

export async function POST(req: Request) {
    try {
        // Rate limiting
        const ip = getClientIP(req);
        const rateCheck = await checkRateLimit(`chat:${ip}`, RATE_LIMITS.chat);
        if (!rateCheck.allowed) {
            return NextResponse.json(
                { error: `Çok fazla mesaj gönderildi. ${rateCheck.resetIn} saniye sonra tekrar deneyin.` },
                { status: 429 }
            );
        }

        const { message: rawMessage, history, user, weather, conversationId, attachmentImage } = await req.json();

        // Input validation & sanitization
        if (!rawMessage || typeof rawMessage !== 'string') {
            return NextResponse.json({ error: 'Geçersiz mesaj.' }, { status: 400 });
        }
        const message = sanitizeUserMessage(rawMessage.trim().slice(0, 4000));
        if (message.length === 0) {
            return NextResponse.json({ error: 'Mesaj boş olamaz.' }, { status: 400 });
        }

        const role = user?.role || 'student';
        const userEmail = user?.email;

        let remainingQuota: number | null = null;

        // --- ATOMİK KOTA KONTROLÜ ---
        // Tek sorguda hem günlük sıfırlama hem artırma yapılır; yarış koşulu yoktur.
        // Limit altındaysa satır döner ve sayaç artar; limitteyse hiç satır dönmez.
        if (role !== 'admin' && userEmail) {
            try {
                const upd = await sql`
                    UPDATE users
                    SET daily_message_count = CASE
                            WHEN last_message_date IS NULL THEN 1
                            WHEN (last_message_date AT TIME ZONE 'Europe/Istanbul')::date
                                 <> (NOW() AT TIME ZONE 'Europe/Istanbul')::date THEN 1
                            ELSE daily_message_count + 1
                        END,
                        last_message_date = NOW()
                    WHERE email = ${userEmail}
                      AND (
                            last_message_date IS NULL
                            OR (last_message_date AT TIME ZONE 'Europe/Istanbul')::date
                               <> (NOW() AT TIME ZONE 'Europe/Istanbul')::date
                            OR daily_message_count < ${DAILY_LIMIT}
                      )
                    RETURNING daily_message_count;
                `;

                if (upd.rows.length > 0) {
                    remainingQuota = DAILY_LIMIT - upd.rows[0].daily_message_count;
                } else {
                    // Satır dönmedi: ya limit doldu ya da kullanıcı kayıtlı değil.
                    const exists = await sql`SELECT 1 FROM users WHERE email = ${userEmail} LIMIT 1`;
                    if (exists.rows.length > 0) {
                        return NextResponse.json(
                            { error: `Günlük mesaj limitinize (${DAILY_LIMIT}) ulaştınız. Harika sorularınızı yarına saklayın!` },
                            { status: 429 }
                        );
                    }
                    // Kayıtlı olmayan kullanıcı: kota uygulanmaz.
                }
            } catch (quotaErr) {
                console.error('Error checking quota:', quotaErr);
            }
        }
        // --- ATOMİK KOTA KONTROLÜ SONU ---

        logChatDebug(`--- Chat Request Started (OpenAI, streaming) ---`);

        // --- KULLANICI MESAJINI KAYDET ---
        let currentConversationId = conversationId;
        try {
            if (userEmail) {
                if (!currentConversationId) {
                    const title = message.length > 50 ? message.substring(0, 50) + '...' : message;
                    const result = await sql`
                        INSERT INTO conversations (user_email, title)
                        VALUES (${userEmail}, ${title})
                        RETURNING id;
                    `;
                    currentConversationId = result.rows[0].id;
                } else {
                    await sql`UPDATE conversations SET updated_at = NOW() WHERE id = ${currentConversationId}`;
                }

                await sql`
                    INSERT INTO messages (conversation_id, role, content)
                    VALUES (${currentConversationId}, 'user', ${message});
                `;
            }
        } catch (dbError) {
            console.error('Database persistence error (User):', dbError);
        }
        // --- KULLANICI MESAJI SONU ---

        // RAG Step
        const relevantDocs = await findRelevantDocuments(message);
        logChatDebug(`Found ${relevantDocs.length} relevant docs.`);

        // FR-585 Kanıt Formu otomatik doldurma intent tespiti.
        const hasTextAttachment = /\[BELGE İÇERİĞİ BAŞLANGICI/.test(rawMessage);
        const hasImageAttachment = !!(attachmentImage && typeof attachmentImage?.dataUrl === 'string');
        const hasAttachment = hasTextAttachment || hasImageAttachment;
        const fillKanitFormuIntent = detectKanitFormuFillIntent(message, hasAttachment);
        if (fillKanitFormuIntent) {
            logChatDebug('[intent] FR-585 kanit formu fill intent detected.');
        }

        let context = buildContext(relevantDocs);
        const haberKaynak = relevantDocs.find(d => (d as any).__haberKaynak)?.__haberKaynak as string | undefined;
        if (haberKaynak) {
            const marker = `[HABER_KAYNAK=${haberKaynak.toUpperCase()}]`;
            context = `${marker}\n${context}`;
        }
        const systemPrompt = buildSystemPrompt(user, role, context, weather, fillKanitFormuIntent);

        // --- SSE STREAM ---
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            async start(controller) {
                // İlk olay: meta (conversationId + remainingQuota) — frontend bunları hemen alır.
                controller.enqueue(encoder.encode(sseLine({
                    type: 'meta',
                    conversationId: currentConversationId ?? null,
                    remainingQuota,
                })));

                let fullReply = '';
                try {
                    for await (const delta of generateWithOpenAIStream(message, systemPrompt, history)) {
                        fullReply += delta;
                        controller.enqueue(encoder.encode(sseLine({ type: 'delta', text: delta })));
                    }
                } catch (genErr: any) {
                    console.error('OpenAI streaming failed', genErr);
                    logChatDebug(`OPENAI STREAM FAILED: ${genErr.message}`);
                    controller.enqueue(encoder.encode(sseLine({
                        type: 'error',
                        error: 'Şu an yanıt üretemiyorum, lütfen biraz sonra tekrar deneyin.',
                    })));
                    controller.close();
                    return;
                }

                // Asistan yanıtını stream bittikten sonra kalıcılaştır.
                try {
                    if (userEmail && currentConversationId && fullReply) {
                        await sql`
                            INSERT INTO messages (conversation_id, role, content)
                            VALUES (${currentConversationId}, 'assistant', ${fullReply});
                        `;
                    }
                } catch (dbError) {
                    console.error('Database persistence error (Assistant):', dbError);
                }

                controller.enqueue(encoder.encode(sseLine({ type: 'done' })));
                controller.close();
            },
        });

        return new Response(stream, {
            headers: {
                'Content-Type': 'text/event-stream; charset=utf-8',
                'Cache-Control': 'no-cache, no-transform',
                Connection: 'keep-alive',
                'X-Accel-Buffering': 'no',
            },
        });

    } catch (error: any) {
        console.error('API Error:', error);
        logChatDebug(`TOP LEVEL API ERROR: ${error.message}`);
        return NextResponse.json({ error: 'Bir sorun oluştu, lütfen tekrar deneyin.' }, { status: 500 });
    }
}
