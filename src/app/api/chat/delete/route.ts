import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

export async function DELETE(request: Request) {
    try {
        const { id } = await request.json();

        if (!id) {
            return NextResponse.json({ error: 'ID required' }, { status: 400 });
        }

        // E-posta artık body'den değil, doğrulanmış oturumdan alınır (kimlik sahteciliği koruması).
        const session = await getSession();
        if (!session?.email) {
            return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 });
        }

        // Sahiplik koşulu sorgunun içinde — yalnızca kendi sohbetini silebilir.
        await sql`
            DELETE FROM conversations
            WHERE id = ${id} AND user_email = ${session.email};
        `;

        return NextResponse.json({ message: 'Conversation deleted' });
    } catch (error: any) {
        return NextResponse.json({ error: 'Sohbet silinirken bir hata oluştu.' }, { status: 500 });
    }
}
