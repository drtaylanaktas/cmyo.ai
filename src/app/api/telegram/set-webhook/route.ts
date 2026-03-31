import { NextResponse } from 'next/server';

export async function GET(req: Request) {
    try {
        const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
        if (!TELEGRAM_BOT_TOKEN) {
            return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN ortam değişkeni tanımlı değil.' }, { status: 500 });
        }

        // Determine webhook URL from request
        const url = new URL(req.url);
        const webhookUrl = `${url.protocol}//${url.host}/api/telegram/webhook`;

        // Set webhook with Telegram API
        const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: webhookUrl,
                allowed_updates: ['message'],
                drop_pending_updates: true,
            }),
        });

        const data = await res.json();

        if (data.ok) {
            return NextResponse.json({
                success: true,
                message: 'Webhook başarıyla ayarlandı!',
                webhook_url: webhookUrl,
                telegram_response: data,
            });
        } else {
            return NextResponse.json({
                success: false,
                error: 'Webhook ayarlanamadı.',
                telegram_response: data,
            }, { status: 500 });
        }
    } catch (error: any) {
        console.error('Set webhook error:', error);
        return NextResponse.json({ error: 'Webhook ayarlanırken bir hata oluştu.' }, { status: 500 });
    }
}
