import { NextResponse } from 'next/server';
import { clearSessionCookie, getSession, invalidateUserSessions } from '@/lib/auth';

export async function POST() {
    // Mevcut oturumu al ve DB'de geçersiz kıl
    const session = await getSession();
    if (session?.email) {
        await invalidateUserSessions(session.email);
    }

    const response = NextResponse.json({ message: 'Çıkış yapıldı.' }, { status: 200 });
    response.headers.set('Set-Cookie', clearSessionCookie());
    return response;
}
