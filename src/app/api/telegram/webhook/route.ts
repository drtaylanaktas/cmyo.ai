import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { findRelevantDocuments, generateWithOpenAI, buildSystemPrompt, buildContext, logChatDebug, sanitizeUserMessage } from '@/lib/chat-engine';
import { parseDocument } from '@/lib/file-parser';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limiter';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || '';
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

const SUPPORTED_DOCUMENT_TYPES: Record<string, string> = {
    'application/pdf': 'PDF',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
    'application/vnd.ms-excel': 'XLS',
};

const SUGGESTION_BUTTONS = {
    inline_keyboard: [
        [{ text: '📅 Ders programı nedir?', callback_data: 'suggest:Ders programı hakkında bilgi verir misin?' }],
        [{ text: '📋 Staj başvurusu nasıl yapılır?', callback_data: 'suggest:Staj başvurusu nasıl yapılır?' }],
        [{ text: '🏫 Kayıt işlemleri', callback_data: 'suggest:Kayıt işlemleri hakkında bilgi verir misin?' }],
    ],
};

const PERSISTENT_KEYBOARD = {
    keyboard: [
        [{ text: '📝 Yeni Sohbet' }, { text: '📚 Geçmiş' }, { text: '❓ Yardım' }],
    ],
    resize_keyboard: true,
    one_time_keyboard: false,
};

// ─── Telegram API helpers ────────────────────────────────────────

function escapeMarkdownV2(text: string): string {
    return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

function convertToTelegramMarkdown(text: string): string {
    let result = text;

    // Preserve code blocks first (don't escape inside them)
    const codeBlocks: string[] = [];
    result = result.replace(/```([\s\S]*?)```/g, (_, code) => {
        codeBlocks.push(code);
        return `%%CODEBLOCK_${codeBlocks.length - 1}%%`;
    });

    const inlineCodes: string[] = [];
    result = result.replace(/`([^`]+)`/g, (_, code) => {
        inlineCodes.push(code);
        return `%%INLINECODE_${inlineCodes.length - 1}%%`;
    });

    // Convert markdown headers to bold text
    result = result.replace(/^#{1,6}\s+(.+)$/gm, (_, heading) => `**${heading.trim()}**`);

    // Convert markdown tables to plain text
    result = result.replace(/\|(.+)\|/g, (match) => {
        return match.replace(/\|/g, ' │ ').replace(/\s*-+\s*/g, '').trim();
    });
    result = result.replace(/^\s*│\s*-+[\s│-]*$/gm, '');

    // Convert bold **text** → *text* (Telegram bold)
    result = result.replace(/\*\*(.+?)\*\*/g, (_, content) => `*${content}*`);

    // Convert links [text](url) — keep as is (supported in MarkdownV2)
    const links: string[] = [];
    result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, linkText, url) => {
        links.push(`[${escapeMarkdownV2(linkText)}](${url.replace(/\)/g, '\\)')})`);
        return `%%LINK_${links.length - 1}%%`;
    });

    // Escape special MarkdownV2 characters in remaining text
    result = escapeMarkdownV2(result);

    // Restore preserved elements (unescape them)
    result = result.replace(/%%CODEBLOCK_(\d+)%%/g, (_, i) => `\`\`\`\n${codeBlocks[parseInt(i)]}\n\`\`\``);
    result = result.replace(/%%INLINECODE_(\d+)%%/g, (_, i) => `\`${inlineCodes[parseInt(i)]}\``);
    result = result.replace(/%%LINK_(\d+)%%/g, (_, i) => links[parseInt(i)]);

    // Fix double-escaped bold markers
    result = result.replace(/\\\*/g, '*');

    return result;
}

function splitTelegramMessage(text: string, maxLen: number = 4096): string[] {
    if (text.length <= maxLen) return [text];

    const parts: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
        if (remaining.length <= maxLen) {
            parts.push(remaining);
            break;
        }

        let splitIndex = maxLen;

        // Try to split at paragraph boundary
        const paragraphBreak = remaining.lastIndexOf('\n\n', maxLen);
        if (paragraphBreak > maxLen * 0.3) {
            splitIndex = paragraphBreak;
        } else {
            // Try line break
            const lineBreak = remaining.lastIndexOf('\n', maxLen);
            if (lineBreak > maxLen * 0.3) {
                splitIndex = lineBreak;
            }
        }

        // Don't split inside code blocks
        const beforeSplit = remaining.slice(0, splitIndex);
        const openCodeBlocks = (beforeSplit.match(/```/g) || []).length;
        if (openCodeBlocks % 2 !== 0) {
            const codeEnd = remaining.indexOf('```', splitIndex);
            if (codeEnd !== -1 && codeEnd < maxLen * 1.5) {
                splitIndex = codeEnd + 3;
            }
        }

        parts.push(remaining.slice(0, splitIndex).trim());
        remaining = remaining.slice(splitIndex).trim();
    }

    return parts;
}

