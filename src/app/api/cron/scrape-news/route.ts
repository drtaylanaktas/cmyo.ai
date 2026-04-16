/**
 * GET /api/cron/scrape-news
 *
 * Vercel Cron Job endpoint — her gün 14:00 UTC (17:00 TRT) tetiklenir.
 * Çiçekdağı MYO haber arşiv sayfasını tek seferde çekip knowledge_documents
 * tablosuna upsert eder.
 *
 * Strateji: Hobby plan (10s limit) için sadece 1 HTTP isteği yapılır.
 * Arşiv listesinin tüm içeriği (başlıklar, tarihler, URL'ler) tek dokümana kaydedilir.
 *
 * Güvenlik: Authorization: Bearer <CRON_SECRET> header'ı zorunludur.
 */

import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import * as cheerio from 'cheerio';

const BASE_URL = 'https://cicekdagimyo.ahievran.edu.tr';
const NEWS_ARCHIVE_URL = `${BASE_URL}/arsiv-haberler`;
const FILENAME = 'WEB_HABER_ARSIV-HABERLER.txt';
const CATEGORY = 'web-haber';
const PRIORITY = 85;

async function fetchWithTimeout(url: string, timeoutMs = 7000): Promise<string | null> {
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const res = await fetch(url, {
            signal: controller.signal,
            headers: {
                // Ahi Evran altyapısı "bot" UA'larını sessizce timeout'a düşürüyor —
                // gerçek Chrome UA ile HTTP 200 dönüyor.
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
            },
        });
        clearTimeout(timer);
        if (!res.ok) {
            console.warn(`[scrape-news] fetch ${url} → HTTP ${res.status}`);
            return null;
        }
        const body = await res.text();
        console.log(`[scrape-news] fetch ${url} → HTTP 200, ${body.length} bytes`);
        return body;
    } catch (err) {
        console.warn(`[scrape-news] fetch ${url} → error: ${(err as Error).message}`);
        return null;
    }
}

// Arşiv sayfasından haber listesini ve tüm metin içeriğini çıkar
function parseArchivePage(html: string): { newsLines: string[]; bodyText: string } {
    const $ = cheerio.load(html);

    // Gürültü temizle
    $('header, footer, nav, .navbar, .sidebar, script, style, .breadcrumb, .pagination').remove();

    // Haber linklerini topla
    const newsLines: string[] = [];
    const seen = new Set<string>();

    // Öncelikli selector'lar
    const selectors = [
        '.haber-listesi li',
        '.haberler-listesi li',
        '.news-list .item',
        '.icerik .haber',
        'table.haberler tr',
    ];

    let matched = false;
    for (const sel of selectors) {
        if ($(sel).length > 0) {
            $(sel).each((_, el) => {
                const a = $(el).find('a').first();
                const href = a.attr('href');
                if (!href) return;
                const url = href.startsWith('http')
                    ? href
                    : `${BASE_URL}${href.startsWith('/') ? '' : '/'}${href}`;
                const title = a.text().trim() || $(el).find('.baslik, .title, h3, h4').first().text().trim();
                const date = $(el).find('.tarih, .date, time').first().text().trim() || '';
                if (title && url.includes(BASE_URL) && !seen.has(url)) {
                    seen.add(url);
                    newsLines.push(date ? `- [${title}](${url}) — ${date}` : `- [${title}](${url})`);
                }
            });
            if (newsLines.length > 0) { matched = true; break; }
        }
    }

    // Fallback: haber URL pattern'i içeren tüm linkler
    if (!matched) {
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
                !seen.has(fullUrl)
            ) {
                seen.add(fullUrl);
                newsLines.push(`- [${title}](${fullUrl})`);
            }
        });
    }

    // Sayfanın tüm metin içeriği (başlıklar + açıklamalar)
    const mainEl =
        $('.icerik').length ? $('.icerik') :
        $('main').length ? $('main') :
        $('#content').length ? $('#content') :
        $('body');

    const bodyText = mainEl.text()
        .replace(/\t/g, ' ')
        .replace(/[ ]{3,}/g, ' ')
        .replace(/\n{4,}/g, '\n\n\n')
        .trim();

    return { newsLines, bodyText };
}

export async function GET(request: Request) {
    // Güvenlik: CRON_SECRET doğrula
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });
    }

    const startTime = Date.now();

    try {
        // Tek HTTP isteği: arşiv sayfası
        const html = await fetchWithTimeout(NEWS_ARCHIVE_URL, 7000);
        if (!html) {
            return NextResponse.json(
                { error: 'Haber arşivi sayfasına ulaşılamadı', url: NEWS_ARCHIVE_URL },
                { status: 502 }
            );
        }

        const { newsLines, bodyText } = parseArchivePage(html);
        const scrapedAt = new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });

        const content = [
            `Kaynak URL: ${NEWS_ARCHIVE_URL}`,
            `Sayfa Başlığı: Çiçekdağı MYO — Haber Arşivi`,
            `Kategori: ${CATEGORY}`,
            `Kazıma Tarihi: ${scrapedAt}`,
            `Toplam Haber: ${newsLines.length}`,
            '---',
            '',
            newsLines.length > 0
                ? `HABERLER LİSTESİ:\n${newsLines.join('\n')}`
                : '(Haber listesi çıkarılamadı)',
            '',
            '--- SAYFA İÇERİĞİ ---',
            '',
            bodyText,
        ].join('\n').replace(/\0/g, '');

        // DB upsert
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

        // Knowledge base cache'ini geçersiz kıl
        (global as any).knowledgeCacheInvalidated = true;

        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[scrape-news] ${isNew ? 'Eklendi' : 'Güncellendi'}: ${newsLines.length} haber (${duration}s)`);

        return NextResponse.json({
            ok: true,
            action: isNew ? 'inserted' : 'updated',
            newsCount: newsLines.length,
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
