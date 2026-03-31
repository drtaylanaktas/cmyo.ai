import { describe, it, expect } from 'vitest';
import { createToken, verifyToken } from '@/lib/auth';

describe('JWT auth', () => {
    const payload = {
        email: 'test@ogr.ahievran.edu.tr',
        name: 'Test',
        surname: 'User',
        role: 'student',
    };

    it('creates a valid token', async () => {
        const token = await createToken(payload);
        expect(typeof token).toBe('string');
        expect(token.split('.').length).toBe(3); // header.payload.signature
    });

    it('verifies a valid token and returns payload', async () => {
        const token = await createToken(payload);
        const result = await verifyToken(token);
        expect(result).not.toBeNull();
        expect(result?.email).toBe(payload.email);
        expect(result?.role).toBe(payload.role);
    });

    it('returns null for an invalid token', async () => {
        const result = await verifyToken('invalid.token.here');
        expect(result).toBeNull();
    });

    it('returns null for a tampered token', async () => {
        const token = await createToken(payload);
        const tampered = token.slice(0, -5) + 'XXXXX';
        const result = await verifyToken(tampered);
        expect(result).toBeNull();
    });

    it('token payload contains iat field', async () => {
        const token = await createToken(payload);
        const result = await verifyToken(token);
        expect(result?.iat).toBeTypeOf('number');
    });
});