async function sendTelegramMessage(
    chatId: number,
    text: string,
    options: {
        parseMode?: string;
        replyMarkup?: any;
        retryPlain?: boolean;
    } = {}
) {
    const { parseMode = 'MarkdownV2', replyMarkup, retryPlain = true } = options;

    const parts = splitTelegramMessage(text);

    for (let i = 0; i < parts.length; i++) {
        const partText = parseMode === 'MarkdownV2' ? convertToTelegramMarkdown(parts[i]) : parts[i];
        const isLast = i === parts.length - 1;

        const payload: any = {
            chat_id: chatId,
            text: partText,
        };
        if (parseMode) payload.parse_mode = parseMode;
        if (isLast && replyMarkup) payload.reply_markup = replyMarkup;

        try {
            const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                const errorData = await res.json();
                if (retryPlain && errorData.description?.includes('parse')) {
                    // Retry without formatting
                    const plainPayload: any = { chat_id: chatId, text: parts[i] };
                    if (isLast && replyMarkup) plainPayload.reply_markup = replyMarkup;
                    await fetch(`${TELEGRAM_API}/sendMessage`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(plainPayload),
                    });
                } else {
                    console.error('Telegram sendMessage error:', errorData);
                }
            }
        } catch (error) {
            console.error('Failed to send Telegram message:', error);
        }

        if (i < parts.length - 1) {
            await new Promise(r => setTimeout(r, 300));
        }
    }
}

async function sendTelegramDocument(
    chatId: number,
    fileSource: string | Buffer,
    filename: string,
    caption?: string
) {
    try {
        if (typeof fileSource === 'string') {
            const res = await fetch(`${TELEGRAM_API}/sendDocument`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, document: fileSource, caption: caption || '' }),
            });
            if (!res.ok) console.error('Telegram sendDocument (URL) error:', await res.json());
        } else {
            const formData = new FormData();
            formData.append('chat_id', String(chatId));
            formData.append('document', new Blob([new Uint8Array(fileSource)]), filename);
            if (caption) formData.append('caption', caption);
            const res = await fetch(`${TELEGRAM_API}/sendDocument`, { method: 'POST', body: formData });
            if (!res.ok) console.error('Telegram sendDocument (buffer) error:', await res.json());
        }
    } catch (e) {
        console.error('sendTelegramDocument failed:', e);
    }
}

async function sendTypingAction(chatId: number) {
    try {
        await fetch(`${TELEGRAM_API}/sendChatAction`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, action: 'typing' }),
        });
    } catch (_) {}
}

async function answerCallbackQuery(callbackQueryId: string, text?: string) {
    try {
        await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
        });
    } catch (_) {}
}

async function downloadTelegramFile(fileId: string): Promise<Buffer | null> {
    try {
        const fileRes = await fetch(`${TELEGRAM_API}/getFile`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file_id: fileId }),
        });
        const fileData = await fileRes.json();
        if (!fileData.ok || !fileData.result?.file_path) return null;

        const downloadRes = await fetch(`https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${fileData.result.file_path}`);
        if (!downloadRes.ok) return null;

        return Buffer.from(await downloadRes.arrayBuffer());
    } catch (e) {
        console.error('downloadTelegramFile failed:', e);
        return null;
    }
}

// ─── File action parser ──────────────────────────────────────────

function parseFileAction(reply: string): { filename: string | null; cleanReply: string } {
    const match = reply.match(/JSON_START\s*([\s\S]*?)\s*JSON_END/);
    if (!match) return { filename: null, cleanReply: reply.trim() };
    try {
        const parsed = JSON.parse(match[1]);
        const filename = parsed.action === 'generate_file' ? parsed.filename : null;
        const cleanReply = reply.replace(/JSON_START[\s\S]*?JSON_END/g, '').trim();
        return { filename, cleanReply };
    } catch {
        return { filename: null, cleanReply: reply.replace(/JSON_START[\s\S]*?JSON_END/g, '').trim() };
    }
}

// ─── File resolver (DB → local → generate) ──────────────────────

