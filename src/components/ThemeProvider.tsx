'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

type ThemeContextValue = {
    theme: Theme;
    toggleTheme: () => void;
    setTheme: (t: Theme) => void;
};

const STORAGE_KEY = 'cmyo-theme';
const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Tema sağlayıcı. `data-theme` attribute'unu <html>'e yazar; tercih localStorage'da
 * saklanır. İlk değer, FOUC'u önlemek için layout'taki anti-flash script tarafından
 * boyamadan önce ayarlanır — burada yalnız DOM'daki mevcut değeri okuruz.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, setThemeState] = useState<Theme>('dark');

    useEffect(() => {
        const current = (document.documentElement.dataset.theme as Theme) || 'dark';
        setThemeState(current);
    }, []);

    const applyTheme = useCallback((t: Theme) => {
        document.documentElement.dataset.theme = t;
        try {
            localStorage.setItem(STORAGE_KEY, t);
        } catch {
            /* localStorage erişilemezse sessiz geç */
        }
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', t === 'light' ? '#eef2f8' : '#050a14');
        setThemeState(t);
    }, []);

    const toggleTheme = useCallback(() => {
        const next: Theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
        applyTheme(next);
    }, [applyTheme]);

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme, setTheme: applyTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const ctx = useContext(ThemeContext);
    if (!ctx) throw new Error('useTheme, ThemeProvider içinde kullanılmalı');
    return ctx;
}
