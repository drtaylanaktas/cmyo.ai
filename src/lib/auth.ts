import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { sql } from '@vercel/postgres';

if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET ortam değişkeni tanımlanmamış. Lütfen .env.local dosyasını kontrol edin.');
}
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

const COOKIE_NAME = 'cmyo_session';
const TOKEN_EXPIRY = '2h'; // 24h'den 2h'ye düşürüldü — güvenlik iyileştirmesi

export interface JWTPayload {
    email: string;
    name: string;
    surname: string;
    role: string;
    title?: string;
    academicUnit?: string;
}

export async function createToken(payload: JWTPayload): Promise<string> {
    return new SignJWT({ ...payload })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(TOKEN_EXPIRY)
        .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<(JWTPayload & { iat?: number }) | null> {
    try {
        const { payload } = await jwtVerify(token, JWT_SECRET);
        return payload as unknown as JWTPayload & { iat?: number };
    } catch {
        return null;
    }
}

/**
 * Cookie'den oturum bilgisini alır.
 * Token geçerliyse last_logout_at kontrolü yaparak revoked oturumları reddeder.
 */
export async function getSession(): Promise<JWTPayload | null> {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return null;

    const payload = await verifyToken(token);
    if (!payload) return null;

    // Revocation check: token, son logout'tan önce yayınlanmışsa reddet
    try {
        const result = await sql`
            SELECT last_logout_at FROM users WHERE email = ${payload.email}
        `;
        if (result.rows.length > 0) {
            const lastLogout: Date | null = result.rows[0].last_logout_at;
            if (lastLogout && payload.iat) {
                const logoutTimestamp = Math.floor(new Date(lastLogout).getTime() / 1000);
                if (payload.iat < logoutTimestamp) {
                    return null; // Token, logout'tan önce yayınlanmış — geçersiz
                }
            }
        }
    } catch {
        // DB hatası olursa token'ı geçerli say (availability > security burada makul)
    }

    return payload;
}

/**
 * Kullanıcının tüm aktif oturumlarını geçersiz kılar (logout anını kaydeder).
 */
export async function invalidateUserSessions(email: string): Promise<void> {
    try {
        await sql`
            UPDATE users SET last_logout_at = NOW() WHERE email = ${email}
        `;
    } catch (err) {
        console.error('Session invalidation error:', err);
    }
}

export function createSessionCookie(token: string): string {
    const maxAge = 2 * 60 * 60; // 2 saat
    return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

export function clearSessionCookie(): string {
    return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}
