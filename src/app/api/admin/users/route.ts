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
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');
    const search = searchParams.get('search') || '';
    const searchPattern = `%${search}%`;

    try {
        const result = await sql`
            SELECT u.id, u.name, u.surname, u.email, u.role, u.title,
                   u.academic_unit, u.created_at, u.email_verified,
                   COUNT(c.id)::text AS conversation_count
            FROM users u
            LEFT JOIN conversations c ON c.user_email = u.email
            WHERE u.role != 'admin'
              AND (
                ${search} = ''
                OR u.name ILIKE ${searchPattern}
                OR u.surname ILIKE ${searchPattern}
                OR u.email ILIKE ${searchPattern}
              )
            GROUP BY u.id
            ORDER BY u.created_at DESC
            LIMIT ${limit} OFFSET ${offset}
        `;

        const countResult = await sql`
            SELECT COUNT(*)::text AS total
            FROM users
            WHERE role != 'admin'
              AND (
                ${search} = ''
                OR name ILIKE ${searchPattern}
                OR surname ILIKE ${searchPattern}
                OR email ILIKE ${searchPattern}
              )
        `;

        return NextResponse.json({
            users: result.rows,
            total: parseInt(countResult.rows[0].total),
        });
    } catch (error: any) {
        console.error('Admin users GET error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
