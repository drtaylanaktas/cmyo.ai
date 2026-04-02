import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { getSession } from '@/lib/auth';

export async function POST() {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Oturum açmanız gerekiyor.' }, { status: 401 });
        }

        // Tablo yoksa oluştur (ilk çalıştırmada)
        await sql`
            CREATE TABLE IF NOT EXISTS deletion_requests (
                id SERIAL PRIMARY KEY,
                user_email VARCHAR(255) NOT NULL,
                user_name VARCHAR(255),
                requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                status VARCHAR(20) DEFAULT 'pending',
                reviewed_at TIMESTAMP WITH TIME ZONE,
                reviewed_by VARCHAR(255)
            )
        `;

        // Zaten bekleyen istek var mı?
        const existing = await sql`
            SELECT id FROM deletion_requests
            WHERE user_email = ${session.email} AND status = 'pending'
        `;
        if (existing.rows.length > 0) {
            return NextResponse.json(
                { error: 'Hesabınız için zaten bekleyen bir silme talebi var.' },
                { status: 409 }
            );
        }

        const fullName = `${session.name || ''} ${session.surname || ''}`.trim();

        await sql`
            INSERT INTO deletion_requests (user_email, user_name)
            VALUES (${session.email}, ${fullName})
        `;

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('Request deletion error:', error);
        return NextResponse.json({ error: 'Bir hata oluştu, lütfen tekrar deneyin.' }, { status: 500 });
    }
}
