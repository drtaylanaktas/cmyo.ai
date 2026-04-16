'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Calendar, ChevronRight, ExternalLink } from 'lucide-react';

type EventRow = {
    id: number;
    title: string;
    event_date: string | null;
    event_date_text: string | null;
    external_url: string;
};

type EventsResponse = {
    month: string;
    year: number;
    monthIndex: number;
    dated: EventRow[];
    undated: EventRow[];
};

const WEEKDAYS = ['P', 'S', 'Ç', 'P', 'C', 'C', 'P'];

function isoDay(v: string | null): string | null {
    if (!v) return null;
    return v.slice(0, 10);
}

export default function MiniCalendar() {
    const [data, setData] = useState<EventsResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [selectedDay, setSelectedDay] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        fetch('/api/events/upcoming')
            .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
            .then((d: EventsResponse) => { if (!cancelled) setData(d); })
            .catch(e => { if (!cancelled) setError(String(e)); });
        return () => { cancelled = true; };
    }, []);

    const eventsByDay = useMemo(() => {
        const map = new Map<string, EventRow[]>();
        if (!data) return map;
        for (const e of data.dated) {
            const k = isoDay(e.event_date);
            if (!k) continue;
            const arr = map.get(k) || [];
            arr.push(e);
            map.set(k, arr);
        }
        return map;
    }, [data]);

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

    const selectedEvents = selectedDay ? (eventsByDay.get(selectedDay) || []) : [];

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
                        <div className="text-[11px] uppercase tracking-wider text-slate-500">Ahi Evran</div>
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
                <div className="text-xs text-red-300 py-6 text-center">Etkinlikler yüklenemedi.</div>
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
                            const events = eventsByDay.get(iso) || [];
                            const isToday = iso === todayIso;
                            const hasEvent = events.length > 0;

                            return (
                                <button
                                    key={idx}
                                    type="button"
                                    onClick={() => hasEvent && setSelectedDay(iso)}
                                    disabled={!hasEvent}
                                    className={`aspect-square rounded-md text-[11px] font-medium flex items-center justify-center transition-all relative
                                        ${hasEvent ? 'cursor-pointer hover:scale-110' : 'cursor-default'}
                                    `}
                                    style={{
                                        background: hasEvent
                                            ? 'linear-gradient(135deg, rgba(255,215,0,0.22), rgba(0,128,255,0.18))'
                                            : 'rgba(255,255,255,0.02)',
                                        color: hasEvent ? '#ffe98a' : (isToday ? '#ffffff' : '#94a3b8'),
                                        boxShadow: isToday ? '0 0 0 1px var(--neon-green) inset' : undefined,
                                    }}
                                    title={hasEvent ? `${events.length} etkinlik` : undefined}
                                >
                                    {cell.day}
                                    {hasEvent && (
                                        <span
                                            className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                                            style={{ background: 'var(--neon-gold)', boxShadow: '0 0 4px var(--neon-gold)' }}
                                        />
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    <div className="mt-3 pt-3 border-t border-white/5 text-[11px] text-slate-400 flex items-center justify-between">
                        <span>
                            {data.dated.length} etkinlik
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
                        <ul className="p-4 space-y-2 max-h-[50vh] overflow-y-auto">
                            {selectedEvents.map(e => (
                                <li key={e.id} className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                                    <div className="text-sm text-white">{e.title}</div>
                                    <a
                                        href={e.external_url}
                                        target="_blank"
                                        rel="noreferrer noopener"
                                        className="mt-2 inline-flex items-center gap-1 text-xs text-slate-300 hover:text-white"
                                    >
                                        Detay <ExternalLink className="w-3 h-3" />
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}
        </div>
    );
}
