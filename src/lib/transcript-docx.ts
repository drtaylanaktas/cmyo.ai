/**
 * Sohbet geçmişini Word (DOCX) belgesine dönüştüren ortak oluşturucu.
 * Hem tek sohbet hem de bir kullanıcının tüm sohbetleri için kullanılır.
 * docx kütüphanesi Türkçe karakterleri ve uzun metinlerin satır kaydırma/
 * sayfalamasını Word'e bıraktığı için PDF'e göre daha stabildir.
 */
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';
import { stripJsonBlock } from './content-clean';

export interface TranscriptMessage {
    role: string;
    content: string;
    created_at?: string | Date | null;
}
export interface TranscriptConversation {
    title?: string | null;
    created_at?: string | Date | null;
    messages: TranscriptMessage[];
}
export interface TranscriptInput {
    userEmail: string;
    exportedBy?: string;
    conversations: TranscriptConversation[];
}

function fmtDateTime(d?: string | Date | null): string {
    if (!d) return '';
    try {
        return new Date(d).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
    } catch {
        return '';
    }
}

function fmtTime(d?: string | Date | null): string {
    if (!d) return '';
    try {
        return new Date(d).toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' });
    } catch {
        return '';
    }
}

function roleLabel(role: string): string {
    return role === 'user' ? 'Kullanıcı' : 'Asistan';
}

/** Çok satırlı metni TextRun dizisine çevirir (her \n yeni satır olur). */
function contentRuns(text: string): TextRun[] {
    const lines = (text || '').split('\n');
    return lines.map((line, i) => new TextRun({ text: line, break: i === 0 ? undefined : 1 }));
}

export async function buildTranscriptDocx(input: TranscriptInput): Promise<Buffer> {
    const { userEmail, exportedBy, conversations } = input;
    const children: Paragraph[] = [];

    // --- Başlık bloğu ---
    const headerLines = ['T.C.', 'KIRŞEHİR AHİ EVRAN ÜNİVERSİTESİ', 'Çiçekdağı Meslek Yüksekokulu'];
    headerLines.forEach((t, i) =>
        children.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: t, bold: i < 2, size: i === 1 ? 26 : 22 })],
        }))
    );
    children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 200, after: 200 },
        children: [new TextRun({ text: 'Sohbet Geçmişi', bold: true, size: 28, color: '1d4ed8' })],
    }));
    children.push(new Paragraph({ children: [new TextRun({ text: `Kullanıcı: ${userEmail}`, bold: true })] }));
    if (exportedBy) {
        children.push(new Paragraph({ children: [new TextRun({ text: `Dışa aktaran: ${exportedBy}`, size: 20, color: '666666' })] }));
    }
    children.push(new Paragraph({
        spacing: { after: 200 },
        children: [new TextRun({ text: `Oluşturma tarihi: ${fmtDateTime(new Date())}`, size: 20, color: '666666' })],
    }));

    if (conversations.length === 0) {
        children.push(new Paragraph({ children: [new TextRun({ text: 'Bu kullanıcıya ait sohbet kaydı bulunamadı.', italics: true })] }));
    }

    // --- Her sohbet ---
    conversations.forEach((conv, idx) => {
        const title = (conv.title && conv.title.trim()) || 'Başlıksız sohbet';
        children.push(new Paragraph({
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 360, after: 80 },
            children: [new TextRun({ text: `${idx + 1}. ${title}` })],
        }));
        if (conv.created_at) {
            children.push(new Paragraph({
                spacing: { after: 120 },
                children: [new TextRun({ text: `Başlangıç: ${fmtDateTime(conv.created_at)}`, size: 18, color: '888888' })],
            }));
        }

        if (!conv.messages || conv.messages.length === 0) {
            children.push(new Paragraph({ children: [new TextRun({ text: '(Bu sohbette mesaj yok)', italics: true, color: '888888' })] }));
            return;
        }

        conv.messages.forEach((m) => {
            const isUser = m.role === 'user';
            const label = roleLabel(m.role);
            const time = fmtTime(m.created_at);
            const text = isUser ? (m.content || '') : stripJsonBlock(m.content || '');
            children.push(new Paragraph({
                spacing: { before: 80, after: 80 },
                children: [
                    new TextRun({ text: `${label}${time ? ` (${time})` : ''}: `, bold: true, color: isUser ? '374151' : '047857' }),
                    ...contentRuns(text),
                ],
            }));
        });
    });

    const doc = new Document({ sections: [{ children }] });
    return Packer.toBuffer(doc);
}

/** Content-Disposition için güvenli dosya adı üretir (ASCII + UTF-8 filename*). */
export function buildContentDisposition(filename: string): string {
    const ascii = filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '');
    const encoded = encodeURIComponent(filename);
    return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