async function resolveFile(filename: string, requestOrigin: string): Promise<{
    source: string | Buffer;
    resolvedFilename: string;
} | null> {
    const searchTerm = '%' + filename.replace(/\.[^.]+$/, '').trim() + '%';

    try {
        let result = await sql`
            SELECT file_url, filename FROM knowledge_documents
            WHERE filename ILIKE ${filename} LIMIT 1
        `;
        if (result.rows.length === 0) {
            result = await sql`
                SELECT file_url, filename FROM knowledge_documents
                WHERE filename ILIKE ${searchTerm} AND file_url IS NOT NULL LIMIT 1
            `;
        }
        if (result.rows.length > 0 && result.rows[0].file_url) {
            return { source: result.rows[0].file_url, resolvedFilename: result.rows[0].filename };
        }
    } catch (_) {}

    // Local file lookup in src/data/
    try {
        const dataDir = path.join(process.cwd(), 'src/data');
        const files = fs.readdirSync(dataDir);
        const found = files.find(f =>
            f.normalize('NFC').toLowerCase() === filename.normalize('NFC').toLowerCase()
        );
        if (found) {
            const buffer = fs.readFileSync(path.join(dataDir, found));
            return { source: buffer, resolvedFilename: found };
        }
    } catch (_) {}

    try {
        const res = await fetch(`${requestOrigin}/api/generate-file`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-internal-secret': process.env.CRON_SECRET || '',
            },
            body: JSON.stringify({ filename }),
        });
        if (res.ok) {
            const buffer = Buffer.from(await res.arrayBuffer());
            return { source: buffer, resolvedFilename: filename };
        }
    } catch (_) {}

    return null;
}

// ─── Conversation management ─────────────────────────────────────

type HistoryMessage = { role: 'user' | 'assistant'; content: string };

async function getOrCreateConversation(
    userId: string,
    userEmail: string,
    activeConvId: string | null,
    lastUpdated: Date | null
): Promise<{ conversationId: string; history: HistoryMessage[]; isNew: boolean }> {
    const INACTIVITY_MS = 30 * 60 * 1000;

    // Check if active conversation is still valid (within 30min)
    if (activeConvId && lastUpdated) {
        const elapsed = Date.now() - new Date(lastUpdated).getTime();
        if (elapsed < INACTIVITY_MS) {
            const historyResult = await sql`
                SELECT role, content FROM messages
                WHERE conversation_id = ${activeConvId}
                ORDER BY created_at ASC
            `;
            const history = historyResult.rows.map(r => ({
                role: r.role as 'user' | 'assistant',
                content: r.content,
            })).slice(-20);
            return { conversationId: activeConvId, history, isNew: false };
        }
    }

    // Create new conversation
    const result = await sql`
        INSERT INTO conversations (user_email, title, channel)
        VALUES (${userEmail}, 'Telegram Sohbet', 'telegram')
        RETURNING id;
    `;
    const newId = result.rows[0].id;

    await sql`
        UPDATE users SET active_telegram_conversation_id = ${newId}
        WHERE id = ${userId}
    `;

    return { conversationId: newId, history: [], isNew: true };
}

async function saveMessage(conversationId: string, role: 'user' | 'assistant', content: string) {
    await sql`
        INSERT INTO messages (conversation_id, role, content)
        VALUES (${conversationId}, ${role}, ${content})
    `;
    await sql`
        UPDATE conversations SET updated_at = NOW() WHERE id = ${conversationId}
    `;
}

// ─── Command handlers ────────────────────────────────────────────

async function handleStartCommand(chatId: number, firstName: string) {
    await sendTelegramMessage(chatId,
        `🎓 *ÇMYO\\.AI Telegram Asistanı*\n\n` +
        `Merhaba ${escapeMarkdownV2(firstName)}\\! Çiçekdağı Meslek Yüksekokulu yapay zeka asistanına hoş geldiniz\\.\n\n` +
        `Bu botu kullanabilmek için önce ÇMYO\\.AI hesabınızı bağlamanız gerekiyor\\.\n\n` +
        `📌 *Komutlar:*\n` +
        `/baglanti \`e\\-posta\` — Hesabınızı bağlayın\n` +
        `/durum — Bağlantı durumunuzu kontrol edin\n` +
        `/yardim — Yardım menüsü`,
        { parseMode: 'MarkdownV2' }
    );
}

async function handleHelpCommand(chatId: number) {
    await sendTelegramMessage(chatId,
        `📚 ÇMYO.AI Yardım\n\n` +
        `Bu bot, Çiçekdağı MYO hakkında sorularınıza yapay zeka destekli yanıtlar verir.\n\n` +
        `Neler sorabilirsiniz:\n` +
        `• Ders programı\n` +
        `• Staj süreçleri\n` +
        `• Kayıt işlemleri\n` +
        `• Akademik takvim\n` +
        `• Yemekhane, ulaşım bilgileri\n` +
        `• ve daha fazlası...\n\n` +
        `Komutlar:\n` +
        `/yenisohbet — Yeni sohbet başlat\n` +
        `/gecmis — Son konuşmalar\n` +
        `/baglanti e-posta — Hesap bağlama\n` +
        `/durum — Bağlantı durumu\n` +
        `/kopar — Hesap bağlantısını kaldır\n\n` +
        `⚠️ Yapay zeka yanıtlarını resmi kaynaklardan doğrulayın.`,
        { parseMode: '', replyMarkup: PERSISTENT_KEYBOARD }
    );
}

