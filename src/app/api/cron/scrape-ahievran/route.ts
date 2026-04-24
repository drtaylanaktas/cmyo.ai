/**
 * GET /api/cron/scrape-ahievran
 *
 * Vercel Cron Job — her gün 14:30 UTC (17:30 TRT) tetiklenir.
 * Ahi Evran Üniversitesi ana sayfa haberlerini çeker; iki yere yazar:
 *   1) knowledge_documents → WEB_HABER_AHIEVRAN-ANASAYFA.txt (chat RAG için)
 *   2) news_items → source='ahievran' (takvim UI için)
 *
 * Kazıma stratejisi (hibrit):
 *   A) category=8 sayfası → Jina markdown'da `Title<TAB>Date` satırları, tarih sırasına
 *      göre (en yeni ilk). URL üretmiyor ama güncel sıralamayı tam veriyor.
 *   B) /arsiv-haberler sayfaları (alfabetik, sayfalı) → title → gerçek URL haritası.
 *   (A)+(B) merge: tarih sırasını (A) verir, URL'yi mümkünse (B) eşler; eşleşmezse
 *   synthetic fragment URL (`/arsiv-haberler#<slug>`) yazılır — UNIQUE constraint
 *   için yeterli, kullanıcı linki arşiv sayfasına gider.
 *
 * Güvenlik: Authorization: Bearer <CRON_SECRET> header zorunludur.
 */

import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export const maxDuration = 60;

const AHIEVRAN_BASE = 'https://ahievran.edu.tr';
const CATEGORY_URL = `${AHIEVRAN_BASE}/index.php?option=com_content&view=category&id=8`;
const ARCHIVE_URL = `${AHIEVRAN_BASE}/arsiv-haberler`;
// Alfabetik sayfa başına 20 item; 3 sayfa ≈ 60 URL, çoğu güncel haber yakalanır.
const ARCHIVE_PAGES = [0, 20, 40];

const JINA_PREFIX = 'https://r.jina.ai/';
const JINA_TIMEOUT_MS = 25000;

const NEWS_FILENAME = 'WEB_HABER_AHIEVRAN-ANASAYFA.txt';
const NEWS_CATEGORY = 'web-haber-ahievran';
const NEWS_PRIORITY = 85;

async function ensureNewsItemsTable(): Promise<void> {
    await sql`
        CREATE TABLE IF NOT EXISTS news_items (
            id SERIAL PRIMARY KEY,
            external_url TEXT UNIQUE NOT NULL,
            title TEXT NOT NULL,
            published_date DATE,
            published_date_text TEXT,
            source TEXT NOT NULL CHECK (source IN ('cmyo', 'ahievran')),
            scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_news_date ON news_items(published_date);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_news_source ON news_items(source);`;
}

async function fetchViaJina(targetUrl: string, timeoutMs = JINA_TIMEOUT_MS): Promise<string | null> {
    const proxyUrl = `${JINA_PREFIX}${targetUrl}`;
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const res = await fetch(proxyUrl, {
            signal: controller.signal,
            headers: {
                'Accept': 'text/plain, text/markdown',
                'X-With-Links-Summary': 'true',
            },
        });
        clearTimeout(timer);
        if (!res.ok) {
            console.warn(`[scrape-ahievran] jina ${targetUrl} → HTTP ${res.status}`);
            return null;
        }
        const body = await res.text();
        console.log(`[scrape-ahievran] jina ${targetUrl} → HTTP 200, ${body.length} bytes`);
        return body;
    } catch (err) {
        console.warn(`[scrape-ahievran] jina ${targetUrl} → error: ${(err as Error).message}`);
        return null;
    }
}

interface ParsedItem {
    title: string;
    url: string;
    dateText: string;
    dateIso: string | null;
}

/**
 * Türkçe başlığı unicode-safe slug'a çevirir. UNIQUE URL üretimi için kullanılır.
 */
function slugifyTitle(title: string): string {
    const map: Record<string, string> = { 'ı': 'i', 'İ': 'i', 'ğ': 'g', 'Ğ': 'g', 'ü': 'u', 'Ü': 'u', 'ş': 's', 'Ş': 's', 'ö': 'o', 'Ö': 'o', 'ç': 'c', 'Ç': 'c' };
    return title
        .replace(/[ıİğĞüÜşŞöÖçÇ]/g, ch => map[ch] || ch)
        .toLowerCase()
        .replace(/['"‘’“”()]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 120);
}

/**
 * category=8 çıktısı: tarih sırasına göre `Title<TAB>Date` ya da `Title | Date` satırları.
 * URL içermez; bu yüzden sadece tarih+başlık döner.
 */
function parseDateSortedList(markdown: string): Array<{ title: string; dateText: string; dateIso: string }> {
    const out: Array<{ title: string; dateText: string; dateIso: string }> = [];
    const seen = new Set<string>();
    const dateRegex = /(\d{2})\.(\d{2})\.(\d{4})\s*$/; // satır sonunda tarih

    for (const rawLine of markdown.split('\n')) {
        const line = rawLine.replace(/\|/g, '\t').trim();
        const m = line.match(dateRegex);
        if (!m) continue;
        const title = line.slice(0, m.index).replace(/[\t]+/g, ' ').trim().replace(/\s+/g, ' ');
        if (title.length < 10) continue;
        // Tablo header satırlarını ve link etiketlerini ele
        if (/^(başlık|yayınlanma tarihi|title|date)$/i.test(title)) continue;
        if (/^\[[^\]]+\]$/.test(title)) continue;
        if (seen.has(title)) continue;
        seen.add(title);

        const dateText = `${m[1]}.${m[2]}.${m[3]}`;
        const iso = `${m[3]}-${m[2]}-${m[1]}`;
        const d = new Date(iso);
        if (isNaN(d.getTime())) continue;
        out.push({ title, dateText, dateIso: iso });
    }
    return out;
}

/**
 * /arsiv-haberler?start=N çıktısı: `[Title](URL) | Date` satırları, alfabetik.
 * Title → URL haritası döner.
 */
function parseTitleUrlMap(markdown: string): Map<string, string> {
    const map = new Map<string, string>();
    const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
    for (const line of markdown.split('\n')) {
        linkRegex.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = linkRegex.exec(line)) !== null) {
            const title = m[1].trim().replace(/\s+/g, ' ');
            const url = m[2];
            if (!/\/arsiv-haberler\/\d+/.test(url)) continue;
            if (title.length < 10) continue;
            if (!map.has(title)) map.set(title, url);
        }
    }
    return map;
}

