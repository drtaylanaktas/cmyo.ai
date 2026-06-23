/**
 * Sağlam haber çekme kütüphanesi.
 *
 * Önceki sistem tamamen Jina proxy + kırılgan markdown regex'e bağlıydı ve
 * site/Jina düzeni değişince sessizce boş dönüyordu. Bu kütüphane **direkt HTTP
 * fetch + cheerio** ile gerçek HTML'i (Joomla kategori-liste tablosu) parse eder;
 * gerçek URL + tarih elde edilir, Jina yalnızca son çare yedek olarak kalır.
 *
 * Hem cron route'ları hem admin manuel yenileme bu kütüphaneyi kullanır.
 */
import * as cheerio from 'cheerio';
import * as Sentry from '@sentry/nextjs';
import { sql } from '@vercel/postgres';
import { storeDocumentEmbedding } from '@/lib/embeddings';

export type NewsSource = 'cmyo' | 'ahievran';

export interface NewsItem {
    title: string;
    url: string;
    dateText: string;
    dateIso: string | null;
}

export interface ScrapeResult {
    source: NewsSource;
    ok: boolean;
    count: number;
    persisted: number;
    method: 'direct' | 'jina' | 'none';
    message?: string;
}

interface SourceConfig {
    listUrl: string;
    baseUrl: string;
    filename: string;
    label: string;
}

const SOURCES: Record<NewsSource, SourceConfig> = {
    cmyo: {
        listUrl: 'https://cicekdagimyo.ahievran.edu.tr/arsiv-haberler',
        baseUrl: 'https://cicekdagimyo.ahievran.edu.tr',
        filename: 'WEB_HABER_ARSIV-HABERLER.txt',
        label: 'Çiçekdağı MYO',
    },
    ahievran: {
        // category=8 = haberler (tarihe göre azalan). &limit=40 ile sadece en yeni 40 →
        // 67KB/~1.5s (limitsiz hali 1.2MB/~18s olup fonksiyon timeout'una yol açıyordu).
        listUrl: 'https://ahievran.edu.tr/index.php?option=com_content&view=category&id=8&limit=40',
        baseUrl: 'https://ahievran.edu.tr',
        filename: 'WEB_HABER_AHIEVRAN-ANASAYFA.txt',
        label: 'Ahi Evran Üniversitesi',
    },
};

const CATEGORY = 'web-haber';
const PRIORITY = 85;
const MAX_ITEMS = 40;
const JINA_PREFIX = 'https://r.jina.ai/';
const UA = 'Mozilla/5.0 (compatible; CMYO-AI-NewsBot/1.0; +https://cmyoai.com)';

// ── Tarih ────────────────────────────────────────────────────────────────────
/** "GG.AA.YYYY" → "YYYY-MM-DD" (aralık doğrulamalı). Geçersizse null. */
export function parseTurkishDate(text: string | null | undefined): string | null {
    if (!text) return null;
    const m = text.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (!m) return null;
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    const year = parseInt(m[3], 10);
    if (month < 1 || month > 12) return null;
    if (day < 1 || day > 31) return null;
    if (year < 2000 || year > 2100) return null;
    // Round-trip doğrulama: V8 '2026-02-31'i Mart 3'e yuvarlar; gerçekten geçerli mi diye gün/ay eşleşmesini kontrol et.
    const d = new Date(Date.UTC(year, month - 1, day));
    if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// ── Parse: Joomla kategori-liste tablosu (cheerio) ────────────────────────────
/**
 * Joomla haber listesi tablosunu parse eder. Her satır:
 *   <tr> <td class="list-title"><a href="/arsiv-haberler/<id>-<slug>">Başlık</a></td>
 *        <td class="list-date">GG.AA.YYYY</td> </tr>
 * Tarihe göre azalan sıralar, dedup eder, en yeni MAX_ITEMS döner.
 */
export function parseJoomlaNewsList(html: string, baseUrl: string, limit = MAX_ITEMS): NewsItem[] {
    const $ = cheerio.load(html);
    const items: NewsItem[] = [];
    const seen = new Set<string>();

    $('tr').each((_, tr) => {
        const $tr = $(tr);
        const a = $tr.find('td.list-title a').first();
        if (!a.length) return;

        let href = (a.attr('href') || '').trim();
        if (!href) return;
        if (!/^https?:/i.test(href)) {
            href = baseUrl + (href.startsWith('/') ? '' : '/') + href;
        }
        const title = a.text().trim().replace(/\s+/g, ' ');
        if (title.length < 5) return;
        if (seen.has(href)) return;
        seen.add(href);

        const dateText = $tr.find('td.list-date').first().text().trim();
        items.push({ title, url: href, dateText, dateIso: parseTurkishDate(dateText) });
    });

    // En yeni önce (tarihsizler en sona).
    items.sort((a, b) => (b.dateIso || '').localeCompare(a.dateIso || ''));
    return items.slice(0, limit);
}

// ── Parse: Jina markdown (yalnızca yedek) ─────────────────────────────────────
function parseJinaMarkdown(markdown: string, hrefPattern: RegExp, limit = MAX_ITEMS): NewsItem[] {
    const items: NewsItem[] = [];
    const seen = new Set<string>();
    const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
    const dateRegex = /(\d{2})\.(\d{2})\.(\d{4})/;
    const lines = markdown.split('\n');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        linkRegex.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = linkRegex.exec(line)) !== null) {
            const title = m[1].trim().replace(/\s+/g, ' ');
            const url = m[2];
            if (!hrefPattern.test(url)) continue;
            if (!title || title.length < 5) continue;
            if (/^image\s*\d*$/i.test(title)) continue;
            if (seen.has(url)) continue;
            seen.add(url);

            let dm = line.match(dateRegex);
            if (!dm && i + 1 < lines.length) dm = lines[i + 1].match(dateRegex);
            if (!dm && i - 1 >= 0) dm = lines[i - 1].match(dateRegex);
            const dateText = dm ? `${dm[1]}.${dm[2]}.${dm[3]}` : '';
            items.push({ title, url, dateText, dateIso: parseTurkishDate(dateText) });
        }
    }
    items.sort((a, b) => (b.dateIso || '').localeCompare(a.dateIso || ''));
    return items.slice(0, limit);
}

