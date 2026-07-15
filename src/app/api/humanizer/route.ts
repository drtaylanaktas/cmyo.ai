import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { checkRateLimit } from '@/lib/rate-limiter';
import { detectAI, humanizeText } from '@/lib/humanizer-engine';
import { getSession } from '@/lib/auth';

/**
 * Gizlilik notu: Bu uç, girilen metni VEYA üslup örneğini KESİNLİKLE saklamaz
 * (privacy/KVKK taahhüdü). Üslup örneği yalnız istemcide (localStorage) tutulur
 * ve her istekte `voiceSample` olarak geçici işlenip işlem biter bitmez düşer.
 */
export async function POST(req: Request) {
    try {
        // 1. Kimlik doğrulama — e-posta GÖVDEDEN alınmaz, oturumdan gelir.
        //    Aksi hâlde kullanıcı başkasının/admin'in e-postasını göndererek
        //    kotayı/yetkiyi atlatabilirdi (IDOR/privilege bypass önlemi).
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Yetkisiz erişim. Lütfen giriş yapın.' }, { status: 401 });
        }
        const userEmail = session.email;

        // 2. Kullanıcı bazlı hız sınırı (dakikada 10 istek)
        const rateCheck = await checkRateLimit(`humanizer:${userEmail}`, { maxRequests: 10, windowSeconds: 60 });
        if (!rateCheck.allowed) {
            return NextResponse.json(
                { error: 'Çok fazla istek gönderildi. Lütfen bir dakika bekleyin.' },
                { status: 429 }
            );
        }

        // 3. Gövde
        const { action, text, voiceSample, targetLanguage } = await req.json();

        if (!action || !['detect', 'humanize'].includes(action)) {
            return NextResponse.json({ error: 'Geçersiz işlem seçimi.' }, { status: 400 });
        }
        if (!text || typeof text !== 'string' || text.trim().length === 0) {
            return NextResponse.json({ error: 'Analiz edilecek metin boş olamaz.' }, { status: 400 });
        }
        const wordCount = text.trim().split(/\s+/).length;
        if (wordCount > 4000) {
            return NextResponse.json({ error: 'Metin en fazla 4000 kelime uzunluğunda olabilir.' }, { status: 400 });
        }

        // 4. Kota (rol bazlı, oturum kullanıcısına yazılır)
        let isUnlimited = false;
        let limitHumanize = 15;
        let limitDetect = 30;

        try {
            const userDb = await sql`
                SELECT role, daily_humanize_count, daily_detect_count, last_humanizer_date
                FROM users
                WHERE email = ${userEmail}
            `;

            if (userDb.rows.length > 0) {
                const user = userDb.rows[0];
                const role = user.role;

                if (role === 'admin') {
                    isUnlimited = true;
                } else if (role === 'academic') {
                    limitHumanize = 50;
                    limitDetect = 100;
                }

                if (!isUnlimited) {
                    let dailyHumanize = user.daily_humanize_count ?? 0;
                    let dailyDetect = user.daily_detect_count ?? 0;
                    const lastDate = user.last_humanizer_date;

                    const todayStr = new Date().toDateString();
                    const lastDateStr = lastDate ? new Date(lastDate).toDateString() : '';

                    // Yeni gün başladıysa kotayı sıfırla
                    if (todayStr !== lastDateStr) {
                        dailyHumanize = 0;
                        dailyDetect = 0;
                    }

                    if (action === 'detect') {
                        if (dailyDetect >= limitDetect) {
                            return NextResponse.json(
                                { error: `Günlük yazım analizi limitinize (${limitDetect}) ulaştınız. Limitiniz yarın sıfırlanacaktır.` },
                                { status: 429 }
                            );
                        }
                        await sql`
                            UPDATE users
                            SET daily_detect_count = ${dailyDetect + 1}, last_humanizer_date = NOW()
                            WHERE email = ${userEmail}
                        `;
                    } else {
                        if (dailyHumanize >= limitHumanize) {
                            return NextResponse.json(
                                { error: `Günlük iyileştirme (Humanize) limitinize (${limitHumanize}) ulaştınız. Limitiniz yarın sıfırlanacaktır.` },
                                { status: 429 }
                            );
                        }
                        await sql`
                            UPDATE users
                            SET daily_humanize_count = ${dailyHumanize + 1}, last_humanizer_date = NOW()
                            WHERE email = ${userEmail}
                        `;
                    }
                }
            }
        } catch (quotaErr) {
            console.error('[Humanizer Route] Quota check failed, falling back to soft limits:', quotaErr);
        }

        // 5. İşlem
        if (action === 'detect') {
            const result = await detectAI(text);
            return NextResponse.json(result);
        } else {
            const sample = (typeof voiceSample === 'string' && voiceSample.trim()) ? voiceSample : undefined;
            const result = await humanizeText(text, sample, targetLanguage);
            return NextResponse.json(result);
        }

    } catch (err: any) {
        console.error('[Humanizer Route] Request processing error:', err);
        return NextResponse.json(
            { error: err.message || 'İşlem gerçekleştirilirken bir hata oluştu.' },
            { status: 500 }
        );
    }
}
