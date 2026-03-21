import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

export async function POST(request: Request) {
    try {
        const { token, newPassword } = await request.json();

        if (!token || !newPassword) {
            return NextResponse.json({ error: 'Token ve yeni şifre gereklidir.' }, { status: 400 });
        }

        // Validate password strength
        if (newPassword.length < 8) {
            return NextResponse.json({ error: 'Şifre en az 8 karakter olmalıdır.' }, { status: 400 });
        }

        // Find user by token
        const userResult = await sql`SELECT id, email, reset_token_expiry FROM users WHERE reset_token = ${token}`;

        if (userResult.rows.length === 0) {
            return NextResponse.json({ error: 'Geçersiz veya süresi dolmuş bağlantı.' }, { status: 400 });
        }

        const user = userResult.rows[0];

        // Check expiry
        const expiryDate = new Date(user.reset_token_expiry);
        if (new Date() > expiryDate) {
            return NextResponse.json({ error: 'Bağlantının süresi dolmuş. Lütfen yeni bir sıfırlama talebi oluşturun.' }, { status: 400 });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 12);

        // Update password and clear token
        await sql`
            UPDATE users 
            SET password = ${hashedPassword}, reset_token = NULL, reset_token_expiry = NULL
            WHERE id = ${user.id}
        `;

        return NextResponse.json({ message: 'Şifreniz başarıyla güncellendi.' }, { status: 200 });

    } catch (error: any) {
        console.error('Reset password error:', error);
        return NextResponse.json({ error: 'Şifre sıfırlanırken bir hata oluştu.' }, { status: 500 });
    }
}
