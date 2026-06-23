/**
 * GET /api/cron/scrape-news
 * Vercel Cron — her gün 14:00 UTC. Çiçekdağı MYO haberlerini çeker.
 * Çekme/parse/kaydetme mantığı src/lib/news-scraper.ts içinde (direkt fetch + cheerio).
 * Güvenlik: Authorization: Bearer <CRON_SECRET>.
 */
import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { runNewsScrape } from '@/lib/news-scraper';

export const maxDuration = 60;

export async function GET(request: Request) {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });
    }
    try {
        const result = await runNewsScrape('cmyo');
        return NextResponse.json(result, { status: result.ok ? 200 : 502 });
    } catch (err) {
        console.error('[scrape-news] Kritik hata:', err);
        Sentry.captureException(err, { tags: { area: 'cron-scrape-news' } });
        return NextResponse.json({ error: 'Scraping başarısız', detail: String(err) }, { status: 500 });
    }
}
