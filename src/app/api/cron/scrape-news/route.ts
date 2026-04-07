/**
 * GET /api/cron/scrape-news
 *
 * Vercel Cron Job endpoint — her gün 14:00 UTC (17:00 TRT) tetiklenir.
 * Çiçekdağı MYO haber arşivini çekip knowledge_documents tablosuna upsert eder.
 *
 * Güvenlik: Authorization: Bearer <CRON_SECRET> header'ı zorunludur.
 */

import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import * as cheerio from 'cheerio';

const BASE_URL = 'https://cicekdagimyo.ahievran.edu.tr';
const NEWS_ARCHIVE_URL = `${BASE_URL}/arsiv-haberler`;
const CATEGORY = 'web-haber';
const PRIORITY = 80;
// Vercel Hobby plan: 10s timeout — güvenli üst limit
const MAX_NEWS_PER_RUN = 20;
const RUN_TIMEOUT_MS = 8500;

// Türkçe karakter normalize + URL → dosya adı
function urlToNewsFilename(url: string): string {
    const trMap: Record<string, string> = {
        'ş': 's', 'ğ': 'g', 'ü': 'u', 'ö': 'o', 'ç': 'c', 'ı': 'i',
        'Ş': 'S', 'Ğ': 'G', 'Ü': 'U', 'Ö': 'O', 'Ç': 'C', 'İ': 'I',
    };
    const slug = url
        .replace(BASE_URL, '')
        .replace(/^\/+|\/+$/g, '')
        .split('')
        .map((c) => trMap[c] || c)
        .join('')
        .replace(/[^a-zA-Z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .toUpperCase()
        .slice(0, 80);
    return `WEB_HABER_${slug}.txt`;
}

// Timeout destekli fetch
async function fetchWithTimeout(url: string, timeoutMs = 8000): Promise<string | null> {
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

interface NewsItem {
    url: string;
    title: string;
    date: string;
}

// Haber arşiv sayfasından liste çıkar
function parseNewsList(html: string): NewsItem[] {
    const $ = cheerio.load(html);
    const items: NewsItem[] = [];

    // Ahievran CMS yapısına göre — öncelik sırasına göre dene
    const selectors = [
        '.haber-listesi li',
        '.haberler-listesi li',
        '.news-list .item',
        '.icerik .haber',
        'table.haberler tr',
    ];

    for (const sel of selectors) {
        if ($(sel).length > 0) {
            $(sel).each((_, el) => {
                const a = $(el).find('a').first();
                const href = a.attr('href');
                if (!href) return;
                const url = href.startsWith('http')
                    ? href
                    : `${BASE_URL}${href.startsWith('/') ? '' : '/'}${href}`;
                const title =
                    a.text().trim() ||
                    $(el).find('.baslik, .title, h3, h4').first().text().trim();
                const date = $(el).find('.tarih, .date, time').first().text().trim() || '';
                if (title && url.includes(BASE_URL)) {
                    items.push({ url, title, date });
                }
            });
            if (items.length > 0) break;
        }
    }

    // Fallback: haber veya arsiv içeren tüm linkleri tara
    if (items.length === 0) {
        $('a[href]').each((_, el) => {
            const href = $(el).attr('href') || '';
            const fullUrl = href.startsWith('http')
                ? href
                : `${BASE_URL}/${href.replace(/^\//, '')}`;
            const title = $(el).text().trim();
            if (
                fullUrl.includes(BASE_URL) &&
                /\/(haber|arsiv-haber|detay)/.test(fullUrl) &&
                title.length > 5 &&
                !items.some((i) => i.url === fullUrl)
            ) {
                items.push({ url: fullUrl, title, date: '' });
            }
        });
    }

    return items.slice(0, MAX_NEWS_PER_RUN);
}

// Tek haberin tam içeriğini çıkar
function parseNewsDetail(html: string, item: NewsItem): string {
    const $ = cheerio.load(html);

    $('header, footer, nav, .navbar, .sidebar, script, style, .breadcrumb, .pagination').remove();

    const title =
        $('h1').first().text().trim() ||
        $('h2').first().text().trim() ||
        item.title;

    const contentEl =
        $('.icerik').length ? $('.icerik') :
        $('main').length ? $('main') :
        $('#content').length ? $('#content') :
        $('.haber-icerik').length ? $('.haber-icerik') :
        $('.content-area').length ? $('.content-area') :
        $('article').length ? $('article') :
        $('body');

    const bodyText = contentEl.text()
        .replace(/\t/g, ' ')
        .replace(/[ ]{3,}/g, ' ')
        .replace(/\n{4,}/g, '\n\n\n')
        .trim();

    const scrapedAt = new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });

    return [
        `Kaynak URL: ${item.url}`,
        `Sayfa Başlığı: ${title}`,
        `Haber Tarihi: ${item.date || 'Belirtilmemiş'}`,
        `Kategori: ${CATEGORY}`,
        `Kazıma Tarihi: ${scrapedAt}`,
        '---',
        '',
        bodyText,
    ].join('\n').replace(/\0/g, '');
}

export async function GET(request: Request) {
    // Güvenlik: CRON_SECRET doğrula
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });
    }

    const startTime = Date.now();
    const results = { inserted: 0, updated: 0, skipped: 0, errors: 0 };

    try {
        // 1. Haber arşiv listesini çek
        const listHtml = await fetchWithTimeout(NEWS_ARCHIVE_URL, 8000);
        if (!listHtml) {
            return NextResponse.json(
                { error: 'Haber arşivi sayfasına ulaşılamadı', url: NEWS_ARCHIVE_URL },
                { status: 502 }
            );
        }

        const newsItems = parseNewsList(listHtml);
        if (newsItems.length === 0) {
            return NextResponse.json(
                { warning: 'Haber listesi boş — selector eşleşmedi', url: NEWS_ARCHIVE_URL },
                { status: 200 }
            );
        }

        // 2. Her haber için detay çek + DB upsert
        for (const item of newsItems) {
            // Timeout koruması (Vercel Hobby: 10s)
            if (Date.now() - startTime > RUN_TIMEOUT_MS) {
                console.warn(`[scrape-news] Timeout koruması: ${results.inserted + results.updated} haber işlendi`);
                break;
            }

            try {
                const filename = urlToNewsFilename(item.url);
                const detailHtml = await fetchWithTimeout(item.url, 6000);

                let content: string;
                if (detailHtml) {
                    content = parseNewsDetail(detailHtml, item);
                } else {
                    // Detay sayfasına ulaşılamazsa minimal kayıt
                    content = [
                        `Kaynak URL: ${item.url}`,
                        `Sayfa Başlığı: ${item.title}`,
                        `Haber Tarihi: ${item.date || 'Belirtilmemiş'}`,
                        `Kategori: ${CATEGORY}`,
                        `Not: Detay içeriği alınamadı`,
                    ].join('\n');
                    results.skipped++;
                }

                const upsertResult = await sql`
                    INSERT INTO knowledge_documents (filename, content, category, priority)
                    VALUES (${filename}, ${content}, ${CATEGORY}, ${PRIORITY})
                    ON CONFLICT (filename) DO UPDATE
                    SET content    = EXCLUDED.content,
                        category   = EXCLUDED.category,
                        priority   = EXCLUDED.priority,
                        updated_at = CURRENT_TIMESTAMP
                    RETURNING (xmax = 0) AS is_insert
                `;

                if (upsertResult.rows[0]?.is_insert) {
                    results.inserted++;
                } else {
                    results.updated++;
                }
            } catch (itemErr) {
                console.error(`[scrape-news] Haber hatası: ${item.url}`, itemErr);
                results.errors++;
            }
        }

        // 3. Knowledge base cache'ini geçersiz kıl
        (global as any).knowledgeCacheInvalidated = true;

        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[scrape-news] Tamamlandı: ${JSON.stringify(results)} (${duration}s)`);

        return NextResponse.json({
            ok: true,
            processed: newsItems.length,
            ...results,
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
