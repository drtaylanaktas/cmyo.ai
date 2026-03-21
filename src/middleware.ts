import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

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
];

// Routes that are always public
const publicRoutes = [
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/forgot-password',
    '/api/auth/reset-password',
    '/api/auth/verify',
    '/api/setup-db',
    '/api/debug',
    '/api/uploadthing',
];

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Only check API routes
    if (!pathname.startsWith('/api/')) {
        return NextResponse.next();
    }

    // Allow public routes
    if (publicRoutes.some(route => pathname.startsWith(route))) {
        return NextResponse.next();
    }

    // Check for session cookie on protected routes
    if (protectedRoutes.some(route => pathname.startsWith(route))) {
        const sessionToken = request.cookies.get('cmyo_session')?.value;

        if (!sessionToken) {
            return NextResponse.json(
                { error: 'Oturum bulunamadı. Lütfen giriş yapın.' },
                { status: 401 }
            );
        }

        // Note: Full JWT verification happens in the route handler (jose needs async)
        // Middleware just checks cookie existence for fast rejection
    }

    // Add security headers to all API responses
    const response = NextResponse.next();
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-XSS-Protection', '1; mode=block');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

    return response;
}

export const config = {
    matcher: ['/api/:path*'],
};
