import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
        return NextResponse.redirect(new URL('/verify?error=missing_token', request.url));
    }

    try {
        // Find user with this token
        const result = await sql`
      SELECT * FROM users WHERE verification_token = ${token}
    `;

        if (result.rows.length === 0) {
            return NextResponse.redirect(new URL('/verify?error=invalid_token', request.url));
        }

        const user = result.rows[0];

        // Verify user
        await sql`
      UPDATE users 
      SET email_verified = TRUE, verification_token = NULL 
      WHERE id = ${user.id}
    `;

        return NextResponse.redirect(new URL('/verify?success=true', request.url));

    } catch (error) {
        console.error('Verification error:', error);
        return NextResponse.redirect(new URL('/verify?error=server_error', request.url));
    }
}
