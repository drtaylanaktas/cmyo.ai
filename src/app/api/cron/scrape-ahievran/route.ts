/**
 * GET /api/cron/scrape-ahievran
 *
 * Vercel Cron Job — her gün 14:30 UTC (17:30 TRT) tetiklenir.
 * Ahi Evran Üniversitesi ana sayfa haberlerini çeker; iki yere yazar:
 *   1) knowledge_documents → WEB_HABER_AHIEVRAN-ANASAYFA.txt (chat RAG için)
 *   2) news_items → source='ahievran' (takvim UI için)
 *
 * Kazıma yöntemi: Ahi Evran sunucusu Vercel IP aralıklarına HTTP 418 döndürüyor.
 * Jina Reader proxy'si (`r.jina.ai`) ücretsiz, API key gerektirmez ve HTML'i
 * LLM-dostu markdown'a çevirir. Her satır format: `[Başlık](URL)DD.MM.YYYY`.
 *
 * Güvenlik: Authorization: Bearer <CRON_SECRET> header zorunludur.
 */

import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

const AHIEVRAN_BASE = 'https://ahievran.edu.tr';
const NEWS_URL = `${AHIEVRAN_BASE}/index.php?option=com_content&view=category&id=8`;

const JINA_PREFIX = 'https://r.jina.ai/';

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

async function fetchViaJina(targetUrl: string, timeoutMs = 8000): Promise<string | null> {
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

function parseJinaMarkdown(markdown: string, hrefPattern: RegExp): ParsedItem[] {
    const items: ParsedItem[] = [];
    const seen = new Set<string>();

    const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
    const dateRegex = /(\d{2})\.(\d{2})\.(\d{4})/;

    const titleDateMap = new Map<string, { dateText: string; dateIso: string | null }>();
    const lines = markdown.split('\n');
    for (const line of lines) {
        const dm = line.match(dateRegex);
        if (!dm) continue;
        const cleanTitle = line.replace(dateRegex, '').replace(/[|\t]+/g, ' ').trim().replace(/\s+/g, ' ');
        if (cleanTitle.length >= 5) {
            const dateText = `${dm[1]}.${dm[2]}.${dm[3]}`;
            const iso = `${dm[3]}-${dm[2]}-${dm[1]}`;
            const d = new Date(iso);
            titleDateMap.set(cleanTitle, {
                dateText,
                dateIso: !isNaN(d.getTime()) ? iso : null,
            });
        }
    }

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

            let dateIso: string | null = null;
            let dateText = '';

            const mapped = titleDateMap.get(title);
            if (mapped) {
                dateText = mapped.dateText;
                dateIso = mapped.dateIso;
            } else {
                let dateMatch = line.match(dateRegex);
                if (!dateMatch && i + 1 < lines.length) dateMatch = lines[i + 1].match(dateRegex);
                if (!dateMatch && i - 1 >= 0) dateMatch = lines[i - 1].match(dateRegex);
                if (dateMatch) {
                    dateText = `${dateMatch[1]}.${dateMatch[2]}.${dateMatch[3]}`;
                    const iso = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
                    const d = new Date(iso);
                    if (!isNaN(d.getTime())) dateIso = iso;
                }
            }

            items.push({ title, url, dateText, dateIso });
        }
    }

    return items.slice(0, 80);
}

async function scrapeNews(): Promise<{ count: number; saved: boolean; persisted: number }> {
    const md = await fetchViaJina(NEWS_URL);
    if (!md) return { count: 0, saved: false, persisted: 0 };

    const items = parseJinaMarkdown(md, /\/arsiv-haberler\//);
    if (items.length === 0) return { count: 0, saved: false, persisted: 0 };

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
