/**
 * FR-585 Kanıt Formu otomatik doldurma endpoint'i.
 *
 * Bu endpoint TEK bir form (FR-585) için tasarlanmıştır. Filename parametresi
 * almaz — whitelist'in kendisi endpoint'in varlığıdır. Chat flow'undan tetiklenir.
 *
 * Akış:
 *   1. Kullanıcı mesajı + (attachmentText | attachmentImage) alınır
 *   2. GPT-4o multimodal structured output çağrısı → FR-585 şemasına uyan JSON
 *      (doğrulanabilir alanlar muhafazakâr; anlatı alanları akademik/profesyonel zengin)
 *   3. renderFr585(data) → doldurulmuş DOCX buffer (base64) + sohbet önizlemesi (markdown)
 *   4. JSON dön: { data, missing, previewMarkdown, docxBase64, filename }
 */

import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { renderFr585, buildFr585PreviewMarkdown, type Fr585Data } from '@/lib/fr585-template';

export const runtime = 'nodejs'; // docxtemplater + pizzip Node gerektiriyor

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// OpenAI Structured Outputs için JSON schema (strict mode)
const FR585_JSON_SCHEMA = {
    name: 'fr585_kanit_form',
    strict: true,
    schema: {
        type: 'object',
        additionalProperties: false,
        required: [
            'sorumluBirim',
            'kanitAdi',
            'kanitTuru',
            'gerceklesmeDurumu',
            'gerceklesmeTarihi',
            'kanitIcerigi',
            'sonuclarVeDegerlendirme',
            'gerekce',
        ],
        properties: {
            sorumluBirim: { type: ['string', 'null'] },
            kanitAdi: { type: ['string', 'null'] },
            kanitTuru: {
                type: 'object',
                additionalProperties: false,
                required: [
                    'faaliyet',
                    'surec',
                    'risk',
                    'iyilestirmeDIF',
                    'mys',
                    'diger',
                    'digerAciklama',
                ],
                properties: {
                    faaliyet: { type: 'boolean' },
                    surec: { type: 'boolean' },
                    risk: { type: 'boolean' },
                    iyilestirmeDIF: { type: 'boolean' },
                    mys: { type: 'boolean' },
                    diger: { type: 'boolean' },
                    digerAciklama: { type: ['string', 'null'] },
                },
            },
            gerceklesmeDurumu: {
                type: 'object',
                additionalProperties: false,
                required: ['tamamlandi', 'ertelendi', 'iptal'],
                properties: {
                    tamamlandi: { type: 'boolean' },
                    ertelendi: { type: 'boolean' },
                    iptal: { type: 'boolean' },
                },
            },
            gerceklesmeTarihi: {
                type: ['string', 'null'],
                description: 'ISO tarih: YYYY-MM-DD. Kanıtta yoksa null — UYDURMA.',
            },
            kanitIcerigi: {
                type: ['string', 'null'],
                description:
                    'Kanıtın ne olduğunu, amacını, kapsamını ve içeriğini açıklayan DOLU, ' +
                    'yapılandırılmış, resmî-akademik Türkçe metin (3-6 cümle). Kanıta dayalı zenginleştir; ' +
                    'sahte rakam/isim/tarih ekleme.',
            },
            sonuclarVeDegerlendirme: {
                type: ['string', 'null'],
                description:
                    'Faaliyetin/sürecin sonuçları, kurumsal katkısı ve kalite yönetimi açısından ' +
                    'değerlendirmesi — dolu, profesyonel akademik üslup (2-5 cümle). Niteliksel; sahte veri yok.',
            },
            gerekce: {
                type: ['string', 'null'],
                description:
                    'Yalnız ertelendi/iptal ise doldur: ertelenme veya iptal gerekçesi (kurumsal üslup). ' +
                    'Tamamlandıysa null.',
            },
        },
    },
} as const;

const SYSTEM_PROMPT =
    "Sen Kırşehir Ahi Evran Üniversitesi Çiçekdağı MYO'nun kalite yönetim sisteminde " +
    "FR-585 Kanıt Formu'nu dolduran uzman bir kalite koordinasyon asistanısın. " +
    'Kullanıcının mesajı ve eklediği kanıt (metin ve/veya görsel) üzerinden JSON şemasına göre cevap ver.\n\n' +
    'İKİ TÜR ALAN VARDIR, FARKLI DAVRAN:\n' +
    '1) DOĞRULANABİLİR ALANLAR (sorumluBirim, kanitAdi, gerceklesmeTarihi, kanitTuru kutuları, ' +
    'gerceklesmeDurumu): Yalnızca kanıtta AÇIKÇA desteklenen değeri yaz. Tarih/isim/birim/sayı ' +
    'kanıtta yoksa null (veya checkbox için false) bırak — ASLA UYDURMA. Checkbox için yalnız ' +
    'kanıtta açıkça desteklenen kutuyu true yap.\n' +
    '2) ANLATI ALANLARI (kanitIcerigi, sonuclarVeDegerlendirme, gerekce): Burada PROFESYONEL ve ' +
    "AKADEMİK biçimde ZENGİNLEŞTİR. Kullanıcının kısa/yetersiz açıklamasını, kanıta dayanarak " +
    'bağlam, amaç, kapsam, yöntem, kurumsal katkı ve sonuç bakımından EKSİKSİZ, akıcı, resmî ' +
    'kurumsal Türkçe ile DOLU bir kalite kanıt metnine genişlet (çok cümleli paragraflar). ' +
    'Boş/tek cümlelik bırakma. Niteliksel zenginleştirme serbesttir; ANCAK somut sahte veri ' +
    '(uydurma rakam, oran, kişi/birim adı, tarih, mevzuat numarası) EKLEME.\n\n' +
    'Üslup örneği (kanitIcerigi): "Söz konusu kanıt, ... faaliyetine ilişkin olup; faaliyetin ' +
    'planlanması, yürütülmesi ve raporlanması süreçlerini belgelemektedir. Kapsamında ... yer ' +
    'almakta ve kurumun kalite hedefleriyle uyumlu biçimde ... amaçlanmıştır."\n\n' +
    'Tarihleri ISO (YYYY-MM-DD) yaz. Dil: Türkçe.';

