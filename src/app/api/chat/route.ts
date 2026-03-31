import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/rate-limiter';
import { findRelevantDocuments, generateWithOpenAI, buildSystemPrompt, buildContext, logChatDebug, sanitizeUserMessage } from '@/lib/chat-engine';

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

        const { message: rawMessage, history, user, weather, conversationId } = await req.json();

        // Input validation & sanitization
        if (!rawMessage || typeof rawMessage !== 'string') {
            return NextResponse.json({ error: 'Geçersiz mesaj.' }, { status: 400 });
        }
        const message = sanitizeUserMessage(rawMessage.trim().slice(0, 4000));
        if (message.length === 0) {
            return NextResponse.json({ error: 'Mesaj boş olamaz.' }, { status: 400 });
        }

        const role = user?.role || 'student';

        let remainingQuota: number | null = null;
        const userEmail = user?.email;

        // --- QUOTA (RATE LIMIT) CHECK START ---
        if (role !== 'admin' && userEmail) {
            try {
                const userDb = await sql`SELECT id, daily_message_count, last_message_date FROM users WHERE email = ${userEmail}`;
                if (userDb.rows.length > 0) {
                    let { daily_message_count, last_message_date } = userDb.rows[0];
                    const todayStr = new Date().toDateString();
                    const lastDateStr = last_message_date ? new Date(last_message_date).toDateString() : '';
                    
                    if (todayStr !== lastDateStr) {
                        daily_message_count = 0;
                    }
                    
                    if (daily_message_count >= 100) {
                        return NextResponse.json(
                            { error: 'Günlük mesaj limitinize (100) ulaştınız. Harika sorularınızı yarına saklayın!' },
                            { status: 429 }
                        );
                    }
                    remainingQuota = 100 - (daily_message_count + 1);
                } else {
                    remainingQuota = 99;
                }
            } catch (quotaErr) {
                console.error('Error checking quota:', quotaErr);
            }
        }
        // --- QUOTA (RATE LIMIT) CHECK END ---

        logChatDebug(`--- Chat Request Started (OpenAI) ---`);

        // --- DATABASE PERSISTENCE START ---
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
        // --- DATABASE PERSISTENCE END ---

        // RAG Step
        const relevantDocs = await findRelevantDocuments(message);
        logChatDebug(`Found ${relevantDocs.length} relevant docs.`);

        const context = buildContext(relevantDocs);
        const systemPrompt = buildSystemPrompt(user, role, context, weather);

        let reply = "";
        try {
            reply = await generateWithOpenAI(message, systemPrompt, history);
        } catch (error: any) {
            console.error("OpenAI generation failed", error);
            logChatDebug(`OPENAI FAILED: ${error.message}`);

            return NextResponse.json({
                error: `API Error: ${error.message || 'Unknown error'}.`
            }, { status: 503 });
        }

        // --- DATABASE PERSISTENCE (ASSISTANT & QUOTA) ---
        try {
            if (userEmail && currentConversationId) {
                await sql`
                    INSERT INTO messages (conversation_id, role, content)
                    VALUES (${currentConversationId}, 'assistant', ${reply});
                `;
                
                if (role !== 'admin' && remainingQuota !== null) {
                    const newCount = 100 - remainingQuota;
                    await sql`
                        UPDATE users 
                        SET daily_message_count = ${newCount}, last_message_date = CURRENT_TIMESTAMP
                        WHERE email = ${userEmail};
                    `;
                }
            }
        } catch (dbError) {
            console.error('Database persistence error (Assistant/Quota):', dbError);
        }
        // --- DATABASE PERSISTENCE END ---

        return NextResponse.json({ reply, conversationId: currentConversationId, remainingQuota });

    } catch (error: any) {
        console.error('API Error:', error);
        logChatDebug(`TOP LEVEL API ERROR: ${error.message}`);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
