/**
 * GET /api/cron/scrape-news
 *
 * Vercel Cron Job — her gün 14:00 UTC (17:00 TRT) tetiklenir.
 * Çiçekdağı MYO haber arşivini Jina Reader proxy'si üzerinden çeker, iki yere yazar:
 *   1) knowledge_documents → WEB_HABER_ARSIV-HABERLER.txt (chat RAG için)
 *   2) news_items → source='cmyo' (takvim UI için)
 *
 * Güvenlik: Authorization: Bearer <CRON_SECRET> header'ı zorunludur.
 */

import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

const BASE_URL = 'https://cicekdagimyo.ahievran.edu.tr';
const NEWS_ARCHIVE_URL = `${BASE_URL}/arsiv-haberler`;

const JINA_PREFIX = 'https://r.jina.ai/';

const FILENAME = 'WEB_HABER_ARSIV-HABERLER.txt';
const CATEGORY = 'web-haber';
const PRIORITY = 85;

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
            headers: { 'Accept': 'text/plain, text/markdown' },
        });
        clearTimeout(timer);
        if (!res.ok) {
            console.warn(`[scrape-news] jina ${targetUrl} → HTTP ${res.status}`);
            return null;
        }
        const body = await res.text();
        console.log(`[scrape-news] jina ${targetUrl} → HTTP 200, ${body.length} bytes`);
        return body;
    } catch (err) {
        console.warn(`[scrape-news] jina ${targetUrl} → error: ${(err as Error).message}`);
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

            let dateMatch = line.match(dateRegex);
            if (!dateMatch && i + 1 < lines.length) dateMatch = lines[i + 1].match(dateRegex);
            if (!dateMatch && i - 1 >= 0) dateMatch = lines[i - 1].match(dateRegex);

            let dateIso: string | null = null;
            let dateText = '';
            if (dateMatch) {
                dateText = `${dateMatch[1]}.${dateMatch[2]}.${dateMatch[3]}`;
                const iso = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
                const d = new Date(iso);
                if (!isNaN(d.getTime())) dateIso = iso;
            }

            items.push({ title, url, dateText, dateIso });
        }
    }

    return items.slice(0, 60);
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
        console.error('[scrape-news] ensureNewsItemsTable hata:', err);
    }

    try {
        const md = await fetchViaJina(NEWS_ARCHIVE_URL);
        if (!md) {
            return NextResponse.json(
                { error: 'Haber arşivi sayfasına ulaşılamadı', url: NEWS_ARCHIVE_URL },
                { status: 502 }
            );
        }

        const items = parseJinaMarkdown(md, /\/arsiv-haberler\//);
        if (items.length === 0) {
            return NextResponse.json(
                { error: 'Haber listesi parse edilemedi' },
                { status: 502 }
            );
        }

        const scrapedAt = new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
        const lines = items.map(i => i.dateText ? `- [${i.title}](${i.url}) — ${i.dateText}` : `- [${i.title}](${i.url})`);

        const content = [
            `Kaynak URL: ${NEWS_ARCHIVE_URL}`,
            `Sayfa Başlığı: Çiçekdağı MYO — Haber Arşivi`,
            `Kategori: ${CATEGORY}`,
            `Kazıma Tarihi: ${scrapedAt}`,
            `Toplam Haber: ${items.length}`,
            '---',
            '',
            `HABERLER LİSTESİ:`,
            lines.join('\n'),
        ].join('\n').replace(/\0/g, '');

        const upsertResult = await sql`
            INSERT INTO knowledge_documents (filename, content, category, priority)
            VALUES (${FILENAME}, ${content}, ${CATEGORY}, ${PRIORITY})
            ON CONFLICT (filename) DO UPDATE
            SET content    = EXCLUDED.content,
                category   = EXCLUDED.category,
                priority   = EXCLUDED.priority,
                updated_at = CURRENT_TIMESTAMP
            RETURNING (xmax = 0) AS is_insert
        `;
        const isNew = upsertResult.rows[0]?.is_insert;

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
                        'cmyo'
                    )
                    ON CONFLICT (external_url) DO UPDATE
                    SET title                = EXCLUDED.title,
                        published_date       = EXCLUDED.published_date,
                        published_date_text  = EXCLUDED.published_date_text,
                        updated_at           = CURRENT_TIMESTAMP;
                `;
                persisted++;
            } catch (err) {
                console.error('[scrape-news] news_items upsert hatası:', item.url, err);
            }
        }

        (global as any).knowledgeCacheInvalidated = true;

        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[scrape-news] ${isNew ? 'Eklendi' : 'Güncellendi'}: ${items.length} haber, ${persisted} news_items (${duration}s)`);

        return NextResponse.json({
            ok: true,
            action: isNew ? 'inserted' : 'updated',
            newsCount: items.length,
            persistedCount: persisted,
            durationSeconds: parseFloat(duration),
        });
    } catch (err) {
        console.error('[scrape-news] Kritik hata:', err);
        return NextResponse.json(
            { error: 'Scraping başarısız', detail: String(err) },
            { status: 500 }
        );
    }
}
