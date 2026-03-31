import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/rate-limiter';

export async function POST(request: Request) {
    try {
        // Rate limiting
        const ip = getClientIP(request);
        const rateCheck = await checkRateLimit(`forgot:${ip}`, RATE_LIMITS.forgotPassword);
        if (!rateCheck.allowed) {
            return NextResponse.json(
                { error: `Çok fazla istek. ${rateCheck.resetIn} saniye sonra tekrar deneyin.` },
                { status: 429 }
            );
        }

        const { email } = await request.json();

        // Always return success to prevent user enumeration
        const successMessage = 'Eğer bu e-posta adresiyle kayıtlı bir hesap varsa, şifre sıfırlama bağlantısı gönderildi.';

        // 1. Check if user exists (silently)
        const user = await sql`SELECT * FROM users WHERE email = ${email}`;
        if (user.rows.length === 0) {
            // Return success even if email not found (anti-enumeration)
            return NextResponse.json({ message: successMessage }, { status: 200 });
        }

        // 2. Generate Reset Token
        const resetToken = crypto.randomBytes(32).toString('hex');
        // Token expires in 1 hour
        const expiryDate = new Date(Date.now() + 3600000);

        // 3. Save Token to Database
        await sql`
            UPDATE users 
            SET reset_token = ${resetToken}, reset_token_expiry = ${expiryDate.toISOString()}
            WHERE email = ${email}
        `;

        // 4. Create Reset Link
        // Use environment variable for base URL or default to localhost in dev
        // 4. Create Reset Link
        // Use environment variable for base URL or default to localhost in dev
        // FALLBACK: If NEXT_PUBLIC_APP_URL is not set (e.g. in Vercel preview), try to use VERCEL_URL
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
        const resetLink = `${baseUrl}/reset-password?token=${resetToken}`;

        // 5. Send Email (or Log to Console if no SMTP config)
        console.log('---------------------------------------------------');
        console.log('PASSWORD RESET LINK GENERATED:');
        console.log(`Email: ${email}`);
        console.log(`Link: ${resetLink}`);
        console.log('---------------------------------------------------');

        // Check for SMTP config
        if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
            const transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST,
                port: Number(process.env.SMTP_PORT) || 587,
                secure: false, // true for 465, false for other ports
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS,
                },
            });

            await transporter.sendMail({
                from: process.env.SMTP_FROM || '"ÇMYO.AI Asistan" <noreply@cmyo.ai>',
                to: email,
                subject: 'ÇMYO.AI Şifre Sıfırlama İsteği',
                html: `
                    <h1>Şifre Sıfırlama</h1>
                    <p>Hesabınız için şifre sıfırlama talebinde bulundunuz.</p>
                    <p>Şifrenizi yenilemek için aşağıdaki bağlantıya tıklayın:</p>
                    <a href="${resetLink}">Şifremi Sıfırla</a>
                    <p>Bu bağlantı 1 saat süreyle geçerlidir.</p>
                `,
            });
        }

        return NextResponse.json({ message: successMessage }, { status: 200 });

    } catch (error: any) {
        console.error('Forgot password error:', error);
        return NextResponse.json({ error: 'Bir hata oluştu.' }, { status: 500 });
    }
}
