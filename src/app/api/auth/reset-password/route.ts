import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

export async function POST(request: Request) {
    try {
        const { token, newPassword } = await request.json();

        // 1. Find user by token and check expiry
        // Using current time compared to stored expiry
        // Note: reset_token_expiry > NOW()
        const user = await sql`
            SELECT * FROM users 
            WHERE reset_token = ${token} 
            AND reset_token_expiry > NOW()
        `;

        if (user.rows.length === 0) {
            return NextResponse.json({ error: 'Geçersiz veya süresi dolmuş bağlantı.' }, { status: 400 });
        }

        const userId = user.rows[0].id;

        // 2. Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // 3. Update password and clear token
        await sql`
            UPDATE users 
            SET password = ${hashedPassword}, reset_token = NULL, reset_token_expiry = NULL
            WHERE id = ${userId}
        `;

        return NextResponse.json({ message: 'Şifreniz başarıyla güncellendi.' }, { status: 200 });

    } catch (error: any) {
        console.error('Reset password error:', error);
        return NextResponse.json({ error: 'Bir hata oluştu.' }, { status: 500 });
    }
}
