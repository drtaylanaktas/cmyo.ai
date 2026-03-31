import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

export async function GET() {
    if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Bu endpoint production ortamında devre dışıdır.' }, { status: 403 });
    }
    try {
        // Add terms_accepted and terms_accepted_at columns to users table
        await sql`
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS terms_accepted BOOLEAN DEFAULT FALSE;
        `;

        await sql`
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMP;
        `;

        return NextResponse.json({
            message: 'Sütunlar başarıyla eklendi: terms_accepted, terms_accepted_at',
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
