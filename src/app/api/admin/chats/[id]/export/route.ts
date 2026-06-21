import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { getSession } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limiter';
import { buildTranscriptDocx, buildContentDisposition } from '@/lib/transcript-docx';

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session || session.role !== 'admin') {
            logger.audit('UNAUTHORIZED_ADMIN_ACCESS', { path: '/api/admin/chats/[id]/export' });
            return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 403 });
        }

        const rl = await checkRateLimit(`admin:${session.email}`, RATE_LIMITS.admin);
        if (!rl.allowed) return NextResponse.json({ error: `Çok fazla istek. ${rl.resetIn} sn sonra deneyin.` }, { status: 429 });

        const { id } = await params;

        const convResult = await sql`
            SELECT id, user_email, title, created_at, updated_at
            FROM conversations
            WHERE id = ${id}
        `;
        if (convResult.rows.length === 0) {
            return NextResponse.json({ error: 'Sohbet bulunamadı' }, { status: 404 });
        }
        const conv = convResult.rows[0];

        const msgResult = await sql`
            SELECT role, content, created_at
            FROM messages
            WHERE conversation_id = ${id}
            ORDER BY created_at ASC
        `;

        logger.audit('ADMIN_CHAT_EXPORT', { admin: session.email, conversationId: id, user: conv.user_email });

        const buffer = await buildTranscriptDocx({
            userEmail: conv.user_email,
            exportedBy: session.email,
            conversations: [{
                title: conv.title,
                created_at: conv.created_at,
                messages: msgResult.rows as any,
            }],
        });

        const local = String(conv.user_email).split('@')[0] || 'kullanici';
        const date = new Date().toISOString().slice(0, 10);
        const filename = `sohbet_${local}_${date}.docx`;

        return new NextResponse(new Uint8Array(buffer), {
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'Content-Disposition': buildContentDisposition(filename),
            },
        });
    } catch (error) {
        console.error('Chat export error:', error);
        return NextResponse.json({ error: 'Belge oluşturulurken hata oluştu.' }, { status: 500 });
    }
}
