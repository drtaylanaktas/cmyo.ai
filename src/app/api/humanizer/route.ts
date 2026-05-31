import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { checkRateLimit, getClientIP } from '@/lib/rate-limiter';
import { detectAI, humanizeText } from '@/lib/humanizer-engine';

export async function POST(req: Request) {
    try {
        // 1. IP Rate Limiting (10 requests per minute per IP)
        const ip = getClientIP(req);
        const rateCheck = await checkRateLimit(`humanizer:${ip}`, { maxRequests: 10, windowSeconds: 60 });
        if (!rateCheck.allowed) {
            return NextResponse.json(
                { error: 'Çok fazla istek gönderildi. Lütfen bir dakika bekleyin.' },
                { status: 429 }
            );
        }

        // 2. Parse Body
        const { action, text, voiceSample, email } = await req.json();

        // 3. Validation
        if (!action || !['detect', 'humanize'].includes(action)) {
            return NextResponse.json({ error: 'Geçersiz işlem seçimi.' }, { status: 400 });
        }
        if (!text || typeof text !== 'string' || text.trim().length === 0) {
            return NextResponse.json({ error: 'Analiz edilecek metin boş olamaz.' }, { status: 400 });
        }
        if (text.length > 8000) {
            return NextResponse.json({ error: 'Metin en fazla 8000 karakter uzunluğunda olabilir.' }, { status: 400 });
        }

        // 4. Quota Checks (IP-based fallback + Email-based role check)
        let isUnlimited = false;
        let limitHumanize = 15;
        let limitDetect = 30;
        let userEmail = email || '';

        if (userEmail) {
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

                        // Reset quota if a new day has started
                        if (todayStr !== lastDateStr) {
                            dailyHumanize = 0;
                            dailyDetect = 0;
                        }

                        if (action === 'detect') {
                            if (dailyDetect >= limitDetect) {
                                return NextResponse.json(
                                    { error: `Günlük AI tespit analizi limitinize (${limitDetect}) ulaştınız. Limitiniz yarın sıfırlanacaktır.` },
                                    { status: 429 }
                                );
                            }
                            // Increment detect count
                            await sql`
                                UPDATE users 
                                SET daily_detect_count = ${dailyDetect + 1}, 
                                    last_humanizer_date = NOW() 
                                WHERE email = ${userEmail}
                            `;
                        } else {
                            if (dailyHumanize >= limitHumanize) {
                                return NextResponse.json(
                                    { error: `Günlük insansılaştırma (Humanize) limitinize (${limitHumanize}) ulaştınız. Limitiniz yarın sıfırlanacaktır.` },
                                    { status: 429 }
                                );
                            }
                            // Increment humanize count
                            await sql`
                                UPDATE users 
                                SET daily_humanize_count = ${dailyHumanize + 1}, 
                                    last_humanizer_date = NOW() 
                                WHERE email = ${userEmail}
                            `;
                        }
                    }
                }
            } catch (quotaErr) {
                console.error('[Humanizer Route] Quota check failed, falling back to soft limits:', quotaErr);
            }
        }

        // 5. Execute Action
        if (action === 'detect') {
            const result = await detectAI(text);
            return NextResponse.json(result);
        } else {
            const result = await humanizeText(text, voiceSample);
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
