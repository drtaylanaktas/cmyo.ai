import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { getSession } from '@/lib/auth';

async function requireAdmin() {
    const session = await getSession();
    if (!session || session.role !== 'admin') return null;
    return session;
}

export async function GET(req: Request) {
    const session = await requireAdmin();
    if (!session) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const email = searchParams.get('email');
    if (!email) return NextResponse.json({ error: 'E-posta gerekli.' }, { status: 400 });

    try {
        const result = await sql`
            SELECT c.id, c.title, c.created_at, c.updated_at,
                   COUNT(m.id)::text AS message_count
            FROM conversations c
            LEFT JOIN messages m ON m.conversation_id = c.id
            WHERE c.user_email = ${email}
            GROUP BY c.id
            ORDER BY c.updated_at DESC
        `;

        return NextResponse.json({ conversations: result.rows });
    } catch (error: any) {
        console.error('Admin user conversations error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
