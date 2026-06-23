/**
 * POST /api/admin/refresh-news
 * Admin'in haberleri elle (cron beklemeden) yenilemesi için. Her iki kaynağı çeker.
 */
import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { getSession } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limiter';
import { runNewsScrape, NewsSource } from '@/lib/news-scraper';

export const maxDuration = 60;

export async function POST(request: Request) {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
        return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 403 });
    }
    const rl = await checkRateLimit(`admin:${session.email}`, RATE_LIMITS.admin);
    if (!rl.allowed) return NextResponse.json({ error: `Çok fazla istek. ${rl.resetIn} sn sonra deneyin.` }, { status: 429 });

    // İsteğe bağlı kaynak seçimi; yoksa ikisi de.
    let sources: NewsSource[] = ['cmyo', 'ahievran'];
    try {
        const body = await request.json();
        if (body?.source === 'cmyo' || body?.source === 'ahievran') sources = [body.source];
    } catch { /* body opsiyonel */ }

    logger.audit('ADMIN_NEWS_REFRESH', { admin: session.email, sources });

    const results = [];
    for (const source of sources) {
        try {
            results.push(await runNewsScrape(source));
        } catch (err) {
            console.error(`[refresh-news] ${source} hata:`, err);
            Sentry.captureException(err, { tags: { area: 'admin-refresh-news', source } });
            results.push({ source, ok: false, count: 0, persisted: 0, method: 'none', message: String(err) });
        }
    }

    return NextResponse.json({ results });
}
