import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

export async function GET() {
    if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Bu endpoint production ortamında devre dışıdır.' }, { status: 403 });
    }
    try {
        const result = await sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'users';
    `;
        return NextResponse.json({ columns: result.rows }, { status: 200 });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
