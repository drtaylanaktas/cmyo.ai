import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { getSession } from '@/lib/auth';

async function requireAdmin() {
    const session = await getSession();
    if (!session || session.role !== 'admin') return null;
    return session;
}

export async function GET() {
    const session = await requireAdmin();
    if (!session) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 });

    try {
        const result = await sql`
            SELECT
                dr.id,
                dr.user_email,
                dr.user_name,
                dr.requested_at,
                dr.status,
                dr.reviewed_at,
                dr.reviewed_by,
                u.role,
                u.academic_unit
            FROM deletion_requests dr
            LEFT JOIN users u ON u.email = dr.user_email
            ORDER BY
                CASE dr.status WHEN 'pending' THEN 0 ELSE 1 END,
                dr.requested_at DESC
        `;
        return NextResponse.json({ requests: result.rows });
    } catch (error: any) {
        console.error('Admin deletions GET error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PATCH(req: Request) {
    const session = await requireAdmin();
    if (!session) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 });

    try {
        const { id, action } = await req.json();
        if (!id || !['approve', 'reject'].includes(action)) {
            return NextResponse.json({ error: 'Geçersiz istek.' }, { status: 400 });
        }

        // İsteğin e-postasını bul
        const reqResult = await sql`SELECT user_email FROM deletion_requests WHERE id = ${id}`;
        if (reqResult.rows.length === 0) {
            return NextResponse.json({ error: 'İstek bulunamadı.' }, { status: 404 });
        }
        const userEmail = reqResult.rows[0].user_email;

        if (action === 'approve') {
            // Kullanıcıyı ve ilgili verileri sil
            await sql`DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE user_email = ${userEmail})`;
            await sql`DELETE FROM conversations WHERE user_email = ${userEmail}`;
            await sql`DELETE FROM users WHERE email = ${userEmail}`;
            await sql`
                UPDATE deletion_requests
                SET status = 'approved', reviewed_at = NOW(), reviewed_by = ${session.email}
                WHERE id = ${id}
            `;
        } else {
            await sql`
                UPDATE deletion_requests
                SET status = 'rejected', reviewed_at = NOW(), reviewed_by = ${session.email}
                WHERE id = ${id}
            `;
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Admin deletions PATCH error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
