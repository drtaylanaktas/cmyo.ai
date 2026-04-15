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
                'User-Agent': 'Mozilla/5.0 (compatible; CMYO-AI-Bot/1.0; +https://cmyoai.com)',
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'tr-TR,tr;q=0.9',
            },
        });
        clearTimeout(timer);
        if (!res.ok) return null;
        return await res.text();
    } catch {
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

function parseJoomlaCategory(html: string): ParsedItem[] {
    const $ = cheerio.load(html);
    $('header, footer, nav, .navbar, .sidebar, script, style, .breadcrumb, .pagination').remove();

    const items: ParsedItem[] = [];
    const seen = new Set<string>();

    const pickDate = (el: cheerio.Cheerio<any>): { dateText: string; dateIso: string | null } => {
        const time = el.find('time[datetime]').first();
        if (time.length) {
            const dt = time.attr('datetime') || '';
            const txt = time.text().trim() || dt;
            const d = new Date(dt);
            if (!isNaN(d.getTime())) return { dateText: txt, dateIso: d.toISOString().slice(0, 10) };
            return { dateText: txt, dateIso: null };
        }
        const txt = el.find('.published, .create, .modified, .item-date, .tarih').first().text().trim();
        if (txt) {
            const m = txt.match(/(\d{2})[.\-\/](\d{2})[.\-\/](\d{4})/);
            if (m) {
                const iso = `${m[3]}-${m[2]}-${m[1]}`;
                const d = new Date(iso);
                if (!isNaN(d.getTime())) return { dateText: txt, dateIso: iso };
            }
            return { dateText: txt, dateIso: null };
        }
        return { dateText: '', dateIso: null };
    };

    const selectors = [
        'div.items-leading div.item',
        'div.items-row div.item',
        'div.category-list table.category tr',
        'ul.category li',
        'div.blog div.items-leading article',
        'div.blog article',
    ];

    for (const sel of selectors) {
        const nodes = $(sel);
        if (nodes.length === 0) continue;
        nodes.each((_, node) => {
            const el = $(node);
            const a = el.find('h2.item-title a, h3.item-title a, .page-header a, a.url, td.list-title a, a').first();
            const href = a.attr('href');
            if (!href) return;
            const url = absolutize(href);
            if (!/com_content|\/haber|\/etkinlik|id=\d+/.test(url)) return;
            const title = a.text().trim();
            if (!title || title.length < 4) return;
            if (seen.has(url)) return;
            seen.add(url);

            const { dateText, dateIso } = pickDate(el);
            const intro = el.find('.introtext p, p').first().text().trim().slice(0, 400);

            items.push({ title, url, dateText, dateIso, intro });
        });
        if (items.length > 0) break;
    }

    if (items.length === 0) {
        $('a[href*="option=com_content"]').each((_, node) => {
            const el = $(node);
            const href = el.attr('href') || '';
            const url = absolutize(href);
            const title = el.text().trim();
            if (!title || title.length < 6) return;
            if (seen.has(url)) return;
            seen.add(url);
            items.push({ title, url, dateText: '', dateIso: null, intro: '' });
        });
    }

    return items.slice(0, 40);
}

async function scrapeNews(): Promise<{ count: number; saved: boolean }> {
    const html = await fetchWithTimeout(NEWS_URL);
    if (!html) return { count: 0, saved: false };

    const items = parseJoomlaCategory(html);
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

    const items = parseJoomlaCategory(html);
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
