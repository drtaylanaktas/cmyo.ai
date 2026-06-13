// Sentry — sunucu (Node.js runtime) başlatma.
import * as Sentry from '@sentry/nextjs';

Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    // DSN yoksa tamamen devre dışı (lokal geliştirmede DSN ekli değilse sessiz).
    enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV,
    // Performans izleme örnekleme oranı — düşük trafik için 1.0; gerekirse düşür.
    tracesSampleRate: 1.0,
    // PII (kişisel veri) gönderme — KVKK gereği kapalı.
    sendDefaultPii: false,
});
