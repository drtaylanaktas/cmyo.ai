import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/auth';

export async function POST() {
    const response = NextResponse.json({ message: 'Çıkış yapıldı.' }, { status: 200 });
    response.headers.set('Set-Cookie', clearSessionCookie());
    return response;
}
