/**
 * GET /api/cron/scrape-ahievran
 *
 * Vercel Cron Job — her gün 14:30 UTC (17:30 TRT) tetiklenir.
 * Ahi Evran Üniversitesi ana sayfa haberlerini ve yaklaşan etkinliklerini
 * paralel olarak çeker. Haberler knowledge_documents tablosuna (RAG için),
 * etkinlikler structured events tablosuna (takvim UI için) yazılır.
 *
 * Kazıma yöntemi: Ahi Evran sunucusu Vercel IP aralıklarına HTTP 418 döndürüyor
 * (lokalden de 11-14s sürüyor, 10s Hobby limitini aşar). Bunu bypass etmek için
 * Jina Reader proxy'si (`r.jina.ai`) kullanılıyor — ücretsiz, API key gerektirmez,
 * HTML'i LLM-dostu markdown olarak döndürür. Formatı:
 *   [Başlık](URL)DD.MM.YYYY
 * bir satırda. Regex ile parse ediyoruz.
 *
 * Güvenlik: Authorization: Bearer <CRON_SECRET> header zorunludur.
 */

import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

const AHIEVRAN_BASE = 'https://ahievran.edu.tr';
const NEWS_URL = `${AHIEVRAN_BASE}/index.php?option=com_content&view=category&id=8`;
const EVENTS_URL = `${AHIEVRAN_BASE}/index.php?option=com_content&view=category&id=11`;

// Jina Reader — HTML'i markdown'a çeviren ücretsiz proxy
const JINA_PREFIX = 'https://r.jina.ai/';

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

async function fetchViaJina(targetUrl: string, timeoutMs = 8000): Promise<string | null> {
    const proxyUrl = `${JINA_PREFIX}${targetUrl}`;
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const res = await fetch(proxyUrl, {
            signal: controller.signal,
            headers: {
                // X-Return-Format: markdown zaten default; Accept ile onaylıyoruz.
                'Accept': 'text/plain, text/markdown',
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
    intro: string;
}

// Jina Reader çıktısı her satırda "[Başlık](URL)DD.MM.YYYY" pattern'i içerir.
// Aynı URL'ye birden fazla link olabilir (thumbnail + title) — dedup gerekir.
// Tarih linkin yanında bitişik olabilir veya başka satırda — en yakın tarihi alıyoruz.
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
            // Jina bazen "Image N" veya "![...]" alt-text'i link olarak verir — filtrele
            if (/^image\s*\d*$/i.test(title)) continue;
            if (seen.has(url)) continue;
            seen.add(url);

            // Satırda veya komşu satırlarda tarih ara
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

            items.push({ title, url, dateText, dateIso, intro: '' });
        }
    }

    return items.slice(0, 60);
}

async function scrapeNews(): Promise<{ count: number; saved: boolean }> {
    const md = await fetchViaJina(NEWS_URL);
    if (!md) return { count: 0, saved: false };

    const items = parseJinaMarkdown(md, /\/arsiv-haberler\//);
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
    const md = await fetchViaJina(EVENTS_URL);
    if (!md) return { count: 0, saved: 0 };

    const items = parseJinaMarkdown(md, /\/arsiv-etkinlikler\//);
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