async function handleStatusCommand(chatId: number) {
    try {
        const userResult = await sql`
            SELECT name, surname, email, role, telegram_linked
            FROM users WHERE telegram_chat_id = ${chatId}
        `;
        if (userResult.rows.length > 0 && userResult.rows[0].telegram_linked) {
            const u = userResult.rows[0];
            const roleText = u.role === 'academic' ? 'Akademisyen' : (u.role === 'admin' ? 'Admin' : 'Öğrenci');
            await sendTelegramMessage(chatId,
                `✅ Hesabınız bağlı\n\n` +
                `👤 ${u.name} ${u.surname}\n` +
                `📧 ${u.email}\n` +
                `🎓 ${roleText}`,
                { parseMode: '', replyMarkup: PERSISTENT_KEYBOARD }
            );
        } else {
            await sendTelegramMessage(chatId,
                `❌ Hesabınız henüz bağlı değil.\n\nBağlamak için: /baglanti e-posta@ahievran.edu.tr`,
                { parseMode: '' }
            );
        }
    } catch (e) {
        console.error('Status command error:', e);
        await sendTelegramMessage(chatId, '⚠️ Durum kontrol edilirken bir hata oluştu.', { parseMode: '' });
    }
}

async function handleUnlinkCommand(chatId: number) {
    try {
        await sql`
            UPDATE users
            SET telegram_chat_id = NULL, telegram_linked = FALSE, telegram_link_code = NULL,
                active_telegram_conversation_id = NULL
            WHERE telegram_chat_id = ${chatId}
        `;
        await sendTelegramMessage(chatId,
            '✅ Hesap bağlantınız kaldırıldı. Tekrar bağlamak için /baglanti komutunu kullanabilirsiniz.',
            { parseMode: '' }
        );
    } catch (e) {
        console.error('Unlink command error:', e);
        await sendTelegramMessage(chatId, '⚠️ Bağlantı kaldırılırken bir hata oluştu.', { parseMode: '' });
    }
}

async function handleLinkCommand(chatId: number, text: string) {
    const parts = text.split(' ');
    if (parts.length < 2) {
        await sendTelegramMessage(chatId,
            `📧 Lütfen e-posta adresinizi girin:\n\n/baglanti ornek@ahievran.edu.tr`,
            { parseMode: '' }
        );
        return;
    }

    const email = parts[1].toLowerCase().trim();

    if (!email.endsWith('@ahievran.edu.tr') && !email.endsWith('@ogr.ahievran.edu.tr')) {
        await sendTelegramMessage(chatId,
            '❌ Sadece @ahievran.edu.tr veya @ogr.ahievran.edu.tr uzantılı e-posta adresleri kabul edilmektedir.',
            { parseMode: '' }
        );
        return;
    }

    const userResult = await sql`SELECT id, name, surname, telegram_linked FROM users WHERE email = ${email}`;
    if (userResult.rows.length === 0) {
        await sendTelegramMessage(chatId,
            '❌ Bu e-posta adresi sistemde kayıtlı değil.\n\nÖnce cmyoai.com web sitesinden kayıt olmalısınız.',
            { parseMode: '' }
        );
        return;
    }

    if (userResult.rows[0].telegram_linked) {
        await sendTelegramMessage(chatId,
            '⚠️ Bu hesap zaten bir Telegram hesabına bağlı. Önce /kopar komutu ile mevcut bağlantıyı kaldırın.',
            { parseMode: '' }
        );
        return;
    }

    const code = crypto.randomInt(10000000, 99999999).toString();

    await sql`
        UPDATE users
        SET telegram_link_code = ${code}, telegram_chat_id = ${chatId}
        WHERE email = ${email}
    `;

    try {
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
            `✅ Doğrulama kodu ${email} adresine gönderildi.\n\n📩 E-postanızdaki 8 haneli kodu buraya yazın.`,
            { parseMode: '' }
        );
    } catch (emailError) {
        console.error('Telegram link email error:', emailError);
        await sendTelegramMessage(chatId,
            '⚠️ Doğrulama kodu gönderilemedi. Lütfen daha sonra tekrar deneyin.',
            { parseMode: '' }
        );
    }
}

