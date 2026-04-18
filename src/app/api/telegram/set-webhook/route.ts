import { NextResponse } from 'next/server';

const TELEGRAM_API = (token: string) => `https://api.telegram.org/bot${token}`;

export async function GET(req: Request) {
    try {
        const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
        if (!TELEGRAM_BOT_TOKEN) {
            return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN ortam değişkeni tanımlı değil.' }, { status: 500 });
        }

        const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
        if (!TELEGRAM_WEBHOOK_SECRET) {
            return NextResponse.json({ error: 'TELEGRAM_WEBHOOK_SECRET ortam değişkeni tanımlı değil.' }, { status: 500 });
        }

        const url = new URL(req.url);
        const webhookUrl = `${url.protocol}//${url.host}/api/telegram/webhook`;
        const api = TELEGRAM_API(TELEGRAM_BOT_TOKEN);

        // Set webhook with secret token
        const webhookRes = await fetch(`${api}/setWebhook`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: webhookUrl,
                secret_token: TELEGRAM_WEBHOOK_SECRET,
                allowed_updates: ['message', 'callback_query'],
                drop_pending_updates: true,
            }),
        });
        const webhookData = await webhookRes.json();

        // Register bot commands
        const commandsRes = await fetch(`${api}/setMyCommands`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                commands: [
                    { command: 'yenisohbet', description: 'Yeni sohbet başlat' },
                    { command: 'gecmis', description: 'Son konuşmalar' },
                    { command: 'baglanti', description: 'Hesap bağla' },
                    { command: 'durum', description: 'Bağlantı durumu' },
                    { command: 'kopar', description: 'Hesap bağlantısını kaldır' },
                    { command: 'yardim', description: 'Yardım menüsü' },
                ],
            }),
        });
        const commandsData = await commandsRes.json();

        if (webhookData.ok) {
            return NextResponse.json({
                success: true,
                message: 'Webhook ve bot komutları başarıyla ayarlandı!',
                webhook_url: webhookUrl,
                telegram_response: webhookData,
                commands_response: commandsData,
            });
        } else {
            return NextResponse.json({
                success: false,
                error: 'Webhook ayarlanamadı.',
                telegram_response: webhookData,
            }, { status: 500 });
        }
    } catch (error: any) {
        console.error('Set webhook error:', error);
        return NextResponse.json({ error: 'Webhook ayarlanırken bir hata oluştu.' }, { status: 500 });
    }
}
