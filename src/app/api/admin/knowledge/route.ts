import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { getSession } from '@/lib/auth';

export async function GET(request: Request) {
    try {
        // Protect route
        const session = await getSession();
        if (!session || session.role !== 'admin') {
            return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const search = searchParams.get('search') || '';
        const limitStr = searchParams.get('limit') || '50';
        const offsetStr = searchParams.get('offset') || '0';
        
        const limit = parseInt(limitStr, 10);
        const offset = parseInt(offsetStr, 10);

        let query, countQuery;

        if (search) {
            const searchTerm = `%${search}%`;
            query = sql`
                SELECT id, filename, category, priority, updated_at 
                FROM knowledge_documents 
                WHERE filename ILIKE ${searchTerm} OR content ILIKE ${searchTerm}
                ORDER BY updated_at DESC, id DESC
                LIMIT ${limit} OFFSET ${offset}
            `;
            countQuery = sql`
                SELECT count(*) as total 
                FROM knowledge_documents 
                WHERE filename ILIKE ${searchTerm} OR content ILIKE ${searchTerm}
            `;
        } else {
            query = sql`
                SELECT id, filename, category, priority, updated_at 
                FROM knowledge_documents 
                ORDER BY updated_at DESC, id DESC
                LIMIT ${limit} OFFSET ${offset}
            `;
            countQuery = sql`
                SELECT count(*) as total 
                FROM knowledge_documents
            `;
        }

        const [dataResult, countResult] = await Promise.all([query, countQuery]);

        return NextResponse.json({
            documents: dataResult.rows,
            total: parseInt(countResult.rows[0].total, 10),
            limit,
            offset
        });
    } catch (error) {
        console.error('Error fetching knowledge documents:', error);
        return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        // Protect route
        const session = await getSession();
        if (!session || session.role !== 'admin') {
            return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 403 });
        }

        const body = await request.json();
        const { filename, content, category, priority } = body;

        if (!filename || !content) {
            return NextResponse.json({ error: 'Dosya adı ve içerik zorunludur' }, { status: 400 });
        }

        // Insert new document
        const result = await sql`
            INSERT INTO knowledge_documents (filename, content, category, priority)
            VALUES (${filename}, ${content}, ${category || 'genel'}, ${priority || 0})
            RETURNING id, filename, category, priority, updated_at
        `;

        // Signal to invalidate the in-memory cache
        (global as any).knowledgeCacheInvalidated = true;

        return NextResponse.json({ success: true, document: result.rows[0] }, { status: 201 });
    } catch (error) {
        console.error('Error creating knowledge document:', error);
        // Catch duplicate filename error
        if ((error as any).code === '23505') {
            return NextResponse.json({ error: 'Bu dosya adı zaten mevcut' }, { status: 409 });
        }
        return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 });
    }
}
