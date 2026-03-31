/**
 * Structured logger — JSON formatında Vercel Log'larına yazar.
 * Vercel'de her console.log otomatik olarak loglanır;
 * JSON format ile Vercel Log Drains / monitoring araçlarında filtrelenebilir.
 *
 * Kullanım:
 *   import { logger } from '@/lib/logger';
 *   logger.info('chat_request', { userEmail, messageLength });
 *   logger.warn('rate_limit_hit', { ip, endpoint });
 *   logger.error('db_error', { error: err.message });
 *   logger.audit('ADMIN_CHAT_READ', { admin, conversationId });
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'audit';

interface LogEntry {
    level: LogLevel;
    event: string;
    ts: string;
    env: string;
    [key: string]: unknown;
}

function log(level: LogLevel, event: string, meta: Record<string, unknown> = {}): void {
    const entry: LogEntry = {
        level,
        event,
        ts: new Date().toISOString(),
        env: process.env.NODE_ENV ?? 'unknown',
        ...meta,
    };

    const line = JSON.stringify(entry);

    if (level === 'error') {
        console.error(line);
    } else if (level === 'warn') {
        console.warn(line);
    } else {
        console.log(line);
    }
}

export const logger = {
    debug: (event: string, meta?: Record<string, unknown>) => {
        if (process.env.NODE_ENV !== 'production') log('debug', event, meta);
    },
    info: (event: string, meta?: Record<string, unknown>) => log('info', event, meta),
    warn: (event: string, meta?: Record<string, unknown>) => log('warn', event, meta),
    error: (event: string, meta?: Record<string, unknown>) => log('error', event, meta),
    audit: (event: string, meta?: Record<string, unknown>) => log('audit', event, meta),
};
