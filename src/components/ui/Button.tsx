import React from 'react';

type Variant = 'primary' | 'danger' | 'ghost' | 'subtle';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
    primary:
        'text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 shadow-lg shadow-blue-500/25',
    danger:
        'text-white bg-red-600 hover:bg-red-500 shadow-lg shadow-red-500/20',
    ghost:
        'text-slate-300 hover:text-white hover:bg-white/5 border border-slate-700/60',
    subtle:
        'text-slate-400 hover:text-white hover:bg-slate-800/60',
};

const SIZES: Record<Size, string> = {
    sm: 'py-1.5 px-3 text-xs gap-1.5',
    md: 'py-2.5 px-4 text-sm gap-2',
    lg: 'py-3 px-5 text-base gap-2',
};

/**
 * Tutarlı premium buton primitive'i — varyant/boyut/yükleme durumu destekler.
 * Mevcut sayfalardaki tekrar eden inline buton sınıflarının yerini almak için.
 */
export function Button({
    variant = 'primary',
    size = 'md',
    loading = false,
    fullWidth = false,
    leftIcon,
    className = '',
    children,
    disabled,
    ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: Variant;
    size?: Size;
    loading?: boolean;
    fullWidth?: boolean;
    leftIcon?: React.ReactNode;
}) {
    return (
        <button
            {...props}
            disabled={disabled || loading}
            className={`inline-flex items-center justify-center rounded-xl font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
        >
            {loading ? (
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
                leftIcon
            )}
            {children}
        </button>
    );
}

export default Button;
