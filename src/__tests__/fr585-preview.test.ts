import { describe, it, expect } from 'vitest';
import { buildFr585PreviewMarkdown, formatTrDate, type Fr585Data } from '@/lib/fr585-template';

const baseData: Fr585Data = {
    sorumluBirim: 'Çiçekdağı MYO Kalite Koordinatörlüğü',
    kanitAdi: 'Oryantasyon Faaliyeti',
    kanitTuru: {
        faaliyet: true,
        surec: false,
        risk: false,
        iyilestirmeDIF: false,
        mys: false,
        diger: false,
        digerAciklama: null,
    },
    gerceklesmeDurumu: { tamamlandi: true, ertelendi: false, iptal: false },
    gerceklesmeTarihi: '2026-03-12',
    kanitIcerigi: 'Söz konusu kanıt, oryantasyon faaliyetine ilişkindir.',
    sonuclarVeDegerlendirme: 'Faaliyet kurumsal hedeflerle uyumlu biçimde tamamlanmıştır.',
    gerekce: null,
};

describe('formatTrDate', () => {
    it('ISO tarihi GG.AA.YYYY yapar', () => {
        expect(formatTrDate('2026-03-12')).toBe('12.03.2026');
    });
    it('boş/null → boş string', () => {
        expect(formatTrDate(null)).toBe('');
        expect(formatTrDate('')).toBe('');
    });
});

describe('buildFr585PreviewMarkdown', () => {
    it('dolu alanları ve işaretli kutuyu içerir', () => {
        const md = buildFr585PreviewMarkdown(baseData);
        expect(md).toContain('Çiçekdağı MYO Kalite Koordinatörlüğü');
        expect(md).toContain('Oryantasyon Faaliyeti');
        expect(md).toContain('☒ Faaliyet'); // işaretli
        expect(md).toContain('☐ Süreç'); // işaretsiz
        expect(md).toContain('☒ Tamamlandı');
        expect(md).toContain('12.03.2026'); // TR tarih
        expect(md).toContain('Söz konusu kanıt');
        expect(md).toContain('kurumsal hedeflerle uyumlu');
    });

    it('boş alanları "—" ile gösterir', () => {
        const md = buildFr585PreviewMarkdown({
            ...baseData,
            sorumluBirim: null,
            kanitAdi: '   ',
        });
        expect(md).toContain('| **Sorumlu Birim/Kişi** | — |');
        expect(md).toContain('| **Kanıtın Adı** | — |');
    });

    it('gerekçe yalnız doluysa eklenir', () => {
        const without = buildFr585PreviewMarkdown(baseData);
        expect(without).not.toContain('Gerekçesi');

        const withGerekce = buildFr585PreviewMarkdown({
            ...baseData,
            gerceklesmeDurumu: { tamamlandi: false, ertelendi: true, iptal: false },
            gerekce: 'Bütçe onayı gecikmiştir.',
        });
        expect(withGerekce).toContain('Gerekçesi');
        expect(withGerekce).toContain('Bütçe onayı gecikmiştir.');
    });

    it('tablo hücrelerindeki pipe karakterini kaçırır', () => {
        const md = buildFr585PreviewMarkdown({ ...baseData, kanitAdi: 'A | B' });
        expect(md).toContain('A \\| B');
    });
});
