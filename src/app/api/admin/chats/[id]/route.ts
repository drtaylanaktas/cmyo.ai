import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { getSession } from '@/lib/auth';
import { logger } from '@/lib/logger';

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        // Protect route
        const session = await getSession();
        if (!session || session.role !== 'admin') {
            logger.audit('UNAUTHORIZED_ADMIN_ACCESS', { path: '/api/admin/chats/[id]' });
            return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 403 });
        }

        const { id } = await params;

        logger.audit('ADMIN_CHAT_READ', { admin: session.email, conversationId: id });

        // Fetch conversation details
        const convResult = await sql`
            SELECT id, user_email, title, created_at, updated_at
            FROM conversations
            WHERE id = ${id}
        `;

        if (convResult.rows.length === 0) {
            return NextResponse.json({ error: 'Sohbet bulunamadı' }, { status: 404 });
        }

        // Fetch messages for this conversation
        const msgResult = await sql`
            SELECT id, role, content, created_at
            FROM messages
            WHERE conversation_id = ${id}
            ORDER BY created_at ASC
        `;

        return NextResponse.json({
            conversation: convResult.rows[0],
            messages: msgResult.rows
        });

    } catch (error) {
        console.error('Error fetching chat details:', error);
        return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 });
    }
}
