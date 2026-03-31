import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { getSession } from '@/lib/auth';
import { logger } from '@/lib/logger';

export async function GET(request: Request) {
    try {
        // Protect route
        const session = await getSession();
        if (!session || session.role !== 'admin') {
            logger.audit('UNAUTHORIZED_ADMIN_ACCESS', { path: '/api/admin/chats' });
            return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 403 });
        }

        logger.audit('ADMIN_CHATS_LIST', { admin: session.email });

        const { searchParams } = new URL(request.url);
        const limitStr = searchParams.get('limit') || '50';
        const offsetStr = searchParams.get('offset') || '0';
        
        const limit = parseInt(limitStr, 10);
        const offset = parseInt(offsetStr, 10);

        // Fetch conversations with the count of messages inline
        const query = sql`
            SELECT 
                c.id, 
                c.user_email, 
                c.title, 
                c.created_at, 
                c.updated_at,
                COUNT(m.id) as message_count
            FROM conversations c
            LEFT JOIN messages m ON c.id = m.conversation_id
            GROUP BY c.id
            ORDER BY c.updated_at DESC
            LIMIT ${limit} OFFSET ${offset}
        `;
        
        const countQuery = sql`
            SELECT count(*) as total FROM conversations
        `;

        const [dataResult, countResult] = await Promise.all([query, countQuery]);

        return NextResponse.json({
            conversations: dataResult.rows,
            total: parseInt(countResult.rows[0].total, 10),
            limit,
            offset
        });

    } catch (error) {
        console.error('Error fetching chats:', error);
        return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 });
    }
}
