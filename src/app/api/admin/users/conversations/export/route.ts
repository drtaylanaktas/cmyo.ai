import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { getSession } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limiter';
import { buildTranscriptDocx, buildContentDisposition, TranscriptConversation } from '@/lib/transcript-docx';

export async function GET(req: Request) {
    try {
        const session = await getSession();
        if (!session || session.role !== 'admin') {
            logger.audit('UNAUTHORIZED_ADMIN_ACCESS', { path: '/api/admin/users/conversations/export' });
            return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 403 });
        }

        const rl = await checkRateLimit(`admin:${session.email}`, RATE_LIMITS.admin);
        if (!rl.allowed) return NextResponse.json({ error: `Çok fazla istek. ${rl.resetIn} sn sonra deneyin.` }, { status: 429 });

        const email = new URL(req.url).searchParams.get('email');
        if (!email) return NextResponse.json({ error: 'E-posta gerekli.' }, { status: 400 });

        // Tüm sohbet + mesajlar tek sorguda; JS'te sohbete göre gruplanır.
        const { rows } = await sql`
            SELECT c.id AS conv_id, c.title AS conv_title, c.created_at AS conv_created,
                   m.role, m.content, m.created_at AS msg_created
            FROM conversations c
            LEFT JOIN messages m ON m.conversation_id = c.id
            WHERE c.user_email = ${email}
            ORDER BY c.created_at ASC, m.created_at ASC
        `;

        // Grupla (sohbet sırası korunur)
        const byConv = new Map<string, TranscriptConversation>();
        for (const r of rows as any[]) {
            let conv = byConv.get(r.conv_id);
            if (!conv) {
                conv = { title: r.conv_title, created_at: r.conv_created, messages: [] };
                byConv.set(r.conv_id, conv);
            }
            // LEFT JOIN → mesajsız sohbette role NULL gelebilir; atla.
            if (r.role) {
                conv.messages.push({ role: r.role, content: r.content, created_at: r.msg_created });
            }
        }

        logger.audit('ADMIN_USER_CHATS_EXPORT', { admin: session.email, user: email, conversationCount: byConv.size });

        const buffer = await buildTranscriptDocx({
            userEmail: email,
            exportedBy: session.email,
            conversations: [...byConv.values()],
        });

        const local = email.split('@')[0] || 'kullanici';
        const date = new Date().toISOString().slice(0, 10);
        const filename = `sohbet_gecmisi_${local}_${date}.docx`;

        return new NextResponse(new Uint8Array(buffer), {
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'Content-Disposition': buildContentDisposition(filename),
            },
        });
    } catch (error) {
        console.error('User chats export error:', error);
        return NextResponse.json({ error: 'Belge oluşturulurken hata oluştu.' }, { status: 500 });
    }
}
