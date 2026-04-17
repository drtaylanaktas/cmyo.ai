/**
 * GET /api/news/by-month
 *
 * İçinde bulunulan ayın Çiçekdağı MYO + Ahi Evran Üniversitesi haberlerini
 * yayın gününe göre gruplayarak döndürür. Takvim UI (MiniCalendar / EventCalendar)
 * bu endpoint'i fetch ederek renk kodlu günlük özetini çıkarır.
 *
 * Public endpoint. Upstash IP rate limit: 30 req/dk. Edge cache 1 saat.
 */

import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { checkRateLimit, getClientIP } from '@/lib/rate-limiter';

export const revalidate = 3600;

type Source = 'cmyo' | 'ahievran';

type Row = {
    id: number;
    source: Source;
    title: string;
    external_url: string;
    published_date: string | Date | null;
    published_date_text: string | null;
};

type Item = {
    id: number;
    source: Source;
    title: string;
    url: string;
    dateText: string | null;
};

function isoDay(v: string | Date | null): string | null {
    if (!v) return null;
    if (v instanceof Date) {
        const y = v.getUTCFullYear();
        const m = String(v.getUTCMonth() + 1).padStart(2, '0');
        const d = String(v.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    // "2026-04-14" veya "2026-04-14T00:00:00..." ilk 10 karakter
    return String(v).slice(0, 10);
}

export async function GET(request: Request) {
    const ip = getClientIP(request);
    const rl = await checkRateLimit(`news-by-month:${ip}`, { maxRequests: 30, windowSeconds: 60 });
    if (!rl.allowed) {
        return NextResponse.json(
            { error: 'Çok fazla istek. Biraz sonra tekrar deneyin.', resetIn: rl.resetIn },
            { status: 429 }
        );
    }

    try {
        const result = await sql`
            SELECT id, source, title, external_url, published_date, published_date_text
            FROM news_items
            WHERE published_date >= date_trunc('month', CURRENT_DATE)
              AND published_date <  date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
            ORDER BY published_date DESC, source ASC, id DESC;
        `;

        const rows = result.rows as unknown as Row[];

        const itemsByDay: Record<string, Item[]> = {};
        const counts = { cmyo: 0, ahievran: 0 };

        for (const row of rows) {
            const day = isoDay(row.published_date);
            if (!day) continue;
            const item: Item = {
                id: row.id,
                source: row.source,
                title: row.title,
                url: row.external_url,
                dateText: row.published_date_text,
            };
            if (!itemsByDay[day]) itemsByDay[day] = [];
            itemsByDay[day].push(item);
            counts[row.source]++;
        }

        const today = new Date();
        const month = today.toLocaleString('tr-TR', { month: 'long', year: 'numeric', timeZone: 'Europe/Istanbul' });

        return NextResponse.json({
            month,
            year: today.getFullYear(),
            monthIndex: today.getMonth(),
            itemsByDay,
            totalCount: rows.length,
            counts,
        });
    } catch (err: unknown) {
        console.error('[news/by-month] error:', err);
        return NextResponse.json({ error: 'Haberler alınamadı.' }, { status: 500 });
    }
}
