'use client';

import React, { createContext, useCallback, useContext, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
    id: number;
    type: ToastType;
    message: string;
}

interface ToastContextValue {
    toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const ICONS: Record<ToastType, React.ReactNode> = {
    success: <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />,
    error: <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />,
    info: <Info className="w-4 h-4 text-blue-400 shrink-0" />,
};

const BORDER: Record<ToastType, string> = {
    success: 'border-green-500/30',
    error: 'border-red-500/30',
    info: 'border-blue-500/30',
};

/**
 * Uygulama geneli bildirim (toast) sistemi. layout.tsx içinde children'ı sarar.
 * Kullanım: const { toast } = useToast(); toast('Kaydedildi!', 'success');
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [items, setItems] = useState<ToastItem[]>([]);

    const toast = useCallback((message: string, type: ToastType = 'info') => {
        const id = Date.now() + Math.random();
        setItems((prev) => [...prev, { id, type, message }]);
        setTimeout(() => {
            setItems((prev) => prev.filter((t) => t.id !== id));
        }, 4000);
    }, []);

    const dismiss = (id: number) => setItems((prev) => prev.filter((t) => t.id !== id));

    return (
        <ToastContext.Provider value={{ toast }}>
            {children}
            <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
                <AnimatePresence>
                    {items.map((t) => (
                        <motion.div
                            key={t.id}
                            initial={{ opacity: 0, y: 16, scale: 0.96 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 8, scale: 0.96 }}
                            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                            role="status"
                            className={`pointer-events-auto flex items-center gap-2.5 max-w-sm px-4 py-3 rounded-xl border ${BORDER[t.type]} bg-[var(--surface-raised)] backdrop-blur-xl shadow-2xl`}
                        >
                            {ICONS[t.type]}
                            <span className="text-sm text-slate-200 flex-1">{t.message}</span>
                            <button
                                onClick={() => dismiss(t.id)}
                                aria-label="Bildirimi kapat"
                                className="text-slate-500 hover:text-white transition-colors"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
        </ToastContext.Provider>
    );
}

export function useToast(): ToastContextValue {
    const ctx = useContext(ToastContext);
    if (!ctx) {
        // Provider yoksa sessizce no-op döndür — sayfa yine de çalışsın.
        return { toast: () => {} };
    }
    return ctx;
}

export default ToastProvider;
