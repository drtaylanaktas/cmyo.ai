import { sql } from '@vercel/postgres';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import EventCalendar, { NewsItem, NewsSource } from '@/components/EventCalendar';

export const revalidate = 3600;
export const dynamic = 'force-dynamic';

type Row = {
    id: number;
    source: NewsSource;
    title: string;
    external_url: string;
    published_date: string | Date | null;
    published_date_text: string | null;
};

function isoDay(v: string | Date | null): string | null {
    if (!v) return null;
    if (v instanceof Date) {
        const y = v.getUTCFullYear();
        const m = String(v.getUTCMonth() + 1).padStart(2, '0');
        const d = String(v.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    return String(v).slice(0, 10);
}

async function loadNews(): Promise<{
    itemsByDay: Record<string, NewsItem[]>;
    counts: { cmyo: number; ahievran: number };
    totalCount: number;
}> {
    try {
        const result = await sql`
            SELECT id, source, title, external_url, published_date, published_date_text
            FROM news_items
            WHERE published_date >= date_trunc('month', CURRENT_DATE)
              AND published_date <  date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
            ORDER BY published_date DESC, source ASC, id DESC;
        `;
        const rows = result.rows as unknown as Row[];

        const itemsByDay: Record<string, NewsItem[]> = {};
        const counts = { cmyo: 0, ahievran: 0 };

        for (const row of rows) {
            const day = isoDay(row.published_date);
            if (!day) continue;
            const item: NewsItem = {
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

        return { itemsByDay, counts, totalCount: rows.length };
    } catch (err) {
        console.error('[/etkinlikler] DB error:', err);
        return { itemsByDay: {}, counts: { cmyo: 0, ahievran: 0 }, totalCount: 0 };
    }
}

export default async function EtkinliklerPage() {
    const { itemsByDay, counts, totalCount } = await loadNews();
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
                <div className="max-w-5xl mx-auto mb-6 text-center md:text-left">
                    <h1 className="text-2xl md:text-3xl font-bold text-white">Haber Takvimi</h1>
                    <p className="text-sm text-slate-400 mt-1">
                        Bu ayki Çiçekdağı MYO ve Ahi Evran Üniversitesi haberleri — yayın gününe göre renk kodlu.
                    </p>
                </div>

                {totalCount === 0 ? (
                    <div className="max-w-md mx-auto text-center mt-16">
                        <h2 className="text-xl font-semibold mb-2 capitalize">{monthLabel}</h2>
                        <p className="text-slate-400 text-sm">
                            Bu ay için henüz haber bulunmuyor. Veriler her gün otomatik güncellenir.
                        </p>
                    </div>
                ) : (
                    <EventCalendar
                        monthLabel={monthLabel}
                        year={today.getFullYear()}
                        monthIndex={today.getMonth()}
                        itemsByDay={itemsByDay}
                        counts={counts}
                        totalCount={totalCount}
                    />
                )}
            </section>
        </main>
    );
}
