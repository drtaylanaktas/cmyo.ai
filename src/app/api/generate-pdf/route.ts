import { PDFDocument, rgb } from 'pdf-lib';
import { NextResponse } from 'next/server';
// @ts-ignore
import fontkit from '@pdf-lib/fontkit';

export async function POST(req: Request) {
    try {
        const { filename, data } = await req.json();

        const pdfDoc = await PDFDocument.create();
        pdfDoc.registerFontkit(fontkit);

        // Fetch font properly
        const fontUrl = 'https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Mu4mxK.ttf';
        const fontBytes = await fetch(fontUrl).then(res => res.arrayBuffer());
        const font = await pdfDoc.embedFont(fontBytes);

        let page = pdfDoc.addPage();
        const { width, height } = page.getSize();

        // Title
        page.drawText('T.C.', {
            x: 50,
            y: height - 50,
            size: 12,
            font: font,
            color: rgb(0, 0, 0),
        });
        page.drawText('KIRŞEHİR AHİ EVRAN ÜNİVERSİTESİ', {
            x: 50,
            y: height - 65,
            size: 14,
            font: font,
            color: rgb(0, 0, 0),
        });
        page.drawText('Çiçekdağı Meslek Yüksekokulu', {
            x: 50,
            y: height - 85,
            size: 12,
            font: font,
            color: rgb(0, 0, 0),
        });

        // Form Title
        page.drawText(`BELGE: ${filename.replace('.docx', '').replace('.xlsx', '')}`, {
            x: 50,
            y: height - 120,
            size: 16,
            font: font,
            color: rgb(0, 0, 0.8),
        });

        // Date
        const today = new Date().toLocaleDateString('tr-TR');
        page.drawText(`Tarih: ${today}`, {
            x: width - 200,
            y: height - 120,
            size: 10,
            font: font,
        });

        // Content
        let y = height - 160;

        // Draw Key-Values
        // If data is just an object, iterate.
        // If it comes from RAG/Chat, it might be unstructured, but here we assume key-value pairs from the JSON.
        if (data && typeof data === 'object') {
            for (const [key, value] of Object.entries(data)) {
                if (key === 'action') continue; // Skip action field if present

                if (y < 50) {
                    page = pdfDoc.addPage(); // New page if full
                    y = height - 50;
                }

                page.drawText(`${key}:`, {
                    x: 50,
                    y: y,
                    size: 11,
                    font: font,
                });

                // Value might be long, check simple wrapping or just print
                const valStr = value ? String(value) : '-';
                page.drawText(valStr, {
                    x: 200,
                    y: y,
                    size: 11,
                    font: font,
                });

                y -= 25;
            }
        } else {
            page.drawText('İçerik verisi bulunamadı.', {
                x: 50,
                y: y,
                size: 11,
                font: font,
                color: rgb(1, 0, 0),
            });
        }

        // Signature Area
        y -= 50;
        if (y < 50) {
            page = pdfDoc.addPage();
            y = height - 50;
        }
        page.drawText('İmza:', {
            x: 50,
            y: y,
            size: 11,
            font: font,
        });
        page.drawLine({
            start: { x: 90, y: y },
            end: { x: 300, y: y },
            thickness: 1,
            color: rgb(0, 0, 0),
        });

        const pdfBytes = await pdfDoc.save();

        return new NextResponse(Buffer.from(pdfBytes), {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${filename.replace(/\.[^/.]+$/, "")}_Generated.pdf"`,
            },
        });

    } catch (error: any) {
        console.error('PDF Generation Error:', error);
        return NextResponse.json({ error: 'Failed to generate PDF: ' + error.message }, { status: 500 });
    }
}
