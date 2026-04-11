import { NextResponse } from 'next/server';
import { parseDocument } from '@/lib/file-parser';

const DOCUMENT_MIMES = new Set([
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
    'application/pdf', // .pdf
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.ms-excel', // .xls
]);

const IMAGE_MIMES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
]);

const DOCUMENT_SIZE_LIMIT = 5 * 1024 * 1024; // 5MB
const IMAGE_SIZE_LIMIT = 4 * 1024 * 1024;    // 4MB

/**
 * Magic-byte based image validation. MIME header'ı spoof edilebildiğinden
 * bu kontrol payload'un gerçekten iddia edilen formatta olup olmadığını doğrular.
 */
function isValidImage(buffer: Buffer, mime: string): boolean {
    if (buffer.length < 12) return false;
    if (mime === 'image/jpeg') {
        return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    }
    if (mime === 'image/png') {
        return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
    }
    if (mime === 'image/webp') {
        // RIFF....WEBP
        return (
            buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
            buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
        );
    }
    return false;
}

export async function POST(request: Request) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File | null;

        if (!file) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
        }

        const isImage = IMAGE_MIMES.has(file.type);
        const isDocument = DOCUMENT_MIMES.has(file.type);

        if (!isImage && !isDocument) {
            return NextResponse.json(
                { error: 'Desteklenmeyen dosya formatı. .docx, .pdf, .xlsx, .xls veya .jpg/.png/.webp yükleyebilirsiniz.' },
                { status: 400 }
            );
        }

        const sizeLimit = isImage ? IMAGE_SIZE_LIMIT : DOCUMENT_SIZE_LIMIT;
        if (file.size > sizeLimit) {
            const limitMb = sizeLimit / (1024 * 1024);
            return NextResponse.json(
                { error: `Dosya boyutu ${limitMb}MB sınırını aşıyor.` },
                { status: 413 }
            );
        }

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        if (isImage) {
            if (!isValidImage(buffer, file.type)) {
                return NextResponse.json(
                    { error: 'Görsel dosyası geçersiz veya bozuk.' },
                    { status: 400 }
                );
            }

            const imageDataUrl = `data:${file.type};base64,${buffer.toString('base64')}`;

            return NextResponse.json({
                filename: file.name,
                kind: 'image',
                imageDataUrl,
                mime: file.type,
                size: file.size,
                message: 'Görsel başarıyla yüklendi.',
            }, { status: 200 });
        }

        // Document branch
        const text = await parseDocument(buffer, file.type);

        return NextResponse.json({
            filename: file.name,
            kind: 'text',
            text,
            mime: file.type,
            size: file.size,
            message: 'Dosya başarıyla okundu.',
        }, { status: 200 });

    } catch (error: any) {
        console.error('File upload/parse error:', error);
        return NextResponse.json({ error: 'Dosya işlenirken bir hata oluştu.' }, { status: 500 });
    }
}
