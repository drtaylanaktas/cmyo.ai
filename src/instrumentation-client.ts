// Sentry — tarayıcı (client) başlatma.
import * as Sentry from '@sentry/nextjs';

Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 1.0,
    sendDefaultPii: false,
});

// İstemci tarafı sayfa geçiş izlemesi.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
