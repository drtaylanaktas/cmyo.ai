import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import bcrypt from 'bcryptjs';
import { getSession } from '@/lib/auth';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limiter';

export async function POST(req: Request) {
    try {
        // Auth check
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Oturum açmanız gerekiyor.' }, { status: 401 });
        }

        // Rate limit: 5 deneme/saat
        const rateCheck = await checkRateLimit(`changePassword:${session.email}`, RATE_LIMITS.changePassword);
        if (!rateCheck.allowed) {
            return NextResponse.json(
                { error: `Çok fazla deneme. ${rateCheck.resetIn} saniye sonra tekrar deneyin.` },
                { status: 429 }
            );
        }

        const { currentPassword, newPassword, confirmPassword } = await req.json();

        // Input validation
        if (!currentPassword || !newPassword || !confirmPassword) {
            return NextResponse.json({ error: 'Tüm alanlar zorunludur.' }, { status: 400 });
        }
        if (newPassword !== confirmPassword) {
            return NextResponse.json({ error: 'Yeni şifreler eşleşmiyor.' }, { status: 400 });
        }
        if (newPassword.length < 8) {
            return NextResponse.json({ error: 'Yeni şifre en az 8 karakter olmalıdır.' }, { status: 400 });
        }
        if (!/[A-Z]/.test(newPassword)) {
            return NextResponse.json({ error: 'Yeni şifre en az 1 büyük harf içermelidir.' }, { status: 400 });
        }
        if (!/[!@#$%^&*(),.?":{}|<>]/.test(newPassword)) {
            return NextResponse.json({ error: 'Yeni şifre en az 1 özel karakter içermelidir.' }, { status: 400 });
        }

        // Mevcut şifreyi DB'den çek
        const result = await sql`SELECT password FROM users WHERE email = ${session.email}`;
        if (result.rows.length === 0) {
            return NextResponse.json({ error: 'Kullanıcı bulunamadı.' }, { status: 404 });
        }

        // Mevcut şifreyi doğrula
        const passwordMatch = await bcrypt.compare(currentPassword, result.rows[0].password);
        if (!passwordMatch) {
            return NextResponse.json({ error: 'Mevcut şifreniz yanlış.' }, { status: 400 });
        }

        // Yeni şifreyi hash'le ve güncelle
        const hashedPassword = await bcrypt.hash(newPassword, 12);
        await sql`UPDATE users SET password = ${hashedPassword} WHERE email = ${session.email}`;

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('Change password error:', error);
        return NextResponse.json({ error: 'Bir hata oluştu, lütfen tekrar deneyin.' }, { status: 500 });
    }
}
