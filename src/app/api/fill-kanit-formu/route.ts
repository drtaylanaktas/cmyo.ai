/**
 * FR-585 Kanıt Formu otomatik doldurma endpoint'i.
 *
 * Bu endpoint TEK bir form (FR-585) için tasarlanmıştır. Filename parametresi
 * almaz — whitelist'in kendisi endpoint'in varlığıdır. Chat flow'undan tetiklenir.
 *
 * Akış:
 *   1. Kullanıcı mesajı + (attachmentText | attachmentImage) alınır
 *   2. GPT-4o multimodal structured output çağrısı → FR-585 şemasına uyan JSON
 *   3. renderFr585(data) → doldurulmuş DOCX buffer
 *   4. Eksik alanlar X-Fill-Warning header'ında kullanıcıya bildirilir
 */

import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { renderFr585, type Fr585Data } from '@/lib/fr585-template';

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
                description: 'ISO tarih: YYYY-MM-DD',
            },
            kanitIcerigi: { type: ['string', 'null'] },
            sonuclarVeDegerlendirme: { type: ['string', 'null'] },
            gerekce: { type: ['string', 'null'] },
        },
    },
} as const;

const SYSTEM_PROMPT =
    "Sen FR-585 Kanıt Formu'nun alanlarını dolduran bir yardımcısın. " +
    'Kullanıcının mesajı ve eklediği kanıt (metin ve/veya görsel) üzerinden JSON şemasına göre cevap ver. ' +
    'EMİN OLMADIĞIN alanları null bırak; asla uydurma. ' +
    'Tarihleri ISO formatında (YYYY-MM-DD) yaz. ' +
    'Checkbox alanları için yalnızca kanıtta AÇIKÇA desteklenen kutuyu true yap, diğerlerini false yap. ' +
    'Dil: Türkçe.';

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
            temperature: 0.2,
            max_tokens: 1500,
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

        // --- Eksik alanları topla (kullanıcıya uyarı notu için) ---
        const missing: string[] = [];
        if (!extracted.sorumluBirim) missing.push('Sorumlu Birim/Kişi');
        if (!extracted.kanitAdi) missing.push('Kanıtın Adı');
        if (!extracted.gerceklesmeTarihi) missing.push('Gerçekleşme Tarihi');
        if (!extracted.kanitIcerigi) missing.push('Kanıt İçeriği');
        if (!extracted.sonuclarVeDegerlendirme) missing.push('Sonuçlar ve Değerlendirme');

        const anyTuru = Object.entries(extracted.kanitTuru)
            .filter(([k]) => k !== 'digerAciklama')
            .some(([, v]) => v === true);
        const anyDurum = Object.values(extracted.gerceklesmeDurumu).some(
            (v) => v === true
        );
        if (!anyTuru) missing.push('Kanıtın Türü (checkbox)');
        if (!anyDurum) missing.push('Gerçekleşme Durumu (checkbox)');

        // --- DOCX render ---
        const buf = await renderFr585(extracted);

        const outFilename = 'FR-585 Kanit Formu (dolu).docx';
        const headers = new Headers({
            'Content-Type':
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(outFilename)}`,
        });
        if (missing.length > 0) {
            const warn = `Şu alanları otomatik tamamlayamadım, lütfen elle doldurun: ${missing.join(', ')}.`;
            headers.set('X-Fill-Warning', encodeURIComponent(warn));
        }

        return new NextResponse(buf as any, { status: 200, headers });
    } catch (err: any) {
        console.error('[fill-kanit-formu] error:', err);
        return NextResponse.json(
            { error: 'Form doldurulurken hata oluştu. Lütfen tekrar deneyin.' },
            { status: 502 }
        );
    }
}