// ── Fetch (retry + timeout) ───────────────────────────────────────────────────
async function fetchText(url: string, { retries = 1, timeoutMs = 12000 } = {}): Promise<string | null> {
    for (let attempt = 0; attempt <= retries; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const res = await fetch(url, {
                signal: controller.signal,
                headers: { 'User-Agent': UA, 'Accept': 'text/html,text/plain' },
            });
            clearTimeout(timer);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.text();
        } catch (err) {
            clearTimeout(timer);
            console.warn(`[news] fetch ${url} (deneme ${attempt + 1}) → ${(err as Error).message}`);
            if (attempt < retries) await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
        }
    }
    return null;
}

/** Önce direkt HTML + cheerio; 0 item olursa Jina markdown yedeğine düşer. */
async function fetchNewsItems(cfg: SourceConfig): Promise<{ items: NewsItem[]; method: ScrapeResult['method'] }> {
    const html = await fetchText(cfg.listUrl);
    if (html) {
        const items = parseJoomlaNewsList(html, cfg.baseUrl);
        if (items.length > 0) return { items, method: 'direct' };
    }
    // Yedek: Jina (tek deneme, bütçeyi korumak için)
    const md = await fetchText(`${JINA_PREFIX}${cfg.listUrl}`, { retries: 0, timeoutMs: 15000 });
    if (md) {
        const items = parseJinaMarkdown(md, /\/arsiv-haberler\//);
        if (items.length > 0) return { items, method: 'jina' };
    }
    return { items: [], method: 'none' };
}

// ── DB ────────────────────────────────────────────────────────────────────────
export async function ensureNewsItemsTable(): Promise<void> {
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

function istanbulToday(): string {
    // 'YYYY-MM-DD' (en-CA bu formatı verir)
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
}

/**
 * Tek kaynak için: çek → (boşsa eski veriyi koru + uyar) → knowledge_documents
 * + news_items'a yaz. Cron ve admin manuel yenileme bunu çağırır.
 */
export async function runNewsScrape(source: NewsSource): Promise<ScrapeResult> {
    const cfg = SOURCES[source];
    await ensureNewsItemsTable();

    const { items, method } = await fetchNewsItems(cfg);

    // STALE-PROTECTION: hiç item yoksa mevcut veriyi EZME; görünür uyarı bırak.
    if (items.length === 0) {
        Sentry.captureMessage(`[news] ${source}: 0 haber çekildi (eski veri korundu)`, 'warning');
        console.warn(`[news] ${source}: 0 item — yazma atlandı, eski veri korunuyor`);
        return { source, ok: false, count: 0, persisted: 0, method, message: 'Kaynaktan haber çekilemedi; mevcut veri korundu.' };
    }

    // 1) knowledge_documents (chat RAG)
    const scrapedAt = new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
    const lines = items.map((i) => (i.dateText ? `- [${i.title}](${i.url}) — ${i.dateText}` : `- [${i.title}](${i.url})`));
    const content = [
        `Kaynak URL: ${cfg.listUrl}`,
        `Sayfa Başlığı: ${cfg.label} — Haber Arşivi`,
        `Kategori: ${CATEGORY}`,
        `Kazıma Tarihi: ${scrapedAt}`,
        `Toplam Haber: ${items.length}`,
        '---',
        '',
        'HABERLER LİSTESİ:',
        lines.join('\n'),
    ].join('\n').replace(/\0/g, '');

    const upsert = await sql`
        INSERT INTO knowledge_documents (filename, content, category, priority)
        VALUES (${cfg.filename}, ${content}, ${CATEGORY}, ${PRIORITY})
        ON CONFLICT (filename) DO UPDATE
        SET content = EXCLUDED.content, category = EXCLUDED.category,
            priority = EXCLUDED.priority, updated_at = CURRENT_TIMESTAMP
        RETURNING id
    `;
    if (upsert.rows[0]?.id) {
        await storeDocumentEmbedding(upsert.rows[0].id, cfg.filename, content);
    }

    // 2) news_items (takvim UI) — gerçek URL + tarih (tarihsizse bugün, takvimden düşmesin)
    const today = istanbulToday();
    let persisted = 0;
    for (const item of items) {
        try {
            await sql`
                INSERT INTO news_items (external_url, title, published_date, published_date_text, source)
                VALUES (${item.url}, ${item.title}, ${item.dateIso || today}, ${item.dateText || null}, ${source})
                ON CONFLICT (external_url) DO UPDATE
                SET title = EXCLUDED.title,
                    published_date = EXCLUDED.published_date,
                    published_date_text = EXCLUDED.published_date_text,
                    updated_at = CURRENT_TIMESTAMP;
            `;
            persisted++;
        } catch (err) {
            console.error(`[news] ${source} news_items upsert hatası:`, item.url, err);
        }
    }

    (global as any).knowledgeCacheInvalidated = true;
    console.log(`[news] ${source}: ${items.length} haber (${method}), ${persisted} news_items`);
    return { source, ok: true, count: items.length, persisted, method };
}
