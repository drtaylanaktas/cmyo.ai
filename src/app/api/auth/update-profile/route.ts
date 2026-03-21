import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

export async function POST(request: Request) {
    try {
        // Verify JWT session — only allow updating own profile
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Oturum bulunamadı.' }, { status: 401 });
        }

        const { name, surname, title, avatar } = await request.json();

        if (!name || !surname) {
            return NextResponse.json({ error: 'İsim ve soyisim gereklidir.' }, { status: 400 });
        }

        // Validate input lengths
        if (name.length > 50 || surname.length > 50) {
            return NextResponse.json({ error: 'İsim veya soyisim çok uzun.' }, { status: 400 });
        }

        if (title && title.length > 100) {
            return NextResponse.json({ error: 'Ünvan çok uzun.' }, { status: 400 });
        }

        // Use email from JWT — user can only update their own profile
        await sql`
            UPDATE users 
            SET name = ${name}, surname = ${surname}, title = ${title || null}, avatar = ${avatar || null}
            WHERE email = ${session.email};
        `;

        return NextResponse.json({ message: 'Profil güncellendi.' });
    } catch (error: any) {
        console.error('Profile update error:', error);
        return NextResponse.json({ error: 'Profil güncellenirken bir hata oluştu.' }, { status: 500 });
    }
}