async function handleCodeVerification(chatId: number, code: string): Promise<boolean> {
    const codeRateCheck = await checkRateLimit(`telegram_code:${chatId}`, RATE_LIMITS.telegramCode);
    if (!codeRateCheck.allowed) {
        await sendTelegramMessage(chatId,
            `⚠️ Çok fazla hatalı deneme. ${codeRateCheck.resetIn} saniye sonra tekrar deneyin.`,
            { parseMode: '' }
        );
        return true;
    }

    const userResult = await sql`
        SELECT id, name, surname, email, telegram_link_code
        FROM users WHERE telegram_chat_id = ${chatId} AND telegram_linked = FALSE
    `;

    if (userResult.rows.length > 0) {
        const user = userResult.rows[0];
        if (user.telegram_link_code === code) {
            await sql`
                UPDATE users
                SET telegram_linked = TRUE, telegram_link_code = NULL
                WHERE id = ${user.id}
            `;
            await sendTelegramMessage(chatId,
                `🎉 Hesabınız başarıyla bağlandı!\n\n` +
                `👤 ${user.name} ${user.surname}\n` +
                `📧 ${user.email}\n\n` +
                `Artık doğrudan mesaj yazarak ÇMYO.AI asistanını kullanabilirsiniz.`,
                { parseMode: '', replyMarkup: PERSISTENT_KEYBOARD }
            );
            return true;
        } else {
            await sendTelegramMessage(chatId, '❌ Yanlış doğrulama kodu. Lütfen tekrar deneyin.', { parseMode: '' });
            return true;
        }
    }
    return false;
}

async function handleNewChatCommand(chatId: number, userId: string) {
    await sql`UPDATE users SET active_telegram_conversation_id = NULL WHERE id = ${userId}`;
    await sendTelegramMessage(chatId,
        '✅ Yeni sohbet başlatıldı. İlk sorunuzu yazabilirsiniz.',
        {
            parseMode: '',
            replyMarkup: {
                ...PERSISTENT_KEYBOARD,
                inline_keyboard: SUGGESTION_BUTTONS.inline_keyboard,
            },
        }
    );
}