async function scrapeNews(): Promise<{ count: number; saved: boolean; persisted: number }> {
    // A) Tarih sıralı liste (URL yok)
    const categoryMd = await fetchViaJina(CATEGORY_URL);
    if (!categoryMd) return { count: 0, saved: false, persisted: 0 };
    const dated = parseDateSortedList(categoryMd).slice(0, 60);
    if (dated.length === 0) return { count: 0, saved: false, persisted: 0 };

    // B) Title → URL haritası — alfabetik arşiv sayfalarından merge
    const titleUrl = new Map<string, string>();
    for (const start of ARCHIVE_PAGES) {
        const pageUrl = start === 0 ? ARCHIVE_URL : `${ARCHIVE_URL}?start=${start}`;
        const md = await fetchViaJina(pageUrl);
        if (!md) continue;
        for (const [t, u] of parseTitleUrlMap(md)) {
            if (!titleUrl.has(t)) titleUrl.set(t, u);
        }
    }

    // Merge
    const items: ParsedItem[] = dated.map(d => {
        const realUrl = titleUrl.get(d.title);
        const url = realUrl
            ? realUrl
            : `${ARCHIVE_URL}#${slugifyTitle(d.title)}`;
        return { title: d.title, url, dateText: d.dateText, dateIso: d.dateIso };
    });

    const scrapedAt = new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
    const lines = items.map(i => `- [${i.title}](${i.url}) — ${i.dateText}`);

    const matchedUrl = items.filter(i => !i.url.includes('#')).length;
    const content = [
        `Kaynak URL: ${CATEGORY_URL}`,
        `Sayfa Başlığı: Kırşehir Ahi Evran Üniversitesi — Ana Sayfa Haberleri`,
        `Kategori: ${NEWS_CATEGORY}`,
        `Kazıma Tarihi: ${scrapedAt}`,
        `Toplam Haber: ${items.length} (direkt URL: ${matchedUrl})`,
        '---',
        '',
        `HABERLER LİSTESİ:`,
        lines.join('\n'),
    ].join('\n').replace(/\0/g, '');

    await sql`
        INSERT INTO knowledge_documents (filename, content, category, priority)
        VALUES (${NEWS_FILENAME}, ${content}, ${NEWS_CATEGORY}, ${NEWS_PRIORITY})
        ON CONFLICT (filename) DO UPDATE
        SET content    = EXCLUDED.content,
            category   = EXCLUDED.category,
            priority   = EXCLUDED.priority,
            updated_at = CURRENT_TIMESTAMP;
    `;

    let persisted = 0;
    for (const item of items) {
        try {
            await sql`
                INSERT INTO news_items (external_url, title, published_date, published_date_text, source)
                VALUES (
                    ${item.url},
                    ${item.title},
                    ${item.dateIso},
                    ${item.dateText || null},
                    'ahievran'
                )
                ON CONFLICT (external_url) DO UPDATE
                SET title                = EXCLUDED.title,
                    published_date       = EXCLUDED.published_date,
                    published_date_text  = EXCLUDED.published_date_text,
                    updated_at           = CURRENT_TIMESTAMP;
            `;
            persisted++;
        } catch (err) {
            console.error('[scrape-ahievran] news_items upsert hatası:', item.url, err);
        }
    }

    (global as any).knowledgeCacheInvalidated = true;
    return { count: items.length, saved: true, persisted };
}

export async function GET(request: Request) {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });
    }

    const startTime = Date.now();

    try {
        await ensureNewsItemsTable();
    } catch (err) {
        console.error('[scrape-ahievran] ensureNewsItemsTable hata:', err);
    }

    let newsOut: unknown;
    try {
        newsOut = await scrapeNews();
    } catch (err) {
        console.error('[scrape-ahievran] scrapeNews hatası:', err);
        newsOut = { count: 0, saved: false, persisted: 0, error: String(err) };
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[scrape-ahievran] news=${JSON.stringify(newsOut)} (${duration}s)`);

    return NextResponse.json({
        ok: true,
        news: newsOut,
        durationSeconds: parseFloat(duration),
    });
}
