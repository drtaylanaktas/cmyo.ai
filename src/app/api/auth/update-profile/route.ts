import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const { email, name, surname, title, avatar } = await request.json();

        if (!email || !name || !surname) {
            return NextResponse.json({ error: 'Eksik bilgi.' }, { status: 400 });
        }

        // Update user in DB
        await sql`
            UPDATE users 
            SET name = ${name}, surname = ${surname}, title = ${title}, avatar = ${avatar}
            WHERE email = ${email};
        `;

        return NextResponse.json({ message: 'Profil güncellendi.' });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
