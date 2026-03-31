import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { findRelevantDocuments, generateWithOpenAI, buildSystemPrompt, buildContext, logChatDebug, sanitizeUserMessage } from '@/lib/chat-engine';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limiter';
import crypto from 'crypto';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';

// Send message to Telegram
async function sendTelegramMessage(chatId: number, text: string, parseMode: string = 'Markdown') {
    // Telegram markdown can be picky — if send fails with Markdown, retry with plain text
    try {
        const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: text,
                parse_mode: parseMode,
            }),
        });

        if (!res.ok) {
            const errorData = await res.json();
            // If markdown parse error, retry without parse_mode
            if (errorData.description?.includes('parse') && parseMode === 'Markdown') {
                return sendTelegramMessage(chatId, text, '');
            }
            console.error('Telegram sendMessage error:', errorData);
        }
        return res;
    } catch (error) {
        console.error('Failed to send Telegram message:', error);
    }
}

// Send "typing" action
async function sendTypingAction(chatId: number) {
    try {
        await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendChatAction`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, action: 'typing' }),
        });
    } catch (e) {
        // Non-critical, ignore
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();

        // Telegram sends update objects
        const message = body.message;
        if (!message || !message.text) {
            return NextResponse.json({ ok: true });
        }

        const chatId = message.chat.id;
        const text = message.text.trim();
        const telegramFirstName = message.from?.first_name || 'Kullanıcı';

        // --- COMMAND HANDLING ---

        // /start command
        if (text === '/start') {
            await sendTelegramMessage(chatId,
                `🎓 *ÇMYO.AI Telegram Asistanı*\n\n` +
                `Merhaba ${telegramFirstName}! Çiçekdağı Meslek Yüksekokulu yapay zeka asistanına hoş geldiniz.\n\n` +
                `Bu botu kullanabilmek için önce ÇMYO.AI hesabınızı bağlamanız gerekiyor.\n\n` +
                `📌 *Komutlar:*\n` +
                `/baglanti \`e-posta\` — Hesabınızı bağlayın\n` +
                `/durum — Bağlantı durumunuzu kontrol edin\n` +
                `/yardim — Yardım menüsü\n\n` +
                `Başlamak için: /baglanti ornek@ahievran.edu.tr`
            );
            return NextResponse.json({ ok: true });
        }

        // /yardim command  
        if (text === '/yardim') {
            await sendTelegramMessage(chatId,
                `📚 *ÇMYO.AI Yardım*\n\n` +
                `Bu bot, Çiçekdağı MYO hakkında sorularınıza yapay zeka destekli yanıtlar verir.\n\n` +
                `*Neler sorabilirsiniz:*\n` +
                `• Ders programı\n` +
                `• Staj süreçleri\n` +
                `• Kayıt işlemleri\n` +
                `• Akademik takvim\n` +
                `• Yemekhane, ulaşım bilgileri\n` +
                `• ve daha fazlası...\n\n` +
                `*Komutlar:*\n` +
                `/baglanti \`e-posta\` — Hesap bağlama\n` +
                `/durum — Bağlantı durumu\n` +
                `/kopar — Hesap bağlantısını kaldır\n\n` +
                `⚠️ Yapay zeka yanıtlarını resmi kaynaklardan doğrulayın.`
            );
            return NextResponse.json({ ok: true });
        }

        // /durum command
        if (text === '/durum') {
            try {
                const userResult = await sql`
                    SELECT name, surname, email, role, telegram_linked 
                    FROM users WHERE telegram_chat_id = ${chatId}
                `;
                if (userResult.rows.length > 0 && userResult.rows[0].telegram_linked) {
                    const u = userResult.rows[0];
                    await sendTelegramMessage(chatId,
                        `✅ *Hesabınız bağlı*\n\n` +
                        `👤 ${u.name} ${u.surname}\n` +
                        `📧 ${u.email}\n` +
                        `🎓 ${u.role === 'academic' ? 'Akademisyen' : 'Öğrenci'}`
                    );
                } else {
                    await sendTelegramMessage(chatId,
                        `❌ Hesabınız henüz bağlı değil.\n\n` +
                        `Bağlamak için: /baglanti e-posta@ahievran.edu.tr`
                    );
                }
            } catch (e) {
                await sendTelegramMessage(chatId, '⚠️ Durum kontrol edilirken bir hata oluştu.');
            }
            return NextResponse.json({ ok: true });
        }

        // /kopar command (unlink)
        if (text === '/kopar') {
            try {
                await sql`
                    UPDATE users 
                    SET telegram_chat_id = NULL, telegram_linked = FALSE, telegram_link_code = NULL
                    WHERE telegram_chat_id = ${chatId}
                `;
                await sendTelegramMessage(chatId, '✅ Hesap bağlantınız kaldırıldı. Tekrar bağlamak için /baglanti komutunu kullanabilirsiniz.');
            } catch (e) {
                await sendTelegramMessage(chatId, '⚠️ Bağlantı kaldırılırken bir hata oluştu.');
            }
            return NextResponse.json({ ok: true });
        }

        // /baglanti command
        if (text.startsWith('/baglanti')) {
            const parts = text.split(' ');
            if (parts.length < 2) {
                await sendTelegramMessage(chatId,
                    `📧 Lütfen e-posta adresinizi girin:\n\n` +
                    `/baglanti ornek@ahievran.edu.tr`
                );
                return NextResponse.json({ ok: true });
            }

            const email = parts[1].toLowerCase().trim();

            // Validate email
            if (!email.endsWith('@ahievran.edu.tr') && !email.endsWith('@ogr.ahievran.edu.tr')) {
                await sendTelegramMessage(chatId,
                    '❌ Sadece @ahievran.edu.tr veya @ogr.ahievran.edu.tr uzantılı e-posta adresleri kabul edilmektedir.'
                );
                return NextResponse.json({ ok: true });
            }

            // Check if user exists
            const userResult = await sql`SELECT id, name, surname, telegram_linked FROM users WHERE email = ${email}`;
            if (userResult.rows.length === 0) {
                await sendTelegramMessage(chatId,
                    '❌ Bu e-posta adresi sistemde kayıtlı değil.\n\nÖnce cmyo.ai web sitesinden kayıt olmalısınız.'
                );
                return NextResponse.json({ ok: true });
            }

            if (userResult.rows[0].telegram_linked) {
                await sendTelegramMessage(chatId,
                    '⚠️ Bu hesap zaten bir Telegram hesabına bağlı. Önce /kopar komutu ile mevcut bağlantıyı kaldırın.'
                );
                return NextResponse.json({ ok: true });
            }

            // Generate 8-digit verification code (100M olasılık — 6 haneli 1M'dan çok daha güçlü)
            const code = crypto.randomInt(10000000, 99999999).toString();

            // Save code and chat_id temporarily
            await sql`
                UPDATE users 
                SET telegram_link_code = ${code}, telegram_chat_id = ${chatId}
                WHERE email = ${email}
            `;

            // Send verification code via email
            try {
                // Reuse existing email infrastructure — send a simple code email
                const nodemailer = require('nodemailer');
                const transporter = nodemailer.createTransport({
                    host: process.env.SMTP_HOST || 'smtp.gmail.com',
                    port: parseInt(process.env.SMTP_PORT || '587'),
                    secure: false,
                    auth: {
                        user: process.env.SMTP_USER,
                        pass: process.env.SMTP_PASS,
                    },
                });

                await transporter.sendMail({
                    from: `"ÇMYO.AI" <${process.env.SMTP_USER}>`,
                    to: email,
                    subject: 'ÇMYO.AI Telegram Doğrulama Kodu',
                    html: `
                        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; background: #0a0f1e; color: #e2e8f0; padding: 30px; border-radius: 16px;">
                            <h2 style="color: #60a5fa; text-align: center;">🔐 Telegram Doğrulama Kodu</h2>
                            <p style="text-align: center; color: #94a3b8;">Telegram hesabınızı ÇMYO.AI'ye bağlamak için aşağıdaki kodu Telegram'da bota gönderin:</p>
                            <div style="text-align: center; margin: 25px 0;">
                                <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #60a5fa; background: #1e293b; padding: 15px 30px; border-radius: 12px; border: 1px solid #334155;">${code}</span>
                            </div>
                            <p style="text-align: center; color: #64748b; font-size: 12px;">Bu kod 10 dakika geçerlidir.</p>
                            <hr style="border-color: #1e293b; margin: 20px 0;" />
                            <p style="text-align: center; color: #475569; font-size: 11px;">ÇMYO.AI — Çiçekdağı Meslek Yüksekokulu</p>
                        </div>
                    `,
                });

                await sendTelegramMessage(chatId,
                    `✅ Doğrulama kodu *${email}* adresine gönderildi.\n\n` +
                    `📩 E-postanızdaki 8 haneli kodu buraya yazın.`
                );
            } catch (emailError) {
                console.error('Telegram link email error:', emailError);
                await sendTelegramMessage(chatId,
                    '⚠️ Doğrulama kodu gönderilemedi. Lütfen daha sonra tekrar deneyin.'
                );
            }

            return NextResponse.json({ ok: true });
        }

        // --- CHECK IF CODE VERIFICATION (8-digit number) ---
        if (/^\d{8}$/.test(text)) {
            // Rate limit: chatId başına 10 dakikada 3 deneme
            const codeRateCheck = await checkRateLimit(`telegram_code:${chatId}`, RATE_LIMITS.telegramCode);
            if (!codeRateCheck.allowed) {
                await sendTelegramMessage(chatId, `⚠️ Çok fazla hatalı deneme. ${codeRateCheck.resetIn} saniye sonra tekrar deneyin.`);
                return NextResponse.json({ ok: true });
            }

            try {
                const userResult = await sql`
                    SELECT id, name, surname, email, telegram_link_code
                    FROM users WHERE telegram_chat_id = ${chatId} AND telegram_linked = FALSE
                `;

                if (userResult.rows.length > 0) {
                    const user = userResult.rows[0];
                    if (user.telegram_link_code === text) {
                        // Code matches — link the account!
                        await sql`
                            UPDATE users 
                            SET telegram_linked = TRUE, telegram_link_code = NULL
                            WHERE id = ${user.id}
                        `;

                        await sendTelegramMessage(chatId,
                            `🎉 *Hesabınız başarıyla bağlandı!*\n\n` +
                            `👤 ${user.name} ${user.surname}\n` +
                            `📧 ${user.email}\n\n` +
                            `Artık doğrudan mesaj yazarak ÇMYO.AI asistanını kullanabilirsiniz.`
                        );
                        return NextResponse.json({ ok: true });
                    } else {
                        await sendTelegramMessage(chatId, '❌ Yanlış doğrulama kodu. Lütfen tekrar deneyin.');
                        return NextResponse.json({ ok: true });
                    }
                }
            } catch (e) {
                console.error('Code verification error:', e);
            }
            // If no pending verification, fall through to chat
        }

        // --- CHECK IF USER IS LINKED ---
        let linkedUser: any = null;
        try {
            const userResult = await sql`
                SELECT id, name, surname, email, role, title, academic_unit, daily_message_count, last_message_date
                FROM users WHERE telegram_chat_id = ${chatId} AND telegram_linked = TRUE
            `;
            if (userResult.rows.length > 0) {
                linkedUser = userResult.rows[0];
            }
        } catch (e) {
            console.error('User lookup error:', e);
        }

        if (!linkedUser) {
            await sendTelegramMessage(chatId,
                `🔒 Bu botu kullanmak için hesabınızı bağlamalısınız.\n\n` +
                `👉 /baglanti e-posta@ahievran.edu.tr`
            );
            return NextResponse.json({ ok: true });
        }

        // --- QUOTA CHECK ---
        const role = linkedUser.role || 'student';
        let remainingQuota: number | null = null;

        if (role !== 'admin') {
            let { daily_message_count, last_message_date } = linkedUser;
            const todayStr = new Date().toDateString();
            const lastDateStr = last_message_date ? new Date(last_message_date).toDateString() : '';

            if (todayStr !== lastDateStr) {
                daily_message_count = 0;
            }

            if (daily_message_count >= 100) {
                await sendTelegramMessage(chatId,
                    '⚠️ Günlük mesaj limitinize (100) ulaştınız. Yarın tekrar deneyebilirsiniz.'
                );
                return NextResponse.json({ ok: true });
            }
            remainingQuota = 100 - (daily_message_count + 1);
        }

        // --- SEND TYPING ACTION ---
        await sendTypingAction(chatId);

        // --- RAG + AI GENERATION ---
        logChatDebug(`--- Telegram Chat Request from ${linkedUser.email} ---`);

        const sanitizedText = sanitizeUserMessage(text.slice(0, 4000));
        const relevantDocs = await findRelevantDocuments(sanitizedText);
        logChatDebug(`Found ${relevantDocs.length} relevant docs for Telegram.`);

        const context = buildContext(relevantDocs);
        const user = {
            name: linkedUser.name,
            surname: linkedUser.surname,
            title: linkedUser.title,
            department: linkedUser.academic_unit,
            studentNo: null,
        };

        const systemPrompt = buildSystemPrompt(user, role, context, null) +
            '\n\nÖNEMLİ: Bu mesaj Telegram üzerinden geldi. Cevaplarını Telegram\'a uygun formatta ver. JSON_START/JSON_END blokları KULLANMA çünkü Telegram\'da dosya indirme özelliği yok. Bunun yerine kullanıcıyı web sitesine yönlendir.';

        let reply = '';
        try {
            reply = await generateWithOpenAI(sanitizedText, systemPrompt, []);
        } catch (error: any) {
            console.error('Telegram AI generation failed:', error);
            await sendTelegramMessage(chatId, '⚠️ Bir hata oluştu. Lütfen tekrar deneyin.');
            return NextResponse.json({ ok: true });
        }

        // Clean up JSON blocks if AI still generates them
        reply = reply.replace(/JSON_START[\s\S]*?JSON_END/g, '').trim();
        if (!reply) reply = 'Bir yanıt oluşturulamadı. Lütfen tekrar deneyin.';

        // --- UPDATE QUOTA ---
        if (role !== 'admin' && remainingQuota !== null) {
            try {
                const newCount = 100 - remainingQuota;
                await sql`
                    UPDATE users 
                    SET daily_message_count = ${newCount}, last_message_date = CURRENT_TIMESTAMP
                    WHERE id = ${linkedUser.id};
                `;
            } catch (e) {
                console.error('Quota update error:', e);
            }
        }

        // --- SEND REPLY ---
        // Add quota info for non-admin users
        let finalReply = reply;
        if (role !== 'admin' && remainingQuota !== null && remainingQuota <= 10) {
            finalReply += `\n\n⚠️ _Kalan mesaj hakkınız: ${remainingQuota}/100_`;
        }

        await sendTelegramMessage(chatId, finalReply);
        return NextResponse.json({ ok: true });

    } catch (error: any) {
        console.error('Telegram webhook error:', error);
        return NextResponse.json({ ok: true }); // Always return 200 to Telegram
    }
}
