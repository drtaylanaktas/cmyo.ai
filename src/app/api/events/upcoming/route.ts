import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { checkRateLimit, getClientIP } from '@/lib/rate-limiter';

export const revalidate = 3600;

export async function GET(request: Request) {
    const ip = getClientIP(request);
    const rl = await checkRateLimit(`events-upcoming:${ip}`, { maxRequests: 30, windowSeconds: 60 });
    if (!rl.allowed) {
        return NextResponse.json(
            { error: 'Çok fazla istek. Biraz sonra tekrar deneyin.', resetIn: rl.resetIn },
            { status: 429 }
        );
    }

    try {
        const datedResult = await sql`
            SELECT id, title, description, event_date, event_date_text, external_url
            FROM events
            WHERE event_date >= date_trunc('month', CURRENT_DATE)
              AND event_date <  date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
            ORDER BY event_date ASC;
        `;

        const undatedResult = await sql`
            SELECT id, title, description, event_date, event_date_text, external_url
            FROM events
            WHERE event_date IS NULL
              AND scraped_at > NOW() - INTERVAL '30 days'
            ORDER BY scraped_at DESC
            LIMIT 20;
        `;

        const today = new Date();
        const month = today.toLocaleString('tr-TR', { month: 'long', year: 'numeric', timeZone: 'Europe/Istanbul' });

        return NextResponse.json({
            month,
            year: today.getFullYear(),
            monthIndex: today.getMonth(),
            dated: datedResult.rows,
            undated: undatedResult.rows,
        });
    } catch (err: any) {
        console.error('[events/upcoming] error:', err);
        return NextResponse.json({ error: 'Etkinlikler alınamadı.' }, { status: 500 });
    }
}
