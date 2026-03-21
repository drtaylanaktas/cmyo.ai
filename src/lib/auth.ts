import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const JWT_SECRET = new TextEncoder().encode(
    process.env.JWT_SECRET || 'cmyo-ai-default-secret-change-in-production-2024'
);

const COOKIE_NAME = 'cmyo_session';
const TOKEN_EXPIRY = '24h';

export interface JWTPayload {
    email: string;
    name: string;
    surname: string;
    role: string;
    title?: string;
    academicUnit?: string;
}

/**
 * JWT token oluşturur
 */
export async function createToken(payload: JWTPayload): Promise<string> {
    return new SignJWT({ ...payload })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(TOKEN_EXPIRY)
        .sign(JWT_SECRET);
}

/**
 * JWT token doğrular ve payload döner
 */
export async function verifyToken(token: string): Promise<JWTPayload | null> {
    try {
        const { payload } = await jwtVerify(token, JWT_SECRET);
        return payload as unknown as JWTPayload;
    } catch {
        return null;
    }
}

/**
 * Cookie'den oturum bilgisini alır
 */
export async function getSession(): Promise<JWTPayload | null> {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return null;
    return verifyToken(token);
}

/**
 * Oturum cookie'sini set etmek için header objesi döner
 */
export function createSessionCookie(token: string): string {
    const maxAge = 24 * 60 * 60; // 24 saat
    return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

/**
 * Oturum cookie'sini silmek için header objesi döner
 */
export function clearSessionCookie(): string {
    return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}
