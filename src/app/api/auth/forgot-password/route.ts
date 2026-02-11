import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import nodemailer from 'nodemailer';

export async function POST(request: Request) {
    try {
        const { email } = await request.json();

        // 1. Check if user exists
        const user = await sql`SELECT * FROM users WHERE email = ${email}`;
        if (user.rows.length === 0) {
            return NextResponse.json({ error: 'Bu e-posta adresiyle kayıtlı kullanıcı bulunamadı.' }, { status: 404 });
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
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
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
                from: process.env.SMTP_FROM || '"KAEU.AI Asistan" <noreply@kaeu.ai>',
                to: email,
                subject: 'KAEU.AI Şifre Sıfırlama İsteği',
                html: `
                    <h1>Şifre Sıfırlama</h1>
                    <p>Hesabınız için şifre sıfırlama talebinde bulundunuz.</p>
                    <p>Şifrenizi yenilemek için aşağıdaki bağlantıya tıklayın:</p>
                    <a href="${resetLink}">Şifremi Sıfırla</a>
                    <p>Bu bağlantı 1 saat süreyle geçerlidir.</p>
                `,
            });
        }

        return NextResponse.json({ message: 'Şifre sıfırlama bağlantısı e-posta adresinize gönderildi.' }, { status: 200 });

    } catch (error: any) {
        console.error('Forgot password error:', error);
        return NextResponse.json({ error: 'Bir hata oluştu.' }, { status: 500 });
    }
}
