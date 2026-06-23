import { describe, it, expect } from 'vitest';
import { parseTurkishDate, parseJoomlaNewsList } from '@/lib/news-scraper';

describe('parseTurkishDate', () => {
    it('geçerli GG.AA.YYYY → ISO', () => {
        expect(parseTurkishDate('23.06.2026')).toBe('2026-06-23');
        expect(parseTurkishDate('01.01.2025')).toBe('2025-01-01');
    });
    it('metin içindeki tarihi yakalar', () => {
        expect(parseTurkishDate('Yayın: 17.06.2026 ')).toBe('2026-06-17');
    });
    it('geçersiz/aralık dışı → null', () => {
        expect(parseTurkishDate('31.02.2026')).toBeNull(); // 31 Şubat yok
        expect(parseTurkishDate('15.13.2026')).toBeNull(); // 13. ay yok
        expect(parseTurkishDate('00.06.2026')).toBeNull(); // gün 0
        expect(parseTurkishDate('12.06.1850')).toBeNull(); // yıl aralık dışı
    });
    it('boş/eşleşmeyen → null', () => {
        expect(parseTurkishDate('')).toBeNull();
        expect(parseTurkishDate('tarih yok')).toBeNull();
        expect(parseTurkishDate(null)).toBeNull();
    });
});

describe('parseJoomlaNewsList', () => {
    const html = `
      <table><tbody>
        <tr class="cat-list-row0">
          <td headers="categorylist_header_title" class="list-title">
            <a href="/arsiv-haberler/100-yeni-haber">Yeni Haber Başlığı</a>
          </td>
          <td class="list-date small"> 23.06.2026 </td>
        </tr>
        <tr class="cat-list-row1">
          <td class="list-title"><a href="/arsiv-haberler/99-eski-haber">Eski   Haber</a></td>
          <td class="list-date small"> 01.01.2026 </td>
        </tr>
        <tr><td>Menü satırı — haber değil</td></tr>
        <tr class="cat-list-row0">
          <td class="list-title"><a href="/arsiv-haberler/99-eski-haber">Yinelenen URL</a></td>
          <td class="list-date small"> 05.05.2026 </td>
        </tr>
      </tbody></table>`;

    const base = 'https://ahievran.edu.tr';

    it('yalnızca haber satırlarını çıkarır (menü elenir)', () => {
        const items = parseJoomlaNewsList(html, base);
        expect(items).toHaveLength(2); // menü + yinelenen URL elendi
    });
    it('göreli href\'i mutlak URL yapar', () => {
        const items = parseJoomlaNewsList(html, base);
        expect(items.every((i) => i.url.startsWith('https://ahievran.edu.tr/arsiv-haberler/'))).toBe(true);
    });
    it('tarihe göre azalan sıralar (en yeni önce)', () => {
        const items = parseJoomlaNewsList(html, base);
        expect(items[0].dateIso).toBe('2026-06-23');
        expect(items[0].title).toBe('Yeni Haber Başlığı');
    });
    it('başlıktaki fazla boşlukları normalize eder', () => {
        const items = parseJoomlaNewsList(html, base);
        const eski = items.find((i) => i.url.endsWith('99-eski-haber'));
        expect(eski?.title).toBe('Eski Haber');
    });
    it('limit uygular', () => {
        expect(parseJoomlaNewsList(html, base, 1)).toHaveLength(1);
    });
});
