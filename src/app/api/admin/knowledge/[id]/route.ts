import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { getSession } from '@/lib/auth';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> } // In Next.js 15, route params are Promises
) {
    try {
        const session = await getSession();
        if (!session || session.role !== 'admin') {
            return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 403 });
        }

        const { id } = await params;

        const { rows } = await sql`
            SELECT id, filename, content, category, priority, created_at, updated_at
            FROM knowledge_documents
            WHERE id = ${parseInt(id, 10)}
        `;

        if (rows.length === 0) {
            return NextResponse.json({ error: 'Belge bulunamadı' }, { status: 404 });
        }

        return NextResponse.json({ document: rows[0] });
    } catch (error) {
        console.error('Error fetching knowledge document by id:', error);
        return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 });
    }
}

export async function PUT(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session || session.role !== 'admin') {
            return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 403 });
        }

        const { id } = await params;
        const body = await request.json();
        const { filename, content, category, priority } = body;

        if (!filename || !content) {
            return NextResponse.json({ error: 'Dosya adı ve içerik zorunludur' }, { status: 400 });
        }

        // Check if filename is being taken by another document
        const checkDuplicate = await sql`
            SELECT id FROM knowledge_documents 
            WHERE filename = ${filename} AND id != ${parseInt(id, 10)}
        `;

        if (checkDuplicate.rows.length > 0) {
            return NextResponse.json({ error: 'Bu dosya adı başka bir belgede kullanılıyor' }, { status: 409 });
        }

        const result = await sql`
            UPDATE knowledge_documents
            SET filename = ${filename},
                content = ${content},
                category = ${category || 'genel'},
                priority = ${priority || 0},
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ${parseInt(id, 10)}
            RETURNING id, filename, category, priority, updated_at
        `;

        if (result.rows.length === 0) {
            return NextResponse.json({ error: 'Güncellenecek belge bulunamadı' }, { status: 404 });
        }

        // Signal cache invalidation
        (global as any).knowledgeCacheInvalidated = true;

        return NextResponse.json({ success: true, document: result.rows[0] });
    } catch (error) {
        console.error('Error updating knowledge document:', error);
        return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 });
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session || session.role !== 'admin') {
            return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 403 });
        }

        const { id } = await params;

        const result = await sql`
            DELETE FROM knowledge_documents
            WHERE id = ${parseInt(id, 10)}
            RETURNING id
        `;

        if (result.rows.length === 0) {
            return NextResponse.json({ error: 'Silinecek belge bulunamadı' }, { status: 404 });
        }

        // Signal cache invalidation
        (global as any).knowledgeCacheInvalidated = true;

        return NextResponse.json({ success: true, id: result.rows[0].id });
    } catch (error) {
        console.error('Error deleting knowledge document:', error);
        return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 });
    }
}
