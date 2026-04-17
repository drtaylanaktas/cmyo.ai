'use client';

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ExternalLink, Calendar as CalendarIcon } from 'lucide-react';

export type NewsSource = 'cmyo' | 'ahievran';

export type NewsItem = {
    id: number;
    source: NewsSource;
    title: string;
    url: string;
    dateText: string | null;
};

type Props = {
    monthLabel: string;
    year: number;
    monthIndex: number;
    itemsByDay: Record<string, NewsItem[]>;
    counts: { cmyo: number; ahievran: number };
    totalCount: number;
};

const WEEKDAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

const ORANGE = '#ff7b1a';

const SOURCE_LABEL: Record<NewsSource, string> = {
    cmyo: 'Çiçekdağı MYO',
    ahievran: 'Ahi Evran Üniversitesi',
};

function formatDayLabel(y: number, m: number, d: number): string {
    return `${d} ${new Date(y, m, d).toLocaleString('tr-TR', { month: 'long' })} ${y}`;
}

export default function EventCalendar({ monthLabel, year, monthIndex, itemsByDay, counts, totalCount }: Props) {
    const [selectedDay, setSelectedDay] = useState<string | null>(null);

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

    const selectedItems = selectedDay ? (itemsByDay[selectedDay] || []) : [];
    const selectedCmyo = selectedItems.filter(i => i.source === 'cmyo');
    const selectedAhi = selectedItems.filter(i => i.source === 'ahievran');

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
                    <p className="text-xs text-slate-400">Çiçekdağı MYO + Ahi Evran Üniversitesi — Haber Takvimi</p>
                </div>
            </div>

            <div className="flex items-center gap-4 mb-4 text-xs">
                <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ background: ORANGE, boxShadow: `0 0 6px ${ORANGE}` }} />
                    <span className="text-slate-300">Çiçekdağı MYO ({counts.cmyo})</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ background: 'var(--neon-green)', boxShadow: '0 0 6px var(--neon-green)' }} />
                    <span className="text-slate-300">Ahi Evran ({counts.ahievran})</span>
                </span>
                <span className="text-slate-500 ml-auto">Toplam {totalCount} haber</span>
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
                        const items = itemsByDay[iso] || [];
                        const isToday = iso === todayIso;
                        const hasItem = items.length > 0;
                        const sources = Array.from(new Set(items.map(i => i.source))) as NewsSource[];
                        const hasCmyo = sources.includes('cmyo');
                        const hasAhi = sources.includes('ahievran');

                        return (
                            <button
                                key={idx}
                                type="button"
                                onClick={() => hasItem && setSelectedDay(iso)}
                                disabled={!hasItem}
                                className={`aspect-square rounded-lg border text-xs md:text-sm flex flex-col items-center justify-center gap-1 transition-all relative
                                    ${hasItem ? 'cursor-pointer hover:scale-[1.03]' : 'cursor-default opacity-80'}
                                    ${isToday ? 'ring-1' : ''}
                                `}
                                style={{
                                    background: hasItem
                                        ? 'linear-gradient(135deg, rgba(255,123,26,0.12), rgba(0,255,136,0.10))'
                                        : 'rgba(255,255,255,0.02)',
                                    borderColor: hasItem ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.06)',
                                    boxShadow: isToday ? '0 0 0 1px var(--neon-green) inset, 0 0 10px rgba(57,255,20,0.25)' : undefined,
                                }}
                            >
                                <span className={`font-semibold ${isToday ? 'text-white' : 'text-slate-200'}`}>{cell.date!.getDate()}</span>
                                {hasItem && (
                                    <span
                                        className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex items-center gap-1"
                                        aria-label={`${items.length} haber`}
                                    >
                                        {hasCmyo && (
                                            <span
                                                className="w-1.5 h-1.5 rounded-full"
                                                style={{ background: ORANGE, boxShadow: `0 0 6px ${ORANGE}` }}
                                            />
                                        )}
                                        {hasAhi && (
                                            <span
                                                className="w-1.5 h-1.5 rounded-full"
                                                style={{ background: 'var(--neon-green)', boxShadow: '0 0 6px var(--neon-green)' }}
                                            />
                                        )}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            <p className="mt-4 text-xs text-slate-500 text-center">
                Sadece içinde bulunulan ayın haberleri gösterilir. Kaynaklar: cicekdagimyo.ahievran.edu.tr, ahievran.edu.tr
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
                                    <div className="text-xs text-slate-400">Haberler</div>
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
                            <div className="p-5 space-y-5 max-h-[60vh] overflow-y-auto">
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
                                                <li key={item.id} className="rounded-xl bg-white/[0.02] border border-white/10 p-4">
                                                    <a
                                                        href={item.url}
                                                        target="_blank"
                                                        rel="noreferrer noopener"
                                                        className="text-sm font-semibold text-white hover:text-[color:var(--neon-blue)] inline-flex items-start gap-1.5 leading-snug"
                                                    >
                                                        <span>{item.title}</span>
                                                        <ExternalLink className="w-3.5 h-3.5 mt-0.5 shrink-0 opacity-60" />
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
                                                <li key={item.id} className="rounded-xl bg-white/[0.02] border border-white/10 p-4">
                                                    <a
                                                        href={item.url}
                                                        target="_blank"
                                                        rel="noreferrer noopener"
                                                        className="text-sm font-semibold text-white hover:text-[color:var(--neon-blue)] inline-flex items-start gap-1.5 leading-snug"
                                                    >
                                                        <span>{item.title}</span>
                                                        <ExternalLink className="w-3.5 h-3.5 mt-0.5 shrink-0 opacity-60" />
                                                    </a>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
