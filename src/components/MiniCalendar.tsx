'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Calendar, ChevronRight, ExternalLink } from 'lucide-react';

type Source = 'cmyo' | 'ahievran';

type NewsItem = {
    id: number;
    source: Source;
    title: string;
    url: string;
    dateText: string | null;
};

type NewsByMonthResponse = {
    month: string;
    year: number;
    monthIndex: number;
    itemsByDay: Record<string, NewsItem[]>;
    totalCount: number;
    counts: { cmyo: number; ahievran: number };
};

const WEEKDAYS = ['P', 'S', 'Ç', 'P', 'C', 'C', 'P'];

const ORANGE = '#ff7b1a';

const SOURCE_LABEL: Record<Source, string> = {
    cmyo: 'Çiçekdağı MYO',
    ahievran: 'Ahi Evran Üniversitesi',
};

export default function MiniCalendar() {
    const [data, setData] = useState<NewsByMonthResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [selectedDay, setSelectedDay] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        fetch('/api/news/by-month')
            .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
            .then((d: NewsByMonthResponse) => { if (!cancelled) setData(d); })
            .catch(e => { if (!cancelled) setError(String(e)); });
        return () => { cancelled = true; };
    }, []);

    const grid = useMemo(() => {
        if (!data) return [] as Array<{ day: number | null; iso: string | null }>;
        const { year, monthIndex } = data;
        const firstOfMonth = new Date(year, monthIndex, 1);
        const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
        const jsDay = firstOfMonth.getDay();
        const leadingBlanks = (jsDay === 0 ? 6 : jsDay - 1);
        const cells: Array<{ day: number | null; iso: string | null }> = [];
        for (let i = 0; i < leadingBlanks; i++) cells.push({ day: null, iso: null });
        for (let d = 1; d <= daysInMonth; d++) {
            const iso = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            cells.push({ day: d, iso });
        }
        while (cells.length < 42) cells.push({ day: null, iso: null });
        return cells;
    }, [data]);

    const todayIso = (() => {
        const t = new Date();
        return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
    })();

    const selectedItems = selectedDay && data ? (data.itemsByDay[selectedDay] || []) : [];
    const selectedCmyo = selectedItems.filter(i => i.source === 'cmyo');
    const selectedAhi = selectedItems.filter(i => i.source === 'ahievran');

    return (
        <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#050a14]/60 backdrop-blur-sm p-4">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center border"
                        style={{ background: 'rgba(0,128,255,0.12)', borderColor: 'rgba(0,128,255,0.35)' }}
                    >
                        <Calendar className="w-4 h-4" style={{ color: 'var(--neon-blue)' }} />
                    </div>
                    <div>
                        <div className="text-[11px] uppercase tracking-wider text-slate-500">Haber Takvimi</div>
                        <div className="text-sm font-semibold text-white capitalize leading-tight">
                            {data ? data.month : '...'}
                        </div>
                    </div>
                </div>
                <Link
                    href="/etkinlikler"
                    className="inline-flex items-center gap-0.5 text-[11px] text-slate-300 hover:text-white transition-colors"
                >
                    Tümü <ChevronRight className="w-3 h-3" />
                </Link>
            </div>

            {error && (
                <div className="text-xs text-red-300 py-6 text-center">Haberler yüklenemedi.</div>
            )}

            {!error && !data && (
                <div className="text-xs text-slate-500 py-6 text-center">Yükleniyor…</div>
            )}

            {data && (
                <>
                    <div className="grid grid-cols-7 gap-1 mb-1.5">
                        {WEEKDAYS.map((w, i) => (
                            <div key={i} className="text-center text-[10px] font-medium text-slate-500 py-0.5">{w}</div>
                        ))}
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                        {grid.map((cell, idx) => {
                            if (cell.day === null) {
                                return <div key={idx} className="aspect-square" />;
                            }
                            const iso = cell.iso!;
                            const items = data.itemsByDay[iso] || [];
                            const isToday = iso === todayIso;
                            const hasItem = items.length > 0;
                            const sources = Array.from(new Set(items.map(i => i.source))) as Source[];
                            const hasCmyo = sources.includes('cmyo');
                            const hasAhi = sources.includes('ahievran');

                            return (
                                <button
                                    key={idx}
                                    type="button"
                                    onClick={() => hasItem && setSelectedDay(iso)}
                                    disabled={!hasItem}
                                    className={`aspect-square rounded-md text-[11px] font-medium flex items-center justify-center transition-all relative
                                        ${hasItem ? 'cursor-pointer hover:scale-110' : 'cursor-default'}
                                    `}
                                    style={{
                                        background: hasItem
                                            ? 'linear-gradient(135deg, rgba(255,123,26,0.18), rgba(0,255,136,0.14))'
                                            : 'rgba(255,255,255,0.02)',
                                        color: hasItem ? '#ffffff' : (isToday ? '#ffffff' : '#94a3b8'),
                                        boxShadow: isToday ? '0 0 0 1px var(--neon-green) inset' : undefined,
                                    }}
                                    title={hasItem ? `${items.length} haber` : undefined}
                                >
                                    {cell.day}
                                    {hasItem && (
                                        <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 flex gap-0.5">
                                            {hasCmyo && (
                                                <span
                                                    className="w-1 h-1 rounded-full"
                                                    style={{ background: ORANGE, boxShadow: `0 0 4px ${ORANGE}` }}
                                                />
                                            )}
                                            {hasAhi && (
                                                <span
                                                    className="w-1 h-1 rounded-full"
                                                    style={{ background: 'var(--neon-green)', boxShadow: '0 0 4px var(--neon-green)' }}
                                                />
                                            )}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    <div className="mt-3 pt-3 border-t border-white/5 text-[11px] text-slate-400 flex items-center justify-between">
                        <span>
                            {data.totalCount} haber
                            <span className="text-slate-500"> (Ç: {data.counts.cmyo}, A: {data.counts.ahievran})</span>
                        </span>
                        <span className="text-slate-500">Günlük güncellenir</span>
                    </div>
                </>
            )}

            {selectedDay && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                    onClick={() => setSelectedDay(null)}
                >
                    <div
                        className="w-full max-w-md rounded-2xl bg-[#071019] border border-white/10 shadow-2xl"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                            <div className="text-sm font-semibold text-white">
                                {parseInt(selectedDay.slice(-2), 10)} {data?.month}
                            </div>
                            <button
                                onClick={() => setSelectedDay(null)}
                                className="text-slate-400 hover:text-white px-2 py-1 text-sm"
                            >Kapat</button>
                        </div>
                        <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
                            {selectedCmyo.length > 0 && (
                                <div>
                                    <div className="flex items-center gap-2 mb-2">
                                        <span
                                            className="inline-block w-2 h-2 rounded-full"
                                            style={{ background: ORANGE, boxShadow: `0 0 6px ${ORANGE}` }}
                                        />
                                        <span className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: ORANGE }}>
                                            {SOURCE_LABEL.cmyo}
                                        </span>
                                    </div>
                                    <ul className="space-y-2">
                                        {selectedCmyo.map(item => (
                                            <li key={item.id} className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                                                <a
                                                    href={item.url}
                                                    target="_blank"
                                                    rel="noreferrer noopener"
                                                    className="text-sm text-white hover:text-[color:var(--neon-blue)] inline-flex items-start gap-1.5 leading-snug"
                                                >
                                                    <span>{item.title}</span>
                                                    <ExternalLink className="w-3 h-3 mt-0.5 shrink-0 opacity-60" />
                                                </a>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            {selectedAhi.length > 0 && (
                                <div>
                                    <div className="flex items-center gap-2 mb-2">
                                        <span
                                            className="inline-block w-2 h-2 rounded-full"
                                            style={{ background: 'var(--neon-green)', boxShadow: '0 0 6px var(--neon-green)' }}
                                        />
                                        <span className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: 'var(--neon-green)' }}>
                                            {SOURCE_LABEL.ahievran}
                                        </span>
                                    </div>
                                    <ul className="space-y-2">
                                        {selectedAhi.map(item => (
                                            <li key={item.id} className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                                                <a
                                                    href={item.url}
                                                    target="_blank"
                                                    rel="noreferrer noopener"
                                                    className="text-sm text-white hover:text-[color:var(--neon-blue)] inline-flex items-start gap-1.5 leading-snug"
                                                >
                                                    <span>{item.title}</span>
                                                    <ExternalLink className="w-3 h-3 mt-0.5 shrink-0 opacity-60" />
                                                </a>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
