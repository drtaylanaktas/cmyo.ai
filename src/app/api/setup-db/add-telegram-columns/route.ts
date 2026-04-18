import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
    if (process.env.NODE_ENV === 'production') {
        const url = new URL(req.url);
        const secret = url.searchParams.get('secret');
        if (secret !== process.env.CRON_SECRET) {
            return NextResponse.json({ error: 'Bu endpoint production ortamında yetkilendirme gerektirir.' }, { status: 403 });
        }
    }
    try {
        // Add telegram_chat_id column
        await sql`
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS telegram_chat_id BIGINT;
        `;

        // Add telegram_linked column
        await sql`
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS telegram_linked BOOLEAN DEFAULT FALSE;
        `;

        // Add telegram_link_code column (8-digit code)
        await sql`
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS telegram_link_code VARCHAR(8);
        `;

        // Add active_telegram_conversation_id for conversation tracking
        await sql`
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS active_telegram_conversation_id UUID;
        `;

        // Add telegram_history columns (legacy, kept for backward compatibility)
        await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_history JSONB DEFAULT '[]'::jsonb`;
        await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_history_updated_at TIMESTAMPTZ`;

        return NextResponse.json({
            message: 'Telegram sütunları başarıyla eklendi: telegram_chat_id, telegram_linked, telegram_link_code, active_telegram_conversation_id',
            success: true
        });
    } catch (error: any) {
        console.error('Migration error:', error);
        return NextResponse.json({
            error: 'Migration hatası: ' + error.message,
            success: false
        }, { status: 500 });
    }
}
