import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { createToken, createSessionCookie } from '@/lib/auth';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/rate-limiter';

export async function POST(request: Request) {
    try {
        // Rate limiting
        const ip = getClientIP(request);
        const rateCheck = await checkRateLimit(`login:${ip}`, RATE_LIMITS.login);
        if (!rateCheck.allowed) {
            return NextResponse.json(
                { error: `Çok fazla giriş denemesi. ${rateCheck.resetIn} saniye sonra tekrar deneyin.` },
                { status: 429 }
            );
        }

        const { email, password } = await request.json();

        if (!email || !password) {
            return NextResponse.json({ error: 'E-posta ve şifre gereklidir.' }, { status: 400 });
        }

        // Check if user exists
        const userResult = await sql`SELECT * FROM users WHERE email = ${email}`;

        if (userResult.rows.length === 0) {
            // Generic message to prevent user enumeration
            return NextResponse.json({ error: 'E-posta veya şifre hatalı.' }, { status: 401 });
        }

        const user = userResult.rows[0];

        // Verify password
        const passwordMatch = await bcrypt.compare(password, user.password);

        if (!passwordMatch) {
            // Same generic message
            return NextResponse.json({ error: 'E-posta veya şifre hatalı.' }, { status: 401 });
        }

        // Check if email is verified
        if (!user.email_verified) {
            return NextResponse.json({
                error: 'E-posta adresiniz doğrulanmamış. Lütfen gelen kutunuzu kontrol edin.'
            }, { status: 403 });
        }

        // Create JWT token
        const token = await createToken({
            email: user.email,
            name: user.name,
            surname: user.surname,
            role: user.role,
            title: user.title || undefined,
            academicUnit: user.academic_unit || undefined,
        });

        // Return user info (excluding password)
        const userResponse = {
            name: user.name,
            surname: user.surname,
            email: user.email,
            role: user.role,
            title: user.title,
            academicUnit: user.academic_unit,
            avatar: user.avatar
        };

        const response = NextResponse.json({ user: userResponse }, { status: 200 });

        // Set httpOnly secure cookie
        response.headers.set('Set-Cookie', createSessionCookie(token));

        return response;
    } catch (error: any) {
        console.error('Login error:', error);
        return NextResponse.json({ error: 'Giriş sırasında bir hata oluştu.' }, { status: 500 });
    }
}