async function handleHistoryCommand(chatId: number, userEmail: string) {
    try {
        const result = await sql`
            SELECT id, title, updated_at FROM conversations
            WHERE user_email = ${userEmail} AND channel = 'telegram'
            ORDER BY updated_at DESC
            LIMIT 5
        `;

        if (result.rows.length === 0) {
            await sendTelegramMessage(chatId,
                '📭 Henüz Telegram üzerinden bir sohbet geçmişiniz yok.',
                { parseMode: '', replyMarkup: PERSISTENT_KEYBOARD }
            );
            return;
        }

        const buttons = result.rows.map(row => {
            const date = new Date(row.updated_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
            const title = row.title.length > 30 ? row.title.substring(0, 30) + '...' : row.title;
            return [{ text: `📝 ${title} | ${date}`, callback_data: `history:${row.id}` }];
        });

        await sendTelegramMessage(chatId,
            '📚 Son konuşmalarınız:',
            {
                parseMode: '',
                replyMarkup: { inline_keyboard: buttons },
            }
        );
    } catch (e) {
        console.error('History command error:', e);
        await sendTelegramMessage(chatId, '⚠️ Geçmiş yüklenirken bir hata oluştu.', { parseMode: '' });
    }
}

// ─── Callback query handler ─────────────────────────────────────

async function handleCallbackQuery(callbackQuery: any) {
    const chatId = callbackQuery.message?.chat?.id;
    const data = callbackQuery.data;
    if (!chatId || !data) return;

    await answerCallbackQuery(callbackQuery.id);

    if (data.startsWith('history:')) {
        const convId = data.replace('history:', '');
        try {
            const userResult = await sql`
                SELECT id FROM users WHERE telegram_chat_id = ${chatId} AND telegram_linked = TRUE
            `;
            if (userResult.rows.length > 0) {
                await sql`
                    UPDATE users SET active_telegram_conversation_id = ${convId}
                    WHERE id = ${userResult.rows[0].id}
                `;

                const convResult = await sql`
                    SELECT title FROM conversations WHERE id = ${convId}
                `;
                const title = convResult.rows[0]?.title || 'Sohbet';

                await sendTelegramMessage(chatId,
                    `📝 "${title}" konuşmasına geçildi. Devam edebilirsiniz.`,
                    { parseMode: '', replyMarkup: PERSISTENT_KEYBOARD }
                );
            }
        } catch (e) {
            console.error('History callback error:', e);
            await sendTelegramMessage(chatId, '⚠️ Konuşmaya geçilirken bir hata oluştu.', { parseMode: '' });
        }
        return;
    }

    if (data.startsWith('suggest:')) {
        const question = data.replace('suggest:', '');
        // Process as a regular message by simulating it
        await processChat(chatId, question);
        return;
    }
}

// ─── Main chat processing ────────────────────────────────────────

async function processChat(chatId: number, text: string, attachmentContent?: string, attachmentImage?: string) {
    let linkedUser: any = null;
    try {
        const userResult = await sql`
            SELECT id, name, surname, email, role, title, academic_unit,
                   daily_message_count, last_message_date,
                   active_telegram_conversation_id
            FROM users WHERE telegram_chat_id = ${chatId} AND telegram_linked = TRUE
        `;
        if (userResult.rows.length > 0) {
            linkedUser = userResult.rows[0];
        }
    } catch (e) {
        console.error('User lookup error:', e);
        await sendTelegramMessage(chatId, '⚠️ Bir hata oluştu. Lütfen tekrar deneyin.', { parseMode: '' });
        return;
    }

    if (!linkedUser) {
        await sendTelegramMessage(chatId,
            `🔒 Bu botu kullanmak için hesabınızı bağlamalısınız.\n\n👉 /baglanti e-posta@ahievran.edu.tr`,
            { parseMode: '' }
        );
        return;
    }

    // Quota check
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
                '⚠️ Günlük mesaj limitinize (100) ulaştınız. Yarın tekrar deneyebilirsiniz.',
                { parseMode: '', replyMarkup: PERSISTENT_KEYBOARD }
            );
            return;
        }
        remainingQuota = 100 - (daily_message_count + 1);
    }

    // Start periodic typing indicator
    await sendTypingAction(chatId);
    const typingInterval = setInterval(() => sendTypingAction(chatId), 4000);

    try {
        logChatDebug(`--- Telegram Chat Request from ${linkedUser.email} ---`);

        // Get or create conversation
        let convUpdatedAt: Date | null = null;
        if (linkedUser.active_telegram_conversation_id) {
            try {
                const convCheck = await sql`
                    SELECT updated_at FROM conversations
                    WHERE id = ${linkedUser.active_telegram_conversation_id}
                `;
                if (convCheck.rows.length > 0) {
                    convUpdatedAt = convCheck.rows[0].updated_at;
                }
            } catch (_) {}
        }

        const { conversationId, history } = await getOrCreateConversation(
            linkedUser.id,
            linkedUser.email,
            linkedUser.active_telegram_conversation_id,
            convUpdatedAt
        );

        // Build message with attachment if present
        let fullMessage = text;
        if (attachmentContent) {
            fullMessage = `${text}\n\n[BELGE İÇERİĞİ BAŞLANGICI]\n${attachmentContent}\n[BELGE İÇERİĞİ SONU]`;
        }

        const sanitizedText = sanitizeUserMessage(fullMessage.slice(0, 4000));

        // Enrich RAG query with recent conversation context for follow-up questions
        let ragQuery = sanitizedText;
        if (history.length > 0) {
            const recentContext = history.slice(-4).map(m => m.content).join(' ');
            const keywords = recentContext.match(/FR-\d+|[A-ZÇĞİÖŞÜ][a-zçğıöşü]+\s(?:Formu|Belgesi|Programı|Tablosu)/g);
            if (keywords && keywords.length > 0) {
                ragQuery = `${sanitizedText} ${[...new Set(keywords)].join(' ')}`;
            }
        }
        const relevantDocs = await findRelevantDocuments(ragQuery);
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
            '\n\nÖNEMLİ TELEGRAM TALİMATLARI:\n' +
            '1. Bu mesaj Telegram üzerinden geldi.\n' +
            '2. Kullanıcı bir dosya istediğinde (indirmek, görmek, tekrar göndermek dahil) MUTLAKA şu formatı kullan:\n' +
            '   JSON_START {"action":"generate_file","filename":"TAM_DOSYA_ADI.uzantı"} JSON_END\n' +
            '3. Dosya adı olarak knowledge base\'deki tam ve eksiksiz dosya adını kullan. Asla kısaltma veya tahmin etme.\n' +
            '4. "Tekrar gönder", "dosyayı ver", "indir" gibi ifadelerde de JSON_START/JSON_END formatını KULLAN — önceki mesajlardaki dosya adını hatırla.\n' +
            '5. Dosya dışı cevaplarda normal Markdown kullan (başlıklar için kalın metin, listeler için • kullan).\n' +
            '6. Asla "aşağıda bulabilirsiniz" veya "indirme linki" gibi ifadeler kullanma — dosya otomatik gönderilecek, sadece JSON formatını yaz.';

        // Save user message
        await saveMessage(conversationId, 'user', sanitizedText);

        // Generate AI reply (with retry)
        let reply = '';
        try {
            reply = await generateWithOpenAI(sanitizedText, systemPrompt, history, attachmentImage);
        } catch (error: any) {
            console.error('Telegram AI generation failed (attempt 1):', error);
            try {
                reply = await generateWithOpenAI(sanitizedText, systemPrompt, history, attachmentImage);
            } catch (retryError: any) {
                console.error('Telegram AI generation failed (attempt 2):', retryError);
                await sendTelegramMessage(chatId,
                    '⚠️ Yapay zeka şu an meşgul. Lütfen 30 saniye sonra tekrar deneyin.',
                    { parseMode: '', replyMarkup: PERSISTENT_KEYBOARD }
                );
                return;
            }
        }

        // Parse file action
        const { filename: requestedFile, cleanReply } = parseFileAction(reply);
        let finalReply = cleanReply || (requestedFile ? 'Dosyanız hazırlanıyor...' : 'Bir yanıt oluşturulamadı. Lütfen tekrar deneyin.');

        // Save assistant message
        await saveMessage(conversationId, 'assistant', cleanReply || reply);

        // Update active conversation
        await sql`
            UPDATE users SET active_telegram_conversation_id = ${conversationId}
            WHERE id = ${linkedUser.id}
        `;

        // Update conversation title if new (use first message)
        const msgCount = await sql`
            SELECT COUNT(*) as cnt FROM messages WHERE conversation_id = ${conversationId} AND role = 'user'
        `;
        if (parseInt(msgCount.rows[0].cnt) === 1) {
            const title = text.length > 50 ? text.substring(0, 50) + '...' : text;
            await sql`UPDATE conversations SET title = ${title} WHERE id = ${conversationId}`;
        }

        // Update quota
        if (role !== 'admin' && remainingQuota !== null) {
            const newCount = 100 - remainingQuota;
            await sql`
                UPDATE users
                SET daily_message_count = ${newCount}, last_message_date = CURRENT_TIMESTAMP
                WHERE id = ${linkedUser.id}
            `;
        }

        // Append quota warning
        if (role !== 'admin' && remainingQuota !== null && remainingQuota <= 10) {
            finalReply += `\n\n⚠️ Kalan mesaj hakkınız: ${remainingQuota}/100`;
        }

        // Send reply with persistent keyboard
        await sendTelegramMessage(chatId, finalReply, {
            replyMarkup: PERSISTENT_KEYBOARD,
        });

        // Send file if requested
        if (requestedFile) {
            const origin = `https://${process.env.VERCEL_URL || 'cmyoai.com'}`;
            const resolved = await resolveFile(requestedFile, origin);
            if (resolved) {
                await sendTelegramDocument(chatId, resolved.source, resolved.resolvedFilename, resolved.resolvedFilename);
            } else {
                await sendTelegramMessage(chatId,
                    '📎 Dosya şu an erişilemiyor. Lütfen https://cmyoai.com adresinden giriş yaparak indirin.',
                    { parseMode: '' }
                );
            }
        }
    } finally {
        clearInterval(typingInterval);
    }
}

