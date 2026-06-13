import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    if (!id) {
        return NextResponse.json({ error: 'ID required' }, { status: 400 });
    }

    // Oturum doğrulaması — yalnızca giriş yapmış kullanıcı kendi sohbetini görebilir.
    const session = await getSession();
    if (!session?.email) {
        return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 });
    }

    try {
        // Sahiplik kontrolü: konuşma bu kullanıcıya mı ait? (IDOR koruması)
        const owner = await sql`
            SELECT id FROM conversations
            WHERE id = ${id} AND user_email = ${session.email}
            LIMIT 1;
        `;
        if (owner.rows.length === 0) {
            // Admin kendi olmayan sohbetleri de okuyabilir
            if (session.role !== 'admin') {
                return NextResponse.json({ error: 'Bu sohbete erişim yetkiniz yok.' }, { status: 403 });
            }
        }

        const result = await sql`
            SELECT id, role, content, created_at
            FROM messages
            WHERE conversation_id = ${id}
            ORDER BY created_at ASC;
        `;

        // Transform to Message format expected by frontend
        const messages = result.rows.map((row: any) => ({
            id: row.id,
            role: row.role,
            content: row.content,
            createdAt: row.created_at
        }));

        return NextResponse.json({ messages });
    } catch (error: any) {
        console.error('Error fetching messages:', error);
        return NextResponse.json({ error: 'Sunucu hatası.' }, { status: 500 });
    }
}
