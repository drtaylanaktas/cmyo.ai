import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { sendVerificationEmail } from '@/lib/email';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/rate-limiter';

export async function POST(request: Request) {
    try {
        const ip = getClientIP(request);
        const rateCheck = await checkRateLimit(`resend-verification:${ip}`, RATE_LIMITS.forgotPassword);
        if (!rateCheck.allowed) {
            return NextResponse.json(
                { error: `Çok fazla deneme. ${rateCheck.resetIn} saniye sonra tekrar deneyin.` },
                { status: 429 }
            );
        }

        const { email } = await request.json();

        if (!email) {
            return NextResponse.json({ error: 'E-posta adresi gereklidir.' }, { status: 400 });
        }

        const userResult = await sql`SELECT id, email_verified, verification_token FROM users WHERE email = ${email}`;

        // Generic response to prevent user enumeration
        if (userResult.rows.length === 0) {
            return NextResponse.json({ message: 'Eğer bu e-posta kayıtlıysa ve doğrulanmamışsa, yeni bir doğrulama maili gönderildi.' });
        }

        const user = userResult.rows[0];

        if (user.email_verified) {
            return NextResponse.json({ error: 'Bu hesap zaten doğrulanmış.' }, { status: 400 });
        }

        const newToken = crypto.randomBytes(32).toString('hex');

        await sql`UPDATE users SET verification_token = ${newToken} WHERE email = ${email}`;

        const sent = await sendVerificationEmail(email, newToken);

        if (!sent) {
            return NextResponse.json(
                { error: 'Mail gönderilemedi. Lütfen birkaç dakika sonra tekrar deneyin veya yöneticiyle iletişime geçin.' },
                { status: 500 }
            );
        }

        return NextResponse.json({ message: 'Doğrulama maili gönderildi. Gelen kutusu ve spam klasörünü kontrol edin.' });
    } catch (error) {
        console.error('Resend verification error:', error);
        return NextResponse.json({ error: 'Bir hata oluştu. Lütfen tekrar deneyin.' }, { status: 500 });
    }
}
