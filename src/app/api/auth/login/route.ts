import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

export async function POST(request: Request) {
    try {
        const { email, password } = await request.json();

        // Check if user exists
        const userResult = await sql`SELECT * FROM users WHERE email = ${email}`;

        if (userResult.rows.length === 0) {
            return NextResponse.json({ error: 'Kullanıcı bulunamadı.' }, { status: 404 });
        }

        const user = userResult.rows[0];

        // Verify password
        const passwordMatch = await bcrypt.compare(password, user.password);

        if (!passwordMatch) {
            return NextResponse.json({ error: 'Hatalı şifre.' }, { status: 401 });
        }

        // Check if email is verified
        if (!user.email_verified) {
            return NextResponse.json({
                error: 'E-posta adresiniz doğrulanmamış. Lütfen gelen kutunuzu kontrol edin.'
            }, { status: 403 });
        }

        // Return user info (excluding password)
        // We also need to map snake_case DB columns to camelCase for frontend consistency if needed, 
        // but better to keep it consistent. Frontend expects: name, surname, role, title, academicUnit, avatar
        // DB has: academic_unit

        const userResponse = {
            name: user.name,
            surname: user.surname,
            email: user.email,
            role: user.role,
            title: user.title,
            academicUnit: user.academic_unit,
            avatar: user.avatar
        };

        return NextResponse.json({ user: userResponse }, { status: 200 });
    } catch (error: any) {
        console.error('Login error:', error);
        return NextResponse.json({ error: `Giriş yapılırken bir hata oluştu: ${error.message}` }, { status: 500 });
    }
}
