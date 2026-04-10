import { NextResponse } from 'next/server';
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType } from 'docx';
import fs from 'fs';
import path from 'path';

// Helper to write debug logs
// Helper to write debug logs (Console only for Vercel)
function logDebug(message: string) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${message}`);
}

export async function POST(req: Request) {
    try {
        const { filename: rawFilename, data } = await req.json();

        // Sanitize filename to prevent path traversal
        // Also normalize underscores to spaces (AI sometimes generates underscore filenames)
        const filename = path.basename((rawFilename || '').replace(/_/g, ' '));
        if (!filename) {
            return NextResponse.json({ error: 'Geçersiz dosya adı.' }, { status: 400 });
        }

        // Define path to potential template
        const dataDir = path.join(process.cwd(), 'src/data');
        let targetFilePath = path.join(dataDir, filename);

        logDebug(`--- Request Started ---`);
        logDebug(`Requested Filename: ${filename}`);
        logDebug(`Initial Target Path: ${targetFilePath}`);

        // 1. Try exact match
        if (!fs.existsSync(targetFilePath)) {
            logDebug('Exact match not found. attempting normalization and fuzzy search.');

            // 2. Try normalizing filenames to handle Mac/Windows differences (NFC vs NFD)
            let files: string[] = [];
            try {
                files = fs.readdirSync(dataDir);
                logDebug(`Files in src/data count: ${files.length}`);
            } catch (e: any) {
                logDebug(`Error reading data directory: ${e.message}`);
            }

            const foundFile = files.find(f => {
                const normF = f.normalize('NFC');
                const normTarget = filename.normalize('NFC');

                // Check NFC equality
                if (normF === normTarget) return true;

                // Check NFD equality
                if (f.normalize('NFD') === filename.normalize('NFD')) return true;

                // Check case-insensitive equality (Turkish-safe)
                if (normF.toLocaleLowerCase('tr-TR') === normTarget.toLocaleLowerCase('tr-TR')) return true;

                return false;
            });

            if (foundFile) {
                logDebug(`Found file via normalization: ${foundFile}`);
                targetFilePath = path.join(dataDir, foundFile);
            } else {
                logDebug('File NOT found via exact or normalization checks.');
                // LAST RESORT: fuzzy keyword search — Turkish-safe, all word lengths ≥3
                const targetTerms = filename.normalize('NFC').replace(/\.(pdf|docx|xlsx|xls)$/i, '')
                    .split(/[\s\-\/\.]+/)
                    .filter((t: string) => t.length >= 3)
                    .map((t: string) => t.toLocaleLowerCase('tr-TR'));

                if (targetTerms.length > 0) {
                    const fuzzyMatch = files.find(f => {
                        const fLower = f.normalize('NFC').toLocaleLowerCase('tr-TR');
                        return targetTerms.every((term: string) => fLower.includes(term));
                    });

                    if (fuzzyMatch) {
                        logDebug(`Found fuzzy match via keyword search: ${fuzzyMatch}`);
                        targetFilePath = path.join(dataDir, fuzzyMatch);
                    } else {
                        logDebug(`No fuzzy match found either. Terms checked: ${targetTerms.join(', ')}`);
                    }
                }
            }
        }

        // Check if file exists (either exact or resolved)
        if (fs.existsSync(targetFilePath)) {
            logDebug(`Serving file from: ${targetFilePath}`);
            // Serve the file directly
            const content = fs.readFileSync(targetFilePath);
            const extension = path.extname(targetFilePath).toLowerCase();

            let contentType = 'application/octet-stream';
            if (extension === '.pdf') contentType = 'application/pdf';
            if (extension === '.docx') contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
            if (extension === '.xlsx') contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

            // Ensure filename is safe for content-disposition
            // We use encodeURIComponent to handle non-ASCII characters reliably in headers
            const encodedFilename = encodeURIComponent(path.basename(targetFilePath));

            return new NextResponse(content, {
                headers: {
                    'Content-Type': contentType,
                    'Content-Disposition': `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`,
                },
            });
        }

        logDebug('File not found on disk. Checking DB for file_url before fallback...');

        // --- DB CHECK: file_url varsa proxy et (PDF dahil her dosya türü için) ---
        let defaultContent = '';
        try {
            const { sql } = await import('@vercel/postgres');

            // Uzantıyı kaldır (her iki varyant için — DB'de uzantısız veya uzantılı kaydedilmiş olabilir)
            const filenameNoExt = filename.replace(/\.(pdf|docx|xlsx|xls)$/i, '');
            const codeMatch = filename.match(/(FR|GGYS-FR)-(\d{3,4})|CMYO_([A-Za-z0-9_]+)/i);
            const searchCode = codeMatch ? codeMatch[0] : null;

            logDebug(`Searching DB for: "${filenameNoExt}" or "${filename}"${searchCode ? ` (Code: ${searchCode})` : ''}`);

            // 1. Deneme: exact match — uzantısız VE uzantılı hali dene (admin her iki şekilde kaydediyor olabilir)
            let dbQuery = await sql`SELECT filename, content, file_url FROM knowledge_documents WHERE filename = ${filenameNoExt} OR filename = ${filename} LIMIT 1`;

            // 2. Deneme: kod ile ILIKE (FR-346 gibi formlar için)
            if (dbQuery.rows.length === 0 && searchCode) {
                dbQuery = await sql`SELECT filename, content, file_url FROM knowledge_documents WHERE filename ILIKE ${'%' + searchCode + '%'} LIMIT 1`;
            }

            // 3. Deneme: Türkçe-güvenli keyword arama — tüm kelimeler, ILIKE (case+accent insensitive)
            if (dbQuery.rows.length === 0) {
                const keywords = filenameNoExt.split(/[\s\-\/\.]+/).filter((w: string) => w.length >= 3);
                logDebug(`Keywords: ${keywords.join(', ')}`);
                if (keywords.length >= 2) {
                    dbQuery = await sql`SELECT filename, content, file_url FROM knowledge_documents WHERE filename ILIKE ${'%' + keywords[0] + '%'} AND filename ILIKE ${'%' + keywords[1] + '%'} AND file_url IS NOT NULL ORDER BY priority DESC, updated_at DESC LIMIT 1`;
                } else if (keywords.length === 1) {
                    dbQuery = await sql`SELECT filename, content, file_url FROM knowledge_documents WHERE filename ILIKE ${'%' + keywords[0] + '%'} AND file_url IS NOT NULL ORDER BY priority DESC, updated_at DESC LIMIT 1`;
                }
            }

            if (dbQuery.rows.length > 0) {
                if (dbQuery.rows[0].file_url) {
                    logDebug(`Found file_url in DB: ${dbQuery.rows[0].file_url}. Proxying...`);
                    try {
                        const fileRes = await fetch(dbQuery.rows[0].file_url);
                        if (fileRes.ok) {
                            // content-type'ı dosya adı uzantısından belirle (DB'deki gerçek adı kullan)
                            const dbFilename = dbQuery.rows[0].filename as string;
                            const serveFilename = dbFilename.match(/\.(pdf|docx|xlsx|xls)$/i) ? dbFilename : filename;
                            const ext = serveFilename.split('.').pop()?.toLowerCase() || '';
                            let contentType = fileRes.headers.get('Content-Type') || 'application/octet-stream';
                            if (ext === 'pdf') contentType = 'application/pdf';
                            if (ext === 'docx') contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
                            if (ext === 'xlsx' || ext === 'xls') contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
                            return new NextResponse(fileRes.body, {
                                headers: {
                                    'Content-Type': contentType,
                                    'Content-Disposition': `attachment; filename="${encodeURIComponent(serveFilename)}"`,
                                },
                            });
                        }
                    } catch (fetchErr) {
                        logDebug(`Proxy failed: ${fetchErr}`);
                    }
                }
                defaultContent = dbQuery.rows[0].content || '';
            }
        } catch (dbErr) {
            console.error('DB query failed:', dbErr);
        }

        // --- FALLBACK: DOCX oluştur (sadece .docx için, PDF üretilemez) ---
        if (filename.endsWith('.pdf')) {
            return NextResponse.json({ error: 'PDF belgesi bulunamadı. Lütfen yöneticiye bildirin.' }, { status: 404 });
        }

        // Content Table
        const rows = [];
        if (data && typeof data === 'object') {
            for (const [key, value] of Object.entries(data)) {
                if (key === 'action') continue;
                rows.push(
                    new TableRow({
                        children: [
                            new TableCell({
                                width: { size: 30, type: WidthType.PERCENTAGE },
                                children: [new Paragraph({ children: [new TextRun({ text: key, bold: true })] })],
                            }),
                            new TableCell({
                                width: { size: 70, type: WidthType.PERCENTAGE },
                                children: [new Paragraph({ children: [new TextRun({ text: value ? String(value) : '-' })] })],
                            }),
                        ],
                    })
                );
            }
        }

        const documentChildren: (Paragraph | Table)[] = [
            // Header
            new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                    new TextRun({ text: "T.C.", bold: true, size: 24 }),
                ],
            }),
            new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                    new TextRun({ text: "KIRŞEHİR AHİ EVRAN ÜNİVERSİTESİ", bold: true, size: 28 }),
                ],
            }),
            new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 400 },
                children: [
                    new TextRun({ text: "Çiçekdağı Meslek Yüksekokulu Müdürlüğü", size: 24 }),
                ],
            }),

            // Document Title
            new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 200, after: 200 },
                children: [
                    new TextRun({
                        text: filename.replace('.docx', '').replace('.xlsx', '').toUpperCase(),
                        bold: true,
                        size: 32,
                        underline: {}
                    }),
                ],
            }),

            // Date
            new Paragraph({
                alignment: AlignmentType.RIGHT,
                spacing: { after: 400 },
                children: [
                    new TextRun({ text: `Tarih: ${new Date().toLocaleDateString('tr-TR')}` }),
                ],
            }),
        ];

        // Add DB content if exists
        if (defaultContent) {
            const textLines = defaultContent.split('\n');
            textLines.forEach(line => {
                if (line.trim()) {
                    documentChildren.push(
                        new Paragraph({
                            spacing: { after: 120 },
                            children: [new TextRun({ text: line.trim() })]
                        })
                    );
                }
            });
            documentChildren.push(new Paragraph({ spacing: { after: 400 } })); // Spacer
        }

        // Check if there are rows, docx crashes if table has 0 rows
        if (rows.length > 0) {
            documentChildren.push(
                new Table({
                    width: { size: 100, type: WidthType.PERCENTAGE },
                    rows: rows,
                })
            );
        } else if (!defaultContent) {
            // If completely empty, add a placeholder paragraph
            documentChildren.push(
                new Paragraph({
                    text: "(Belge İçeriği Boş)",
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 400 }
                })
            );
        }

        // Signature Area
        documentChildren.push(
            new Paragraph({
                alignment: AlignmentType.RIGHT,
                spacing: { before: 800 },
                children: [new TextRun({ text: "İmza", bold: true })],
            }),
            new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new TextRun({ text: "................................................" })],
            })
        );

        const doc = new Document({
            sections: [{
                properties: {},
                children: documentChildren,
            }],
        });

        const buffer = await Packer.toBuffer(doc);

        return new NextResponse(buffer as any, {
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'Content-Disposition': `attachment; filename="${filename.replace(/\.[^/.]+$/, "")}_Gen.docx"`,
            },
        });

    } catch (error: any) {
        console.error('File Generation Error:', error);
        logDebug(`CRITICAL ERROR: ${error.message}`);
        return NextResponse.json({ error: 'Dosya oluşturulurken bir hata oluştu.' }, { status: 500 });
    }
}
