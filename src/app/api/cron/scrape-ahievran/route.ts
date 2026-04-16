/**
 * GET /api/cron/scrape-ahievran
 *
 * Vercel Cron Job — her gün 14:30 UTC (17:30 TRT) tetiklenir.
 * Ahi Evran Üniversitesi ana sayfa haberlerini ve yaklaşan etkinliklerini
 * paralel olarak çeker. Haberler knowledge_documents tablosuna (RAG için),
 * etkinlikler structured events tablosuna (takvim UI için) yazılır.
 *
 * Strateji: Hobby plan 10s limit içinde sığar — iki fetch paraleldir,
 * her biri 4500ms timeout, Promise.allSettled ile kısmi başarı kabul edilir.
 *
 * Güvenlik: Authorization: Bearer <CRON_SECRET> header zorunludur.
 */

import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import * as cheerio from 'cheerio';

const AHIEVRAN_BASE = 'https://ahievran.edu.tr';
const NEWS_URL = `${AHIEVRAN_BASE}/index.php?option=com_content&view=category&id=8`;
const EVENTS_URL = `${AHIEVRAN_BASE}/index.php?option=com_content&view=category&id=11`;

const NEWS_FILENAME = 'WEB_HABER_AHIEVRAN-ANASAYFA.txt';
const NEWS_CATEGORY = 'web-haber-ahievran';
const NEWS_PRIORITY = 85;

async function ensureEventsTable(): Promise<void> {
    await sql`
        CREATE TABLE IF NOT EXISTS events (
            id SERIAL PRIMARY KEY,
            external_url TEXT UNIQUE NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            event_date DATE,
            event_date_text TEXT,
            source TEXT DEFAULT 'ahievran-etkinlik',
            scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date);`;
}

async function fetchWithTimeout(url: string, timeoutMs = 4500): Promise<string | null> {
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const res = await fetch(url, {
            signal: controller.signal,
            headers: {
                // Ahi Evran sitesi "bot" user-agent'larını sessizce timeout'a düşürüyor —
                // gerçek Chrome UA ile istek attığımızda HTTP 200 dönüyor.
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
            },
        });
        clearTimeout(timer);
        if (!res.ok) {
            console.warn(`[scrape-ahievran] fetch ${url} → HTTP ${res.status}`);
            return null;
        }
        const body = await res.text();
        console.log(`[scrape-ahievran] fetch ${url} → HTTP 200, ${body.length} bytes`);
        return body;
    } catch (err) {
        console.warn(`[scrape-ahievran] fetch ${url} → error: ${(err as Error).message}`);
        return null;
    }
}

function absolutize(href: string): string {
    if (!href) return '';
    if (href.startsWith('http')) return href;
    return `${AHIEVRAN_BASE}${href.startsWith('/') ? '' : '/'}${href}`;
}

interface ParsedItem {
    title: string;
    url: string;
    dateText: string;
    dateIso: string | null;
    intro: string;
}

// Ahi Evran sitesi tablo-tabanlı yapı kullanıyor:
//   <tr><td><a href="/arsiv-haberler/9781-...">Başlık</a></td><td>16.04.2026</td></tr>
// Bu parser href pattern'ine göre bağlantıları toplar ve satır metninden
// dd.mm.yyyy tarihini çıkarır.
function parseByHrefPattern(html: string, hrefPattern: RegExp): ParsedItem[] {
    const $ = cheerio.load(html);
    $('header, footer, nav, .navbar, .sidebar, script, style, .breadcrumb, .pagination').remove();

    const items: ParsedItem[] = [];
    const seen = new Set<string>();

    $('a[href]').each((_, node) => {
        const a = $(node);
        const href = a.attr('href') || '';
        const url = absolutize(href);
        if (!hrefPattern.test(url)) return;

        const title = a.text().trim().replace(/\s+/g, ' ');
        if (!title || title.length < 5) return;
        if (seen.has(url)) return;
        seen.add(url);

        // En yakın satır/öğe konteynerini bul — tarih aynı satırda yazılı
        const parent = a.closest('tr, li, article, .item, div').first();
        const parentText = (parent.length ? parent.text() : a.parent().text()) || '';
        const m = parentText.match(/(\d{2})\.(\d{2})\.(\d{4})/);
        let dateIso: string | null = null;
        let dateText = '';
        if (m) {
            dateText = `${m[1]}.${m[2]}.${m[3]}`;
            const iso = `${m[3]}-${m[2]}-${m[1]}`;
            const d = new Date(iso);
            if (!isNaN(d.getTime())) dateIso = iso;
        }

        items.push({ title, url, dateText, dateIso, intro: '' });
    });

    return items.slice(0, 60);
}

