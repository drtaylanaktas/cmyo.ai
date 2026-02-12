import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');

    if (!email) {
        return NextResponse.json({ error: 'Email required' }, { status: 400 });
    }

    try {
        const result = await sql`
            SELECT id, title, created_at, is_pinned
            FROM conversations
            WHERE user_email = ${email}
            ORDER BY is_pinned DESC, updated_at DESC
            LIMIT 20;
        `;
        return NextResponse.json({ history: result.rows });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
