import { sql } from '@vercel/postgres';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import EventCalendar, { EventItem } from '@/components/EventCalendar';

export const revalidate = 3600;
export const dynamic = 'force-dynamic';

function normalizeRow(r: any): EventItem {
    return {
        id: r.id,
        title: r.title,
        description: r.description,
        external_url: r.external_url,
        event_date_text: r.event_date_text,
        event_date: r.event_date
            ? (r.event_date instanceof Date
                ? r.event_date.toISOString().slice(0, 10)
                : String(r.event_date).slice(0, 10))
            : null,
    };
}

async function loadEvents(): Promise<{ dated: EventItem[]; undated: EventItem[] }> {
    try {
        const dated = await sql`
            SELECT id, title, description, event_date, event_date_text, external_url
            FROM events
            WHERE event_date >= date_trunc('month', CURRENT_DATE)
              AND event_date <  date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
            ORDER BY event_date ASC;
        `;
        const undated = await sql`
            SELECT id, title, description, event_date, event_date_text, external_url
            FROM events
            WHERE event_date IS NULL
              AND scraped_at > NOW() - INTERVAL '30 days'
            ORDER BY scraped_at DESC
            LIMIT 20;
        `;
        return {
            dated: dated.rows.map(normalizeRow),
            undated: undated.rows.map(normalizeRow),
        };
    } catch (err) {
        console.error('[/etkinlikler] DB error:', err);
        return { dated: [], undated: [] };
    }
}

export default async function EtkinliklerPage() {
    const { dated, undated } = await loadEvents();
    const today = new Date();
    const monthLabel = today.toLocaleString('tr-TR', {
        month: 'long',
        year: 'numeric',
        timeZone: 'Europe/Istanbul',
    });

    return (
        <main className="min-h-screen bg-[#020510] text-white">
            <header className="h-16 flex items-center justify-between px-4 md:px-8 border-b border-white/5 bg-[#050a14]/50 backdrop-blur-sm">
                <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-300 hover:text-white transition-colors">
                    <ArrowLeft className="w-4 h-4" />
                    Ana Sayfa
                </Link>
                <div className="font-bold tracking-tight">ÇMYO.AI</div>
            </header>

            <section className="px-4 md:px-8 py-8 md:py-12">
                {dated.length === 0 && undated.length === 0 ? (
                    <div className="max-w-md mx-auto text-center mt-20">
                        <h1 className="text-xl font-semibold mb-2 capitalize">{monthLabel}</h1>
                        <p className="text-slate-400 text-sm">
                            Bu ay için henüz yaklaşan etkinlik bulunmuyor. Veriler her gün otomatik güncellenir.
                        </p>
                    </div>
                ) : (
                    <EventCalendar
                        monthLabel={monthLabel}
                        year={today.getFullYear()}
                        monthIndex={today.getMonth()}
                        dated={dated}
                        undated={undated}
                    />
                )}
            </section>
        </main>
    );
}
