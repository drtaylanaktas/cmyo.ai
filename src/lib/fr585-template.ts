/**
 * FR-585 Kanıt Formu otomatik doldurma helper'ı.
 *
 * İki render yolu destekler:
 *  1) Docxtemplater + elle hazırlanmış şablon (logo/başlık/tablo korunur)
 *  2) Programatik fallback — şablon dosyası yoksa docx lib ile dinamik üretim
 *
 * Şablon hazırlanırken placeholder'lar flat key olarak yazılmalı
 * (docxtemplater default parser dot-path'i section pattern dışında çözemez).
 */

import fs from 'fs';
import path from 'path';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import {
    Document,
    Packer,
    Paragraph,
    Table,
    TableRow,
    TableCell,
    TextRun,
    HeadingLevel,
    AlignmentType,
    WidthType,
    BorderStyle,
} from 'docx';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Fr585Data {
    sorumluBirim: string | null;
    kanitAdi: string | null;
    kanitTuru: {
        faaliyet: boolean;
        surec: boolean;
        risk: boolean;
        iyilestirmeDIF: boolean;
        mys: boolean;
        diger: boolean;
        digerAciklama: string | null;
    };
    gerceklesmeDurumu: {
        tamamlandi: boolean;
        ertelendi: boolean;
        iptal: boolean;
    };
    gerceklesmeTarihi: string | null; // ISO YYYY-MM-DD
    kanitIcerigi: string | null;
    sonuclarVeDegerlendirme: string | null;
    gerekce: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEMPLATE_PATH = path.join(
    process.cwd(),
    'src/data/FR-585_Kan_t_Formu_TEMPLATE.docx'
);

const CHECK = '☒';
const UNCHECK = '☐';

function checkbox(flag: boolean): string {
    return flag ? CHECK : UNCHECK;
}

/**
 * ISO YYYY-MM-DD -> 12.03.2026. Geçersizse raw string veya boş döner.
 */
export function formatTrDate(iso: string | null | undefined): string {
    if (!iso) return '';
    const trimmed = iso.trim();
    if (!trimmed) return '';
    // ISO ise: YYYY-MM-DD
    const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
        const [, y, m, d] = isoMatch;
        return `${d}.${m}.${y}`;
    }
    // Parse edilebilir bir tarih ise
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
        const d = String(parsed.getDate()).padStart(2, '0');
        const m = String(parsed.getMonth() + 1).padStart(2, '0');
        const y = parsed.getFullYear();
        return `${d}.${m}.${y}`;
    }
    return trimmed;
}

/**
 * Flat placeholder dictionary — docxtemplater default parser için (dot-path yerine).
 */
function toFlatPlaceholders(data: Fr585Data): Record<string, string> {
    const nz = (v: string | null | undefined) => (v && v.trim() ? v : '');
    return {
        sorumluBirim: nz(data.sorumluBirim),
        kanitAdi: nz(data.kanitAdi),

        // Tür checkbox'ları — hem glyph hem boolean string versiyonu
        kanitTuruFaaliyet: checkbox(data.kanitTuru.faaliyet),
        kanitTuruSurec: checkbox(data.kanitTuru.surec),
        kanitTuruRisk: checkbox(data.kanitTuru.risk),
        kanitTuruIyilestirmeDIF: checkbox(data.kanitTuru.iyilestirmeDIF),
        kanitTuruMys: checkbox(data.kanitTuru.mys),
        kanitTuruDiger: checkbox(data.kanitTuru.diger),
        digerAciklama: nz(data.kanitTuru.digerAciklama),

        // Durum checkbox'ları
        durumTamamlandi: checkbox(data.gerceklesmeDurumu.tamamlandi),
        durumErtelendi: checkbox(data.gerceklesmeDurumu.ertelendi),
        durumIptal: checkbox(data.gerceklesmeDurumu.iptal),

        tarihFormatted: formatTrDate(data.gerceklesmeTarihi),
        gerceklesmeTarihi: formatTrDate(data.gerceklesmeTarihi),

        kanitIcerigi: nz(data.kanitIcerigi),
        sonuclarVeDegerlendirme: nz(data.sonuclarVeDegerlendirme),
        gerekce: nz(data.gerekce),
    };
}

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

/**
 * Ana render fonksiyonu: önce docxtemplater ile şablon, yoksa programmatic fallback.
 */
