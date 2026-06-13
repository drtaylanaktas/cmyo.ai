import React from 'react';

/**
 * Premium boş durum (empty state) bileşeni — ikon + başlık + açıklama.
 * Liste/sonuç boş olduğunda sıradan "veri yok" metni yerine kullanılır.
 */
export function EmptyState({
    icon,
    title,
    description,
    action,
    className = '',
}: {
    icon?: React.ReactNode;
    title: string;
    description?: string;
    action?: React.ReactNode;
    className?: string;
}) {
    return (
        <div
            className={`flex flex-col items-center justify-center text-center gap-2 p-6 rounded-xl border border-dashed border-slate-800 ${className}`}
        >
            {icon && (
                <div className="text-slate-500 mb-1 opacity-80">{icon}</div>
            )}
            <p className="text-sm font-medium text-slate-300">{title}</p>
            {description && (
                <p className="text-xs text-slate-500 max-w-[24ch]">{description}</p>
            )}
            {action && <div className="mt-2">{action}</div>}
        </div>
    );
}

export default EmptyState;
