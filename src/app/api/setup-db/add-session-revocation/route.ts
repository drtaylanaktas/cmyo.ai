import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

export async function GET() {
    if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Bu endpoint production ortamında devre dışıdır.' }, { status: 403 });
    }
    try {
        await sql`
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS last_logout_at TIMESTAMP WITH TIME ZONE;
        `;
        return NextResponse.json({ message: 'last_logout_at kolonu eklendi.', success: true });
    } catch (error: any) {
        console.error('Migration error:', error);
        return NextResponse.json({ error: 'Migration hatası: ' + error.message, success: false }, { status: 500 });
    }
}
