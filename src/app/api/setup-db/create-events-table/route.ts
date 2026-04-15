import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

export async function GET() {
    if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Bu endpoint production ortamında devre dışıdır.' }, { status: 403 });
    }
    try {
        await sql`
            CREATE TABLE IF NOT EXISTS events (
                id SERIAL PRIMARY KEY,
                external_url TEXT UNIQUE NOT NULL,
                title TEXT NOT NULL,
                description TEXT,
                event_date DATE,
                event_date_text TEXT,
                source TEXT DEFAULT 'ahievran-etkinlik',
                scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;

        await sql`
            CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date);
        `;

        return NextResponse.json({
            message: 'events tablosu ve idx_events_date index başarıyla oluşturuldu.',
            success: true,
        });
    } catch (error: any) {
        console.error('Migration error:', error);
        return NextResponse.json({
            error: 'Migration hatası: ' + error.message,
            success: false,
        }, { status: 500 });
    }
}
