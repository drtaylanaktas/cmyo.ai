/**
 * Distributed rate limiter — Upstash Redis kullanır.
 * UPSTASH_REDIS_REST_URL ve UPSTASH_REDIS_REST_TOKEN env değişkenleri
 * tanımlanmamışsa in-memory fallback'e geçer (lokal geliştirme için).
 *
 * Kurulum: npm install @upstash/ratelimit @upstash/redis
 * Vercel'e eklenecek env:
 *   UPSTASH_REDIS_REST_URL
 *   UPSTASH_REDIS_REST_TOKEN
 */

interface RateLimitConfig {
    maxRequests: number;
    windowSeconds: number;
}

interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetIn: number;
}

// ── In-memory fallback (tek instance, lokal geliştirme) ────────────────────
interface MemEntry {
    count: number;
    resetAt: number;
}
const memStore = new Map<string, MemEntry>();

setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of memStore.entries()) {
        if (now > entry.resetAt) memStore.delete(key);
    }
}, 5 * 60 * 1000);

function checkMemRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
    const now = Date.now();
    const windowMs = config.windowSeconds * 1000;
    const entry = memStore.get(key);

    if (!entry || now > entry.resetAt) {
        memStore.set(key, { count: 1, resetAt: now + windowMs });
        return { allowed: true, remaining: config.maxRequests - 1, resetIn: config.windowSeconds };
    }

    entry.count++;
    if (entry.count > config.maxRequests) {
        return { allowed: false, remaining: 0, resetIn: Math.ceil((entry.resetAt - now) / 1000) };
    }
    return { allowed: true, remaining: config.maxRequests - entry.count, resetIn: Math.ceil((entry.resetAt - now) / 1000) };
}

// ── Upstash Redis sliding window rate limit ────────────────────────────────
async function checkUpstashRateLimit(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
    const url = process.env.UPSTASH_REDIS_REST_URL!;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN!;
    const now = Date.now();
    const windowMs = config.windowSeconds * 1000;
    const redisKey = `rl:${key}`;

    try {
        // Use Redis sorted set sliding window:
        // ZREMRANGEBYSCORE removes old entries, ZADD adds current, ZCARD counts
        const pipeline = [
            ['zremrangebyscore', redisKey, '-inf', now - windowMs],
            ['zadd', redisKey, now.toString(), `${now}-${Math.random()}`],
            ['zcard', redisKey],
            ['pexpire', redisKey, windowMs.toString()],
        ];

        const res = await fetch(`${url}/pipeline`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(pipeline),
        });

        if (!res.ok) throw new Error(`Upstash HTTP ${res.status}`);

        const data = await res.json();
        const count: number = data[2]?.result ?? 1;
        const allowed = count <= config.maxRequests;
        const remaining = Math.max(0, config.maxRequests - count);

        return { allowed, remaining, resetIn: allowed ? config.windowSeconds : config.windowSeconds };
    } catch (err) {
        console.error('Upstash rate limit error, falling back to memory:', err);
        return checkMemRateLimit(key, config);
    }
}

// ── Public API ─────────────────────────────────────────────────────────────
export async function checkRateLimit(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
        return checkUpstashRateLimit(key, config);
    }
    return checkMemRateLimit(key, config);
}

export function getClientIP(request: Request): string {
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0].trim();
    const realIP = request.headers.get('x-real-ip');
    if (realIP) return realIP;
    return 'unknown';
}

export const RATE_LIMITS = {
    login: { maxRequests: 5, windowSeconds: 15 * 60 } as RateLimitConfig,
    register: { maxRequests: 3, windowSeconds: 60 * 60 } as RateLimitConfig,
    forgotPassword: { maxRequests: 3, windowSeconds: 60 * 60 } as RateLimitConfig,
    chat: { maxRequests: 30, windowSeconds: 60 } as RateLimitConfig,
    telegramCode: { maxRequests: 3, windowSeconds: 10 * 60 } as RateLimitConfig,
};
