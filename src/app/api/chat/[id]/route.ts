import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    if (!id) {
        return NextResponse.json({ error: 'ID required' }, { status: 400 });
    }

    try {
        const result = await sql`
            SELECT id, role, content, created_at
            FROM messages
            WHERE conversation_id = ${id}
            ORDER BY created_at ASC;
        `;

        // Transform to Message format expected by frontend
        const messages = result.rows.map((row: any) => ({
            id: row.id,
            role: row.role,
            content: row.content,
            createdAt: row.created_at
        }));

        return NextResponse.json({ messages });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
