import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

/**
 * Kullanıcının kendi sohbet geçmişini döndürür.
 * GÜVENLİK: e-posta query param'ından ALINMAZ — yalnız oturumdaki kullanıcının
 * kaydı döndürülür (IDOR önlemi). Aksi hâlde herkes başkasının geçmişini okurdu.
 */
export async function GET() {
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 401 });
    }

    try {
        const result = await sql`
            SELECT id, title, created_at, is_pinned
            FROM conversations
            WHERE user_email = ${session.email}
            ORDER BY is_pinned DESC, updated_at DESC
            LIMIT 20;
        `;
        return NextResponse.json({ history: result.rows });
    } catch {
        return NextResponse.json({ error: 'Geçmiş yüklenirken bir hata oluştu.' }, { status: 500 });
    }
}
