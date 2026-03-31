import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

// Routes that require authentication
const protectedRoutes = [
    '/api/chat',
    '/api/chat/history',
    '/api/chat/delete',
    '/api/chat/update',
    '/api/upload-and-parse',
    '/api/generate-file',
    '/api/generate-pdf',
    '/api/auth/update-profile',
    '/api/admin',
];

// Routes that are always public
const publicRoutes = [
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/forgot-password',
    '/api/auth/reset-password',
    '/api/auth/verify',
    '/api/auth/logout',
    '/api/setup-db',
    '/api/debug',
    '/api/uploadthing',
    '/api/telegram/webhook',
];

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    if (!pathname.startsWith('/api/')) {
        return NextResponse.next();
    }

    if (publicRoutes.some(route => pathname.startsWith(route))) {
        return addSecurityHeaders(NextResponse.next());
    }

    if (protectedRoutes.some(route => pathname.startsWith(route))) {
        const sessionToken = request.cookies.get('cmyo_session')?.value;

        if (!sessionToken) {
            return NextResponse.json(
                { error: 'Oturum bulunamadı. Lütfen giriş yapın.' },
                { status: 401 }
            );
        }

        // Edge Runtime'da JWT doğrula — sadece imza ve süre kontrolü
        // (last_logout_at revocation kontrolü route handler'da yapılıyor)
        if (!process.env.JWT_SECRET) {
            return NextResponse.json({ error: 'Sunucu yapılandırma hatası.' }, { status: 500 });
        }

        try {
            const secret = new TextEncoder().encode(process.env.JWT_SECRET);
            await jwtVerify(sessionToken, secret, { algorithms: ['HS256'] });
        } catch {
            return NextResponse.json(
                { error: 'Geçersiz veya süresi dolmuş oturum. Lütfen tekrar giriş yapın.' },
                { status: 401 }
            );
        }
    }

    return addSecurityHeaders(NextResponse.next());
}

function addSecurityHeaders(response: NextResponse): NextResponse {
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-XSS-Protection', '1; mode=block');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    return response;
}

export const config = {
    matcher: ['/api/:path*'],
};
