import { NextResponse } from 'next/server';
import { parseDocument } from '@/lib/file-parser';

export async function POST(request: Request) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File | null;

        if (!file) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
        }

        // specific size limit (e.g., 5MB)
        if (file.size > 5 * 1024 * 1024) {
            return NextResponse.json({ error: 'Dosya boyutu 5MB sınırını aşıyor.' }, { status: 400 });
        }

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        // Initial check for type compatibility
        const validTypes = [
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
            'application/pdf' // .pdf
        ];

        if (!validTypes.includes(file.type)) {
            return NextResponse.json({ error: 'Desteklenmeyen dosya formatı. Sadece .docx ve .pdf yükleyebilirsiniz.' }, { status: 400 });
        }

        const text = await parseDocument(buffer, file.type);

        return NextResponse.json({
            text,
            filename: file.name,
            message: 'Dosya başarıyla okundu.'
        }, { status: 200 });

    } catch (error: any) {
        console.error('File upload/parse error:', error);
        return NextResponse.json({ error: 'Dosya işlenirken bir hata oluştu.' }, { status: 500 });
    }
}
