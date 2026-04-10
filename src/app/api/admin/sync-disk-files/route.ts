import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { getSession } from '@/lib/auth';
import fs from 'fs';
import path from 'path';

// Dosya adından kategori tahmini
function guessCategory(filename: string): string {
    const fn = filename.toLocaleLowerCase('tr-TR');
    if (fn.includes('staj')) return 'staj';
    if (fn.includes('tutanak')) return 'tutanak';
    if (fn.includes('ders programı') || fn.includes('ders programi') || fn.includes('fr-011')) return 'ders-programi';
    if (fn.includes('bologna') || fn.includes('müfredat') || fn.includes('mufredat')) return 'bologna';
    if (fn.startsWith('ggys')) return 'ggys';
    if (fn.startsWith('bgys') || fn.startsWith('enys')) return 'yonetim-sistemi';
    if (fn.match(/^fr-\d/)) return 'form';
    return 'genel';
}

export async function POST(request: Request) {
    try {
        const session = await getSession();
        if (!session || session.role !== 'admin') {
            return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 403 });
        }

        const dataDir = path.join(process.cwd(), 'src/data');
        let diskFiles: string[] = [];
        try {
            diskFiles = fs.readdirSync(dataDir).filter(f =>
                /\.(pdf|docx|xlsx|xls)$/i.test(f)
            );
        } catch (e) {
            return NextResponse.json({ error: 'src/data klasörü okunamadı.' }, { status: 500 });
        }

        // DB'deki mevcut filename'leri çek
        const { rows: existing } = await sql`SELECT filename FROM knowledge_documents`;
        const existingNames = new Set(existing.map((r: any) => r.filename));

        let added = 0;
        let skipped = 0;
        const addedFiles: string[] = [];

        for (const file of diskFiles) {
            // NFC normalize et (macOS NFD → standart NFC)
            const normalizedFile = file.normalize('NFC');
            // DB'de uzantısız kaydediyoruz
            const filenameNoExt = normalizedFile.replace(/\.(pdf|docx|xlsx|xls)$/i, '');

            // Hem uzantısız hem uzantılı hali kontrol et
            if (existingNames.has(filenameNoExt) || existingNames.has(normalizedFile)) {
                skipped++;
                continue;
            }

            const category = guessCategory(filenameNoExt);
            // Content olarak dosya adını yaz — RAG keyword scoring çalışsın
            const content = `${filenameNoExt}. Bu belge sistemde mevcuttur ve indirilebilir.`;

            try {
                await sql`
                    INSERT INTO knowledge_documents (filename, content, category, priority, file_url)
                    VALUES (${filenameNoExt}, ${content}, ${category}, ${50}, ${null})
                    ON CONFLICT (filename) DO NOTHING
                `;
                added++;
                addedFiles.push(filenameNoExt);
            } catch (insertErr) {
                console.error(`Insert failed for ${filenameNoExt}:`, insertErr);
            }
        }

        // Cache'i temizle
        (global as any).knowledgeCacheInvalidated = true;

        return NextResponse.json({
            success: true,
            total_disk_files: diskFiles.length,
            added,
            skipped,
            added_files: addedFiles,
        });
    } catch (error) {
        console.error('Sync error:', error);
        return NextResponse.json({ error: 'Senkronizasyon sırasında hata oluştu.' }, { status: 500 });
    }
}
