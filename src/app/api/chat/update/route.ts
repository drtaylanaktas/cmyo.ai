import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

export async function PATCH(request: Request) {
    try {
        const { id, email, title, isPinned } = await request.json();

        if (!id || !email) {
            return NextResponse.json({ error: 'ID and email required' }, { status: 400 });
        }

        // Construct update query dynamically based on provided fields
        if (title !== undefined && isPinned !== undefined) {
            await sql`
                UPDATE conversations 
                SET title = ${title}, is_pinned = ${isPinned}, updated_at = NOW()
                WHERE id = ${id} AND user_email = ${email};
            `;
        } else if (title !== undefined) {
            await sql`
                UPDATE conversations 
                SET title = ${title}, updated_at = NOW()
                WHERE id = ${id} AND user_email = ${email};
            `;
        } else if (isPinned !== undefined) {
            await sql`
                UPDATE conversations 
                SET is_pinned = ${isPinned}, updated_at = NOW()
                WHERE id = ${id} AND user_email = ${email};
            `;
        }

        return NextResponse.json({ message: 'Conversation updated' });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
