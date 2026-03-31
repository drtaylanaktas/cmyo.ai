import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

export async function GET() {
    if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Bu endpoint production ortamında devre dışıdır.' }, { status: 403 });
    }
    try {
        await sql`
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255),
            ADD COLUMN IF NOT EXISTS reset_token_expiry TIMESTAMP WITH TIME ZONE,
            ADD COLUMN IF NOT EXISTS daily_message_count INTEGER DEFAULT 0,
            ADD COLUMN IF NOT EXISTS last_message_date TIMESTAMP WITH TIME ZONE;
        `;
        return NextResponse.json({ message: 'Users table updated successfully' }, { status: 200 });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
