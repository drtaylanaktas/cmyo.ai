// Next.js instrumentation — sunucu/edge başlangıcında Sentry'yi yükler.
import * as Sentry from '@sentry/nextjs';

export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        await import('./sentry.server.config');
    }
    if (process.env.NEXT_RUNTIME === 'edge') {
        await import('./sentry.edge.config');
    }
}

// Sunucu tarafı (RSC/route) hatalarını Sentry'ye iletir.
export const onRequestError = Sentry.captureRequestError;
