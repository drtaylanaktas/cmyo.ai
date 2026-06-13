import { describe, it, expect } from 'vitest';
import { hashToken } from '@/lib/tokens';

describe('hashToken', () => {
    it('64 karakterlik hex (SHA-256) üretir', () => {
        const h = hashToken('abc123');
        expect(h).toMatch(/^[0-9a-f]{64}$/);
    });

    it('deterministiktir (aynı girdi → aynı hash)', () => {
        expect(hashToken('aynı-token')).toBe(hashToken('aynı-token'));
    });

    it('farklı girdiler farklı hash verir', () => {
        expect(hashToken('token-a')).not.toBe(hashToken('token-b'));
    });

    it('ham token\'ı geri vermez (tek yönlü)', () => {
        const raw = 'gizli-token-degeri';
        expect(hashToken(raw)).not.toContain(raw);
    });
});
