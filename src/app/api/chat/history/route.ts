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
            SELECT id, title, created_at
            FROM conversations
            WHERE user_email = ${email}
            ORDER BY updated_at DESC
            LIMIT 5;
        `;
        return NextResponse.json({ history: result.rows });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