async function scrapeNews(): Promise<{ count: number; saved: boolean }> {
    const html = await fetchWithTimeout(NEWS_URL);
    if (!html) return { count: 0, saved: false };

    const items = parseByHrefPattern(html, /\/arsiv-haberler\//);
    if (items.length === 0) return { count: 0, saved: false };

    const scrapedAt = new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
    const lines = items.map(i => i.dateText ? `- [${i.title}](${i.url}) — ${i.dateText}` : `- [${i.title}](${i.url})`);

    const content = [
        `Kaynak URL: ${NEWS_URL}`,
        `Sayfa Başlığı: Kırşehir Ahi Evran Üniversitesi — Ana Sayfa Haberleri`,
        `Kategori: ${NEWS_CATEGORY}`,
        `Kazıma Tarihi: ${scrapedAt}`,
        `Toplam Haber: ${items.length}`,
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

    (global as any).knowledgeCacheInvalidated = true;
    return { count: items.length, saved: true };
}

async function scrapeEvents(): Promise<{ count: number; saved: number }> {
    const html = await fetchWithTimeout(EVENTS_URL);
    if (!html) return { count: 0, saved: 0 };

    const items = parseByHrefPattern(html, /\/arsiv-etkinlikler\//);
    if (items.length === 0) return { count: 0, saved: 0 };

    let saved = 0;
    for (const item of items) {
        try {
            await sql`
                INSERT INTO events (external_url, title, description, event_date, event_date_text, source)
                VALUES (
                    ${item.url},
                    ${item.title},
                    ${item.intro || null},
                    ${item.dateIso},
                    ${item.dateText || null},
                    'ahievran-etkinlik'
                )
                ON CONFLICT (external_url) DO UPDATE
                SET title           = EXCLUDED.title,
                    description     = EXCLUDED.description,
                    event_date      = EXCLUDED.event_date,
                    event_date_text = EXCLUDED.event_date_text,
                    updated_at      = CURRENT_TIMESTAMP;
            `;
            saved++;
        } catch (err) {
            console.error('[scrape-ahievran] Etkinlik upsert hatası:', item.url, err);
        }
    }

    return { count: items.length, saved };
}

export async function GET(request: Request) {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });
    }

    const startTime = Date.now();

    try {
        await ensureEventsTable();
    } catch (err) {
        console.error('[scrape-ahievran] ensureEventsTable hata:', err);
    }

    const [newsRes, eventsRes] = await Promise.allSettled([scrapeNews(), scrapeEvents()]);

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    const newsOut = newsRes.status === 'fulfilled' ? newsRes.value : { count: 0, saved: false, error: String(newsRes.reason) };
    const eventsOut = eventsRes.status === 'fulfilled' ? eventsRes.value : { count: 0, saved: 0, error: String(eventsRes.reason) };

    console.log(`[scrape-ahievran] news=${JSON.stringify(newsOut)} events=${JSON.stringify(eventsOut)} (${duration}s)`);

    return NextResponse.json({
        ok: true,
        news: newsOut,
        events: eventsOut,
        durationSeconds: parseFloat(duration),
    });
}
