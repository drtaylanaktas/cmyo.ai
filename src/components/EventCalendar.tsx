'use client';

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ExternalLink, Calendar as CalendarIcon } from 'lucide-react';

export type EventItem = {
    id: number;
    title: string;
    description: string | null;
    event_date: string | null;
    event_date_text: string | null;
    external_url: string;
};

type Props = {
    monthLabel: string;
    year: number;
    monthIndex: number;
    dated: EventItem[];
    undated: EventItem[];
};

const WEEKDAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

function dayKey(dateStr: string | null): string | null {
    if (!dateStr) return null;
    return dateStr.slice(0, 10);
}

function formatDayLabel(y: number, m: number, d: number): string {
    return `${d} ${new Date(y, m, d).toLocaleString('tr-TR', { month: 'long' })} ${y}`;
}

export default function EventCalendar({ monthLabel, year, monthIndex, dated, undated }: Props) {
    const [selectedDay, setSelectedDay] = useState<string | null>(null);

    const eventsByDay = useMemo(() => {
        const map = new Map<string, EventItem[]>();
        for (const e of dated) {
            const k = dayKey(e.event_date);
            if (!k) continue;
            const arr = map.get(k) || [];
            arr.push(e);
            map.set(k, arr);
        }
        return map;
    }, [dated]);

    const grid = useMemo(() => {
        const firstOfMonth = new Date(year, monthIndex, 1);
        const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
        const jsDay = firstOfMonth.getDay();
        const leadingBlanks = (jsDay === 0 ? 6 : jsDay - 1);

        const cells: Array<{ date: Date | null; iso: string | null; inMonth: boolean }> = [];
        for (let i = 0; i < leadingBlanks; i++) cells.push({ date: null, iso: null, inMonth: false });
        for (let d = 1; d <= daysInMonth; d++) {
            const dt = new Date(year, monthIndex, d);
            const iso = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            cells.push({ date: dt, iso, inMonth: true });
        }
        while (cells.length < 42) cells.push({ date: null, iso: null, inMonth: false });
        return cells;
    }, [year, monthIndex]);

    const todayIso = (() => {
        const t = new Date();
        return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
    })();

    const selectedEvents = selectedDay ? (eventsByDay.get(selectedDay) || []) : [];

    return (
        <div className="w-full max-w-5xl mx-auto">
            <div className="flex items-center gap-3 mb-6">
                <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center border"
                    style={{ background: 'rgba(0,128,255,0.12)', borderColor: 'rgba(0,128,255,0.35)' }}
                >
                    <CalendarIcon className="w-5 h-5" style={{ color: 'var(--neon-blue)' }} />
                </div>
                <div>
                    <h1 className="text-xl md:text-2xl font-bold text-white capitalize">{monthLabel}</h1>
                    <p className="text-xs text-slate-400">Kırşehir Ahi Evran Üniversitesi — Yaklaşan Etkinlikler</p>
                </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#050a14]/60 backdrop-blur-sm p-3 md:p-5">
                <div className="grid grid-cols-7 gap-1 md:gap-2 mb-2">
                    {WEEKDAYS.map(w => (
                        <div key={w} className="text-center text-[11px] md:text-xs font-medium text-slate-400 py-1">{w}</div>
                    ))}
                </div>

                <div className="grid grid-cols-7 gap-1 md:gap-2">
                    {grid.map((cell, idx) => {
                        if (!cell.inMonth) {
                            return <div key={idx} className="aspect-square rounded-lg bg-transparent" />;
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
                                className={`aspect-square rounded-lg border text-xs md:text-sm flex flex-col items-center justify-center gap-1 transition-all relative
                                    ${hasEvent ? 'cursor-pointer hover:scale-[1.03]' : 'cursor-default opacity-80'}
                                    ${isToday ? 'ring-1' : ''}
                                `}
                                style={{
                                    background: hasEvent ? 'rgba(0,128,255,0.10)' : 'rgba(255,255,255,0.02)',
                                    borderColor: hasEvent ? 'rgba(0,128,255,0.35)' : 'rgba(255,255,255,0.06)',
                                    boxShadow: isToday ? '0 0 0 1px var(--neon-green) inset, 0 0 10px rgba(57,255,20,0.25)' : undefined,
                                }}
                            >
                                <span className={`font-semibold ${isToday ? 'text-white' : 'text-slate-200'}`}>{cell.date!.getDate()}</span>
                                {hasEvent && (
                                    <span
                                        className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex items-center gap-0.5"
                                        aria-label={`${events.length} etkinlik`}
                                    >
                                        {Array.from({ length: Math.min(events.length, 3) }).map((_, i) => (
                                            <span
                                                key={i}
                                                className="w-1.5 h-1.5 rounded-full"
                                                style={{ background: 'var(--neon-gold)', boxShadow: '0 0 6px var(--neon-gold)' }}
                                            />
                                        ))}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {undated.length > 0 && (
                <div className="mt-6 rounded-2xl border border-white/10 bg-[#050a14]/60 backdrop-blur-sm p-4 md:p-5">
                    <h2 className="text-sm font-semibold text-slate-200 mb-3">Tarihi Belirsiz Etkinlikler</h2>
                    <ul className="space-y-2">
                        {undated.map(e => (
                            <li key={e.id} className="flex items-start justify-between gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/5">
                                <div className="min-w-0">
                                    <div className="text-sm text-white truncate">{e.title}</div>
                                    {e.event_date_text && (
                                        <div className="text-xs text-slate-400 mt-0.5">{e.event_date_text}</div>
                                    )}
                                </div>
                                <a
                                    href={e.external_url}
                                    target="_blank"
                                    rel="noreferrer noopener"
                                    className="shrink-0 inline-flex items-center gap-1 text-xs text-slate-300 hover:text-white px-2 py-1 rounded border border-white/10 hover:border-white/30 transition-colors"
                                >
                                    Detay <ExternalLink className="w-3 h-3" />
                                </a>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <p className="mt-4 text-xs text-slate-500 text-center">
                Sadece içinde bulunulan ayın etkinlikleri gösterilir. Kaynak: ahievran.edu.tr
            </p>

            <AnimatePresence>
                {selectedDay && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                        onClick={() => setSelectedDay(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, y: 10 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.95, y: 10 }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full max-w-lg rounded-2xl bg-[#071019] border border-white/10 shadow-2xl"
                        >
                            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
                                <div>
                                    <div className="text-xs text-slate-400">Etkinlikler</div>
                                    <div className="text-base font-semibold text-white">
                                        {formatDayLabel(year, monthIndex, parseInt(selectedDay.slice(-2), 10))}
                                    </div>
                                </div>
                                <button
                                    onClick={() => setSelectedDay(null)}
                                    className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/5"
                                    aria-label="Kapat"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <ul className="p-5 space-y-3 max-h-[60vh] overflow-y-auto">
                                {selectedEvents.map(e => (
                                    <li key={e.id} className="rounded-xl bg-white/[0.02] border border-white/10 p-4">
                                        <div className="text-sm font-semibold text-white">{e.title}</div>
                                        {e.description && (
                                            <p className="mt-1.5 text-xs text-slate-300 line-clamp-4">{e.description}</p>
                                        )}
                                        <a
                                            href={e.external_url}
                                            target="_blank"
                                            rel="noreferrer noopener"
                                            className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/30 text-slate-200 hover:text-white transition-colors"
                                        >
                                            Detayları gör <ExternalLink className="w-3 h-3" />
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
