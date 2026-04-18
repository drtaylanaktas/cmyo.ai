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
        await sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`;

        await sql`
            CREATE TABLE IF NOT EXISTS conversations (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_email VARCHAR(255) NOT NULL REFERENCES users(email),
                title VARCHAR(255) NOT NULL,
                channel VARCHAR(20) DEFAULT 'web',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `;

        await sql`
            ALTER TABLE conversations ADD COLUMN IF NOT EXISTS channel VARCHAR(20) DEFAULT 'web';
        `;

        await sql`
            CREATE TABLE IF NOT EXISTS messages (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
                role VARCHAR(50) NOT NULL,
                content TEXT NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `;

        return NextResponse.json({ message: 'Chat tables created/updated successfully.' }, { status: 200 });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
