import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

export async function DELETE(request: Request) {
    try {
        const { id, email } = await request.json();

        if (!id || !email) {
            return NextResponse.json({ error: 'ID and email required' }, { status: 400 });
        }

        // Verify ownership and delete
        await sql`
            DELETE FROM conversations 
            WHERE id = ${id} AND user_email = ${email};
        `;

        return NextResponse.json({ message: 'Conversation deleted' });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
