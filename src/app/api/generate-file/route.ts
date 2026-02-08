import { NextResponse } from 'next/server';
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType } from 'docx';
import fs from 'fs';
import path from 'path';

// Helper to write debug logs
function logDebug(message: string) {
    const logPath = path.join(process.cwd(), 'debug_log.txt');
    const timestamp = new Date().toISOString();
    fs.appendFileSync(logPath, `[${timestamp}] ${message}\n`);
}

export async function POST(req: Request) {
    try {
        const { filename, data } = await req.json();

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

                // Check case-insensitive equality
                if (normF.toLowerCase() === normTarget.toLowerCase()) return true;

                return false;
            });

            if (foundFile) {
                logDebug(`Found file via normalization: ${foundFile}`);
                targetFilePath = path.join(dataDir, foundFile);
            } else {
                logDebug('File NOT found via exact or normalization checks.');
                // LAST RESORT: Try to find a file that matches major keywords
                // This helps if there are extra spaces or minor differences
                // We split the filename by spaces and see if any file contains MOST of the terms
                const targetTerms = filename.toLowerCase().replace('.pdf', '').split(' ').filter((t: string) => t.length > 3);

                if (targetTerms.length > 0) {
                    const fuzzyMatch = files.find(f => {
                        const fLower = f.toLowerCase();
                        // Check if file contains ALL major terms
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

        logDebug('File not found at all. Proceeding to fallback logic (only for DOCX generation).');

        // --- FALLBACK: Generate New Document if validation fails or file not found ---
        // ONLY if it is meant to be a DOCX or if we have data to fill
        if (filename.endsWith('.pdf')) {
            return NextResponse.json({ error: 'PDF belgesi bulunamadı. Lütfen yöneticiye bildirin.' }, { status: 404 });
        }

        // Create table rows from data
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

        const doc = new Document({
            sections: [{
                properties: {},
                children: [
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

                    // Content Table
                    new Table({
                        width: { size: 100, type: WidthType.PERCENTAGE },
                        rows: rows,
                    }),

                    // Signature Area
                    new Paragraph({
                        alignment: AlignmentType.RIGHT,
                        spacing: { before: 800 },
                        children: [
                            new TextRun({ text: "İmza", bold: true }),
                        ],
                    }),
                    new Paragraph({
                        alignment: AlignmentType.RIGHT,
                        children: [
                            new TextRun({ text: "................................................" }),
                        ],
                    }),
                ],
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
        return NextResponse.json({ error: 'Failed to generate file: ' + error.message }, { status: 500 });
    }
}
