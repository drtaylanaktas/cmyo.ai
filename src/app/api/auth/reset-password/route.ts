import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

export async function POST(request: Request) {
    try {
        const { token, newPassword } = await request.json();

        // 1. Find user by token and check expiry
        // Using current time compared to stored expiry
        // Note: reset_token_expiry > NOW()
        console.log('Reset Password Request for token:', token);

        // 1. Find user by token (ignore expiry for debugging)
        const userResult = await sql`SELECT * FROM users WHERE reset_token = ${token}`;

        if (userResult.rows.length === 0) {
            console.log('Token not found in database.');
            return NextResponse.json({ error: 'Geçersiz bağlantı.' }, { status: 400 });
        }

        const user = userResult.rows[0];
        console.log('User found:', user.email);
        console.log('Token Expiry stored:', user.reset_token_expiry);
        console.log('Current Time:', new Date());

        // Check expiry manually
        const expiryDate = new Date(user.reset_token_expiry);
        if (new Date() > expiryDate) {
            console.log('Token expired.');
            return NextResponse.json({ error: 'Bağlantının süresi dolmuş.' }, { status: 400 });
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
