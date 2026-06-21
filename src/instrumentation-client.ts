// Sentry — tarayıcı (client) başlatma. Yalnızca PRODUCTION'da yüklenir;
// lokal dev'de @sentry/nextjs client bundle'a girmez → dev derlemesi hafif kalır.
import * as Sentry from '@sentry/nextjs';

if (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_SENTRY_DSN) {
    Sentry.init({
        dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
        environment: process.env.NODE_ENV,
        tracesSampleRate: 1.0,
        sendDefaultPii: false,
    });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
