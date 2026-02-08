import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

export async function POST(request: Request) {
    try {
        const { name, surname, email, password, role, title, academicUnit, avatar } = await request.json();

        // Validate email domain
        if (!email.endsWith('@ahievran.edu.tr')) {
            return NextResponse.json({ error: 'Sadece @ahievran.edu.tr uzantılı mail adresleri ile kayıt olabilirsiniz.' }, { status: 400 });
        }

        // Ensure users table exists (Auto-Fix for "relation does not exist")
        await sql`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                surname VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                role VARCHAR(50) NOT NULL,
                title VARCHAR(100),
                academic_unit VARCHAR(255),
                avatar TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `;

        // Check if user exists
        const existingUser = await sql`SELECT * FROM users WHERE email = ${email}`;
        if (existingUser.rows.length > 0) {
            return NextResponse.json({ error: 'Bu mail adresi zaten kayıtlı.' }, { status: 409 });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert user
        await sql`
      INSERT INTO users (name, surname, email, password, role, title, academic_unit, avatar)
      VALUES (${name}, ${surname}, ${email}, ${hashedPassword}, ${role}, ${title}, ${academicUnit}, ${avatar})
    `;

        return NextResponse.json({ message: 'Kayıt başarılı!' }, { status: 201 });
    } catch (error: any) {
        console.error('Registration error:', error);
        return NextResponse.json({ error: `Kayıt oluşturulurken bir hata oluştu: ${error.message}` }, { status: 500 });
    }
}
