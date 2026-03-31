import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

export async function GET() {
    if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Bu endpoint production ortamında devre dışıdır.' }, { status: 403 });
    }
    try {
        await sql`
            ALTER TABLE conversations 
            ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE;
        `;

        return NextResponse.json({ message: 'Conversation table updated successfully (added is_pinned).' }, { status: 200 });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
