import { describe, it, expect } from 'vitest';
import { stripJsonBlock, cleanStreamingContent } from '@/lib/content-clean';

describe('stripJsonBlock', () => {
    it('normal metni değiştirmez', () => {
        const s = 'Merhaba, staj formu burada.';
        expect(stripJsonBlock(s)).toBe(s);
    });

    it('JSON_START...JSON_END bloğunu kaldırır', () => {
        const s = 'Belge hazır.\nJSON_START\n{"action":"generate_file","filename":"x.pdf"}\nJSON_END';
        expect(stripJsonBlock(s)).toBe('Belge hazır.');
    });

    it('sızan tool argümanı JSON\'unu ({ "filename": ... }) kaldırır', () => {
        const s = 'Belgeyi hazırlıyorum.\n{\n  "filename": "FR-011 Ders Programı.pdf"\n}';
        const out = stripJsonBlock(s);
        expect(out).toContain('Belgeyi hazırlıyorum.');
        expect(out).not.toContain('filename');
        expect(out).not.toContain('{');
    });

    it('"action" içeren JSON nesnesini kaldırır', () => {
        const s = 'Tamam {"action":"fill_kanit_formu","filename":"FR-585 Kanıt Formu.docx"} bitti';
        const out = stripJsonBlock(s);
        expect(out).not.toContain('action');
        expect(out).toContain('Tamam');
        expect(out).toContain('bitti');
    });
});

describe('cleanStreamingContent', () => {
    it('yarım kalmış (kapanmamış) action JSON\'unu gizler', () => {
        const s = 'Belgeyi hazırlıyorum\n{ "filename": "FR-011';
        expect(cleanStreamingContent(s)).toBe('Belgeyi hazırlıyorum');
    });

    it('yarım kalmış JSON_START\'ı gizler', () => {
        const s = 'Hazırlanıyor\nJSON_START\n{"action":"gen';
        expect(cleanStreamingContent(s)).toBe('Hazırlanıyor');
    });

    it('tamamlanmış bloğu temizler', () => {
        const s = 'Cevap.\nJSON_START\n{"action":"generate_file","filename":"x.pdf"}\nJSON_END';
        expect(cleanStreamingContent(s)).toBe('Cevap.');
    });

    it('teknik artık yoksa metni korur', () => {
        const s = 'Bologna müfredatı şöyledir: ...';
        expect(cleanStreamingContent(s)).toBe(s);
    });
});
