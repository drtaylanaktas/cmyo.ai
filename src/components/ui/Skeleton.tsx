import React from 'react';

/**
 * Premium iskelet (skeleton) yükleme bloğu.
 * `.skeleton` sınıfı globals.css'te tanımlı parıltı animasyonunu kullanır.
 */
export function Skeleton({
    className = '',
    style,
}: {
    className?: string;
    style?: React.CSSProperties;
}) {
    return <div className={`skeleton ${className}`} style={style} aria-hidden="true" />;
}

/** Sohbet geçmişi listesi için hazır iskelet satırları. */
export function HistorySkeleton({ rows = 5 }: { rows?: number }) {
    return (
        <div className="space-y-2" aria-busy="true" aria-label="Geçmiş yükleniyor">
            {Array.from({ length: rows }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
            ))}
        </div>
    );
}

export default Skeleton;
