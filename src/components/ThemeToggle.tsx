'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from './ThemeProvider';

/**
 * Açık/koyu tema değiştirici. Token tabanlı stiller (bg-surface-raised, text-ink…)
 * sayesinde her iki temada da doğru görünür.
 */
export function ThemeToggle({ className = '' }: { className?: string }) {
    const { theme, toggleTheme } = useTheme();
    const isLight = theme === 'light';
    return (
        <button
            type="button"
            onClick={toggleTheme}
            aria-label={isLight ? 'Koyu temaya geç' : 'Açık temaya geç'}
            title={isLight ? 'Koyu tema' : 'Açık tema'}
            className={`inline-flex items-center justify-center rounded-lg p-2 text-ink-soft border border-line hover:text-ink hover:bg-surface-raised transition-colors ${className}`}
        >
            {isLight ? <Moon size={18} /> : <Sun size={18} />}
        </button>
    );
}
