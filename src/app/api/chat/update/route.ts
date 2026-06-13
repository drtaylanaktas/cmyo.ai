import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

export async function PATCH(request: Request) {
    try {
        const { id, title, isPinned } = await request.json();

        if (!id) {
            return NextResponse.json({ error: 'ID required' }, { status: 400 });
        }

        // E-posta doğrulanmış oturumdan alınır (body'den değil).
        const session = await getSession();
        if (!session?.email) {
            return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 });
        }
        const email = session.email;

        // Construct update query dynamically based on provided fields
        if (title !== undefined && isPinned !== undefined) {
            await sql`
                UPDATE conversations
                SET title = ${title}, is_pinned = ${isPinned}, updated_at = NOW()
                WHERE id = ${id} AND user_email = ${email};
            `;
        } else if (title !== undefined) {
            await sql`
                UPDATE conversations
                SET title = ${title}, updated_at = NOW()
                WHERE id = ${id} AND user_email = ${email};
            `;
        } else if (isPinned !== undefined) {
            await sql`
                UPDATE conversations
                SET is_pinned = ${isPinned}, updated_at = NOW()
                WHERE id = ${id} AND user_email = ${email};
            `;
        }

        return NextResponse.json({ message: 'Conversation updated' });
    } catch (error: any) {
        return NextResponse.json({ error: 'Sohbet güncellenirken bir hata oluştu.' }, { status: 500 });
    }
}
