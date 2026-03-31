import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

export async function GET() {
    if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Bu endpoint production ortamında devre dışıdır.' }, { status: 403 });
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

        return NextResponse.json({
            message: 'Telegram sütunları başarıyla eklendi: telegram_chat_id, telegram_linked, telegram_link_code',
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