export async function renderFr585(data: Fr585Data): Promise<Buffer> {
    if (fs.existsSync(TEMPLATE_PATH)) {
        try {
            return renderWithTemplate(data);
        } catch (err) {
            console.warn('[fr585-template] Template render failed, falling back to programmatic:', err);
            // Fallback'e düş
        }
    }
    return renderProgrammatic(data);
}

function renderWithTemplate(data: Fr585Data): Buffer {
    const content = fs.readFileSync(TEMPLATE_PATH, 'binary');
    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
    });

    doc.render(toFlatPlaceholders(data));

    return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/**
 * Şablon dosyası yokken kullanılan programatik üretim.
 * Orijinal logo/başlık korunmaz ama tüm alanlar doğru şekilde tablolar halinde yazılır.
 */
async function renderProgrammatic(data: Fr585Data): Promise<Buffer> {
    const nz = (v: string | null | undefined) => (v && v.trim() ? v : '—');

    const title = new Paragraph({
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        children: [
            new TextRun({
                text: 'FR-585 KANIT FORMU',
                bold: true,
                size: 28,
            }),
        ],
    });

    const subtitle = new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 300 },
        children: [
            new TextRun({
                text: 'Kırşehir Ahi Evran Üniversitesi — Çiçekdağı Meslek Yüksekokulu',
                italics: true,
                size: 18,
            }),
        ],
    });

    const row = (label: string, value: string) =>
        new TableRow({
            children: [
                new TableCell({
                    width: { size: 30, type: WidthType.PERCENTAGE },
                    children: [new Paragraph({ children: [new TextRun({ text: label, bold: true })] })],
                }),
                new TableCell({
                    width: { size: 70, type: WidthType.PERCENTAGE },
                    children: [new Paragraph({ children: [new TextRun({ text: value })] })],
                }),
            ],
        });

    const kanitTuruText = [
        `${checkbox(data.kanitTuru.faaliyet)} Faaliyet`,
        `${checkbox(data.kanitTuru.surec)} Süreç`,
        `${checkbox(data.kanitTuru.risk)} Risk`,
        `${checkbox(data.kanitTuru.iyilestirmeDIF)} İyileştirme/DİF`,
        `${checkbox(data.kanitTuru.mys)} MYS`,
        `${checkbox(data.kanitTuru.diger)} Diğer${
            data.kanitTuru.diger && data.kanitTuru.digerAciklama
                ? ` (${data.kanitTuru.digerAciklama})`
                : ''
        }`,
    ].join('   ');

    const durumText = [
        `${checkbox(data.gerceklesmeDurumu.tamamlandi)} Tamamlandı`,
        `${checkbox(data.gerceklesmeDurumu.ertelendi)} Ertelendi`,
        `${checkbox(data.gerceklesmeDurumu.iptal)} İptal Edildi`,
    ].join('   ');

    const table = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
            top:    { style: BorderStyle.SINGLE, size: 4, color: '000000' },
            bottom: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
            left:   { style: BorderStyle.SINGLE, size: 4, color: '000000' },
            right:  { style: BorderStyle.SINGLE, size: 4, color: '000000' },
            insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
            insideVertical:   { style: BorderStyle.SINGLE, size: 4, color: '000000' },
        },
        rows: [
            row('Sorumlu Birim/Kişi', nz(data.sorumluBirim)),
            row('Kanıtın Adı', nz(data.kanitAdi)),
            row('Kanıtın Türü', kanitTuruText),
            row('Gerçekleşme Durumu', durumText),
            row('Gerçekleşme Tarihi', formatTrDate(data.gerceklesmeTarihi) || '—'),
            row('Kanıt İçeriği', nz(data.kanitIcerigi)),
            row('Sonuçlar ve Değerlendirme', nz(data.sonuclarVeDegerlendirme)),
            row('Ertelenen/İptal Gerekçesi', nz(data.gerekce)),
        ],
    });

    const footer = new Paragraph({
        spacing: { before: 400 },
        children: [
            new TextRun({
                text: 'Not: Bu form ÇMYO.AI tarafından yüklenen kanıt esas alınarak otomatik doldurulmuştur. Lütfen kontrol edip imzalayınız.',
                italics: true,
                size: 18,
            }),
        ],
    });

    const docxDoc = new Document({
        sections: [
            {
                properties: {},
                children: [title, subtitle, table, footer],
            },
        ],
    });

    return await Packer.toBuffer(docxDoc);
}
