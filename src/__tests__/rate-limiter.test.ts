import { describe, it, expect } from 'vitest';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/rate-limiter';

describe('checkRateLimit (in-memory fallback)', () => {
    it('allows requests within limit', async () => {
        const key = `test:${Date.now()}:allow`;
        const result = await checkRateLimit(key, { maxRequests: 5, windowSeconds: 60 });
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(4);
    });

    it('blocks requests over limit', async () => {
        const key = `test:${Date.now()}:block`;
        const config = { maxRequests: 2, windowSeconds: 60 };
        await checkRateLimit(key, config);
        await checkRateLimit(key, config);
        const result = await checkRateLimit(key, config);
        expect(result.allowed).toBe(false);
        expect(result.remaining).toBe(0);
    });

    it('resets after window expires', async () => {
        const key = `test:${Date.now()}:reset`;
        const config = { maxRequests: 1, windowSeconds: 0 }; // 0s window — hemen sıfırlanır
        await checkRateLimit(key, config); // 1. istek
        await new Promise(r => setTimeout(r, 10));
        const result = await checkRateLimit(key, config); // Pencere sıfırlandı
        expect(result.allowed).toBe(true);
    });
});

describe('getClientIP', () => {
    it('extracts IP from x-forwarded-for', () => {
        const req = new Request('http://localhost', {
            headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
        });
        expect(getClientIP(req)).toBe('1.2.3.4');
    });

    it('falls back to x-real-ip', () => {
        const req = new Request('http://localhost', {
            headers: { 'x-real-ip': '9.9.9.9' },
        });
        expect(getClientIP(req)).toBe('9.9.9.9');
    });

    it('returns "unknown" when no IP headers', () => {
        const req = new Request('http://localhost');
        expect(getClientIP(req)).toBe('unknown');
    });
});

describe('RATE_LIMITS config', () => {
    it('has expected limits defined', () => {
        expect(RATE_LIMITS.login.maxRequests).toBe(5);
        expect(RATE_LIMITS.chat.maxRequests).toBe(30);
        expect(RATE_LIMITS.telegramCode.maxRequests).toBe(3);
    });
});