interface FillRequestBody {
    userMessage?: string;
    attachmentText?: string;
    attachmentImage?: {
        name: string;
        dataUrl: string;
    };
}

export async function POST(req: Request) {
    try {
        const body = (await req.json()) as FillRequestBody;
        const userMessage = (body.userMessage || '').trim();
        const attachmentText = body.attachmentText?.trim();
        const attachmentImage = body.attachmentImage;

        // --- Girdi validasyonu ---
        if (!userMessage) {
            return NextResponse.json(
                { error: 'userMessage gerekli' },
                { status: 400 }
            );
        }

        // En az bir kanıt kaynağı (belge metni, görsel veya yeterince detaylı açıklama)
        if (!attachmentText && !attachmentImage && userMessage.length < 20) {
            return NextResponse.json(
                {
                    error:
                        'Doldurma için en az bir kanıt (belge, görsel veya detaylı açıklama) gerekli.',
                },
                { status: 400 }
            );
        }

        // Görsel format ve boyut kontrolü
        if (attachmentImage) {
            const dataUrlMatch = attachmentImage.dataUrl.match(
                /^data:(image\/(jpeg|png|webp));base64,/
            );
            if (!dataUrlMatch) {
                return NextResponse.json(
                    { error: 'Geçersiz görsel formatı (sadece JPG/PNG/WEBP).' },
                    { status: 400 }
                );
            }
            const approxBytes = attachmentImage.dataUrl.length * 0.75;
            if (approxBytes > 5 * 1024 * 1024) {
                return NextResponse.json(
                    { error: 'Görsel boyutu çok büyük (maks ~4MB).' },
                    { status: 413 }
                );
            }
        }

        if (!process.env.OPENAI_API_KEY) {
            return NextResponse.json(
                { error: 'OpenAI yapılandırması eksik.' },
                { status: 500 }
            );
        }

        // --- GPT-4o multimodal + structured output çağrısı ---
        const userContent: any[] = [
            { type: 'text', text: `Kullanıcı mesajı:\n${userMessage}` },
        ];
        if (attachmentText) {
            userContent.push({
                type: 'text',
                text: `Kanıt belgesi metni (dosyadan çıkarıldı):\n${attachmentText.slice(0, 12000)}`,
            });
        }
        if (attachmentImage) {
            userContent.push({
                type: 'image_url',
                image_url: { url: attachmentImage.dataUrl, detail: 'high' },
            });
        }

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o',
            temperature: 0.5, // anlatı alanları için zengin/akıcı dil (doğrulanabilir alanlar prompt ile sıkı tutulur)
            max_tokens: 3000, // dolu akademik paragraflar için bütçe
            response_format: {
                type: 'json_schema',
                json_schema: FR585_JSON_SCHEMA,
            },
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: userContent as any },
            ],
        });

        const raw = completion.choices[0]?.message?.content;
        if (!raw) {
            throw new Error('LLM boş cevap döndü');
        }

        let extracted: Fr585Data;
        try {
            extracted = JSON.parse(raw);
        } catch (err) {
            console.error('[fill-kanit-formu] JSON parse error', err, raw);
            return NextResponse.json(
                { error: 'AI cevabı işlenemedi. Lütfen tekrar deneyin.' },
                { status: 502 }
            );
        }

        // --- Eksik DOĞRULANABİLİR alanları topla (kullanıcıya uyarı notu için) ---
        // Anlatı alanları (kanitIcerigi/sonuclar) artık zenginleştirilerek dolacağı için
        // uyarı listesine girmez; yalnız uydurulamayacak somut veriler kontrol edilir.
        const missing: string[] = [];
        if (!extracted.sorumluBirim) missing.push('Sorumlu Birim/Kişi');
        if (!extracted.kanitAdi) missing.push('Kanıtın Adı');
        if (!extracted.gerceklesmeTarihi) missing.push('Gerçekleşme Tarihi');

        const anyTuru = Object.entries(extracted.kanitTuru)
            .filter(([k]) => k !== 'digerAciklama')
            .some(([, v]) => v === true);
        const anyDurum = Object.values(extracted.gerceklesmeDurumu).some(
            (v) => v === true
        );
        if (!anyTuru) missing.push('Kanıtın Türü (checkbox)');
        if (!anyDurum) missing.push('Gerçekleşme Durumu (checkbox)');

        // --- DOCX render (base64) + sohbet önizlemesi (markdown) ---
        const buf = await renderFr585(extracted);
        const docxBase64 = Buffer.from(buf).toString('base64');
        const previewMarkdown = buildFr585PreviewMarkdown(extracted);
        const filename = 'FR-585 Kanit Formu (dolu).docx';

        return NextResponse.json({
            data: extracted,
            missing,
            previewMarkdown,
            docxBase64,
            filename,
        });
    } catch (err: any) {
        console.error('[fill-kanit-formu] error:', err);
        return NextResponse.json(
            { error: 'Form doldurulurken hata oluştu. Lütfen tekrar deneyin.' },
            { status: 502 }
        );
    }
}
