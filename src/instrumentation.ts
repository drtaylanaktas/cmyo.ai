// Next.js instrumentation — Sentry yalnızca PRODUCTION'da yüklenir.
// Lokal dev'de @sentry/nextjs hiç import edilmez → derleme hızlı kalır.

export async function register() {
    if (process.env.NODE_ENV !== 'production') return;
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        await import('./sentry.server.config');
    }
    if (process.env.NEXT_RUNTIME === 'edge') {
        await import('./sentry.edge.config');
    }
}

// Sunucu tarafı (RSC/route) hatalarını Sentry'ye iletir (yalnızca production).
export async function onRequestError(...args: unknown[]) {
    if (process.env.NODE_ENV !== 'production') return;
    const Sentry = await import('@sentry/nextjs');
    return (Sentry.captureRequestError as (...a: unknown[]) => unknown)(...args);
}
