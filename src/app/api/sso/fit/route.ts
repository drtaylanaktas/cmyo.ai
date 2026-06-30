/**
 * GET /api/sso/fit
 *
 * ÇMYO.AI → ÇMYO.AI FİT tek oturum (SSO) devri.
 * Oturum açık kullanıcı için kısa ömürlü, SSO_SHARED_SECRET ile imzalı bir
 * devir token'ı üretir ve FİT'in /api/sso ucuna yönlendirir. FİT bu token'ı
 * doğrulayıp kullanıcıyı (e-postaya göre) otomatik oturum açar — ikinci kayıt yok.
 *
 * Oturum yoksa: cmyoai.com giriş sayfasına (?next ile) yönlendirir; böylece
 * kayıt/giriş daima cmyoai.com'da olur.
 */
import { NextResponse } from 'next/server';
import { SignJWT } from 'jose';
import { getSession } from '@/lib/auth';

export const runtime = 'nodejs';

const FIT_SSO_ENDPOINT = 'https://fizyo.cmyoai.com/api/sso';

export async function GET(request: Request) {
    const session = await getSession();

    // Oturum yoksa → cmyoai.com girişi (giriş sonrası tekrar buraya döner)
    if (!session) {
        return NextResponse.redirect(new URL('/login?next=/api/sso/fit', request.url));
    }

    const secret = process.env.SSO_SHARED_SECRET;
    if (!secret) {
        console.error('[sso/fit] SSO_SHARED_SECRET tanımlı değil');
        // Yapılandırma eksik — kullanıcıyı FİT ana sayfasına bırak (kendi geçidi devreye girer)
        return NextResponse.redirect('https://fizyo.cmyoai.com');
    }

    const key = new TextEncoder().encode(secret);
    const token = await new SignJWT({
        email: session.email,
        name: session.name,
        surname: session.surname,
        role: session.role,
    })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setAudience('cmyo-fit')
        .setExpirationTime('90s')
        .sign(key);

    const dest = new URL(FIT_SSO_ENDPOINT);
    dest.searchParams.set('token', token);
    return NextResponse.redirect(dest.toString());
}
