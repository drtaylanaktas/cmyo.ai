import crypto from 'crypto';

/**
 * Tek-yönlü token hash'i (SHA-256, hex). Doğrulama ve şifre-sıfırlama
 * token'ları DB'de HAM saklanmaz; hash'i saklanır. E-postaya ham token (link)
 * gider, DB'ye hash yazılır; okurken gelen ham token hash'lenip karşılaştırılır.
 * Böylece DB ihlali halinde token'lar kullanılamaz.
 *
 * Not: Bu dosya yalnızca Node runtime route'larından import edilmelidir
 * (edge/middleware'e sokmayın — node 'crypto' edge'de çalışmaz).
 */
export function hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
}
