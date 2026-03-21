/**
 * In-memory rate limiter for Vercel serverless functions.
 * Note: In serverless, memory is per-instance and not shared.
 * This provides basic protection; for production-grade distributed
 * rate limiting, consider Vercel KV or Upstash Redis.
 */

interface RateLimitEntry {
    count: number;
    resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Cleanup old entries periodically (every 5 minutes)
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
        if (now > entry.resetAt) {
            store.delete(key);
        }
    }
}, 5 * 60 * 1000);

interface RateLimitConfig {
    /** Maximum number of requests allowed */
    maxRequests: number;
    /** Time window in seconds */
    windowSeconds: number;
}

interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetIn: number; // seconds until reset
}

/**
 * Check rate limit for a given key (e.g., IP, email, userId)
 */
export function checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
    const now = Date.now();
    const windowMs = config.windowSeconds * 1000;
    const storeKey = `${key}`;

    const entry = store.get(storeKey);

    if (!entry || now > entry.resetAt) {
        // First request or window expired
        store.set(storeKey, {
            count: 1,
            resetAt: now + windowMs,
        });
        return {
            allowed: true,
            remaining: config.maxRequests - 1,
            resetIn: config.windowSeconds,
        };
    }

    // Within window
    entry.count++;

    if (entry.count > config.maxRequests) {
        return {
            allowed: false,
            remaining: 0,
            resetIn: Math.ceil((entry.resetAt - now) / 1000),
        };
    }

    return {
        allowed: true,
        remaining: config.maxRequests - entry.count,
        resetIn: Math.ceil((entry.resetAt - now) / 1000),
    };
}

/**
 * Extract client IP from request headers (Vercel compatible)
 */
export function getClientIP(request: Request): string {
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) {
        return forwarded.split(',')[0].trim();
    }
    const realIP = request.headers.get('x-real-ip');
    if (realIP) return realIP;
    return 'unknown';
}

// Pre-defined rate limit configurations
export const RATE_LIMITS = {
    login: { maxRequests: 5, windowSeconds: 15 * 60 } as RateLimitConfig,        // 5 per 15 min
    register: { maxRequests: 3, windowSeconds: 60 * 60 } as RateLimitConfig,     // 3 per hour
    forgotPassword: { maxRequests: 3, windowSeconds: 60 * 60 } as RateLimitConfig, // 3 per hour
    chat: { maxRequests: 30, windowSeconds: 60 } as RateLimitConfig,              // 30 per minute
};