// ─── Main webhook handler ────────────────────────────────────────

export async function POST(req: Request) {
    try {
        // Webhook secret verification
        if (TELEGRAM_WEBHOOK_SECRET) {
            const secretHeader = req.headers.get('x-telegram-bot-api-secret-token');
            if (secretHeader !== TELEGRAM_WEBHOOK_SECRET) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
            }
        }

        const body = await req.json();

        // Handle callback queries (inline button presses)
        if (body.callback_query) {
            await handleCallbackQuery(body.callback_query);
            return NextResponse.json({ ok: true });
        }

        const message = body.message;
        if (!message) return NextResponse.json({ ok: true });

        // Reject bot messages
        if (message.from?.is_bot) return NextResponse.json({ ok: true });

        const chatId = message.chat.id;
        const telegramFirstName = message.from?.first_name || 'Kullanıcı';
        const text = (message.text || message.caption || '').trim();

        // ─── Handle keyboard button texts ────────────────────
        if (text === '📝 Yeni Sohbet') {
            const userResult = await sql`
                SELECT id FROM users WHERE telegram_chat_id = ${chatId} AND telegram_linked = TRUE
            `;
            if (userResult.rows.length > 0) {
                await handleNewChatCommand(chatId, userResult.rows[0].id);
            } else {
                await sendTelegramMessage(chatId, '🔒 Önce hesabınızı bağlayın: /baglanti e-posta@ahievran.edu.tr', { parseMode: '' });
            }
            return NextResponse.json({ ok: true });
        }
        if (text === '📚 Geçmiş') {
            const userResult = await sql`
                SELECT email FROM users WHERE telegram_chat_id = ${chatId} AND telegram_linked = TRUE
            `;
            if (userResult.rows.length > 0) {
                await handleHistoryCommand(chatId, userResult.rows[0].email);
            }
            return NextResponse.json({ ok: true });
        }
        if (text === '❓ Yardım') {
            await handleHelpCommand(chatId);
            return NextResponse.json({ ok: true });
        }

        // ─── Command routing ────────────────────────────────
        if (text === '/start') {
            await handleStartCommand(chatId, telegramFirstName);
            return NextResponse.json({ ok: true });
        }
        if (text === '/yardim') {
            await handleHelpCommand(chatId);
            return NextResponse.json({ ok: true });
        }
        if (text === '/durum') {
            await handleStatusCommand(chatId);
            return NextResponse.json({ ok: true });
        }
        if (text === '/kopar') {
            await handleUnlinkCommand(chatId);
            return NextResponse.json({ ok: true });
        }
        if (text.startsWith('/baglanti')) {
            await handleLinkCommand(chatId, text);
            return NextResponse.json({ ok: true });
        }
        if (text === '/yenisohbet') {
            const userResult = await sql`
                SELECT id FROM users WHERE telegram_chat_id = ${chatId} AND telegram_linked = TRUE
            `;
            if (userResult.rows.length > 0) {
                await handleNewChatCommand(chatId, userResult.rows[0].id);
            } else {
                await sendTelegramMessage(chatId, '🔒 Önce hesabınızı bağlayın: /baglanti e-posta@ahievran.edu.tr', { parseMode: '' });
            }
            return NextResponse.json({ ok: true });
        }
        if (text === '/gecmis') {
            const userResult = await sql`
                SELECT email FROM users WHERE telegram_chat_id = ${chatId} AND telegram_linked = TRUE
            `;
            if (userResult.rows.length > 0) {
                await handleHistoryCommand(chatId, userResult.rows[0].email);
            } else {
                await sendTelegramMessage(chatId, '🔒 Önce hesabınızı bağlayın: /baglanti e-posta@ahievran.edu.tr', { parseMode: '' });
            }
            return NextResponse.json({ ok: true });
        }

        // ─── 8-digit code verification ──────────────────────
        if (/^\d{8}$/.test(text)) {
            const handled = await handleCodeVerification(chatId, text);
            if (handled) return NextResponse.json({ ok: true });
        }

        // ─── Photo handling ─────────────────────────────────
        if (message.photo && message.photo.length > 0) {
            const photo = message.photo[message.photo.length - 1]; // Highest resolution
            const photoBuffer = await downloadTelegramFile(photo.file_id);
            if (photoBuffer) {
                const base64 = `data:image/jpeg;base64,${photoBuffer.toString('base64')}`;
                const caption = text || 'Bu görseli incele ve açıkla.';
                await processChat(chatId, caption, undefined, base64);
            } else {
                await sendTelegramMessage(chatId, '⚠️ Fotoğraf indirilemedi. Lütfen tekrar deneyin.', { parseMode: '' });
            }
            return NextResponse.json({ ok: true });
        }

        // ─── Document handling ──────────────────────────────
        if (message.document) {
            const doc = message.document;
            const mimeType = doc.mime_type || '';

            if (!SUPPORTED_DOCUMENT_TYPES[mimeType]) {
                const supported = Object.values(SUPPORTED_DOCUMENT_TYPES).join(', ');
                await sendTelegramMessage(chatId,
                    `⚠️ Bu dosya türü desteklenmiyor. Desteklenen türler: ${supported}`,
                    { parseMode: '' }
                );
                return NextResponse.json({ ok: true });
            }

            await sendTypingAction(chatId);

            const docBuffer = await downloadTelegramFile(doc.file_id);
            if (!docBuffer) {
                await sendTelegramMessage(chatId, '⚠️ Dosya indirilemedi. Lütfen tekrar deneyin.', { parseMode: '' });
                return NextResponse.json({ ok: true });
            }

            try {
                const extractedText = await parseDocument(docBuffer, mimeType);
                if (!extractedText || extractedText.length < 10) {
                    await sendTelegramMessage(chatId,
                        '⚠️ Dosyadan metin çıkarılamadı. Dosya boş veya taranmış (görsel) bir belge olabilir.',
                        { parseMode: '' }
                    );
                    return NextResponse.json({ ok: true });
                }

                const caption = text || `Bu ${SUPPORTED_DOCUMENT_TYPES[mimeType]} belgesini incele ve özetle.`;
                const truncatedContent = extractedText.slice(0, 3000);
                await processChat(chatId, caption, truncatedContent);
            } catch (parseError) {
                console.error('Document parsing error:', parseError);
                await sendTelegramMessage(chatId, '⚠️ Dosya içeriği okunamadı. Farklı bir format deneyin.', { parseMode: '' });
            }
            return NextResponse.json({ ok: true });
        }

        // ─── Regular text message ───────────────────────────
        if (!text) {
            return NextResponse.json({ ok: true });
        }

        await processChat(chatId, text);
        return NextResponse.json({ ok: true });

    } catch (error: any) {
        console.error('Telegram webhook error:', error);
        return NextResponse.json({ ok: true });
    }
}
