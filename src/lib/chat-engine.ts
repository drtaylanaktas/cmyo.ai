import OpenAI from 'openai';
import { sql } from '@vercel/postgres';

// Define Document interface
export interface Document {
    id?: number;
    filename: string;
    content: string;
    category?: string;
    priority?: number;
    score?: number;
    [key: string]: any;
}

// In-memory cache for fast RAG search without querying DB on every message
let globalKnowledgeCache: Document[] = [];
let lastCacheUpdate = 0;

/**
 * FR-585 Kanıt Formu otomatik doldurma intent tespiti.
 *
 * Bu fonksiyon, maliyet kontrolünün birinci katmanıdır. TRUE döndüğünde
 * buildSystemPrompt, model'e "fill_kanit_formu" action'ı üretme talimatını
 * enjekte eder. FALSE ise bu talimat asla prompt'a girmez, dolayısıyla model
 * başka sohbetlerde yanlışlıkla bu action'ı uyduramaz.
 *
 * Koşullar (üçü de şart):
 *   (a) Kullanıcı mesajında FR-585 veya "kanıt formu" referansı
 *   (b) "doldur / hazırla / oluştur" gibi bir doldurma fiili
 *   (c) Kullanıcı en az bir kanıt (belge metni VEYA görsel) eklemiş
 */
export function detectKanitFormuFillIntent(
    userMessage: string,
    hasAttachment: boolean
): boolean {
    if (!hasAttachment) return false;
    if (!userMessage) return false;
    const m = userMessage.toLocaleLowerCase('tr-TR');
    const refsFr585 = /\bfr[-\s]?585\b|kan[ıi]t ?form/.test(m);
    const wantsFill = /(doldur|haz[ıi]rla|olu[şs]tur)/.test(m);
    return refsFr585 && wantsFill;
}

export async function getKnowledgeBase(): Promise<Document[]> {
    try {
        const now = Date.now();
        if ((global as any).knowledgeCacheInvalidated || globalKnowledgeCache.length === 0 || (now - lastCacheUpdate > 15000)) {
            console.log('Fetching knowledge base from Vercel Postgres...');
            const { rows } = await sql`
                SELECT id, filename, content, category, priority, file_url
                FROM knowledge_documents
            `;
            globalKnowledgeCache = rows as Document[];
            lastCacheUpdate = now;
            (global as any).knowledgeCacheInvalidated = false;
        }
        return globalKnowledgeCache;
    } catch (error) {
        console.error('Error fetching knowledge base from DB:', error);
        return globalKnowledgeCache;
    }
}

export async function findRelevantDocuments(query: string): Promise<Document[]> {
    const knowledgeBase = await getKnowledgeBase();
    const queryLower = query.toLocaleLowerCase('tr-TR');

    // CRITICAL: Always inject Course Schedule Forms if 'ders programı' is mentioned
    // Dinamik DB araması — hardcoded liste yok, admin'den yüklenen tüm dosyalar otomatik bulunur
    if (queryLower.includes('ders programı') || queryLower.includes('haftalık ders')) {
        const queryTerms = queryLower.split(/\s+/).filter((t: string) => t.length > 2);
        const scheduleDocs = knowledgeBase
            .filter((d: Document) => {
                const fn = d.filename.toLocaleLowerCase('tr-TR');
                return fn.includes('fr-011') || fn.includes('haftalık ders') || fn.includes('ders programı');
            })
            .map((d: Document) => {
                // Sorgudaki bölüm adı dosya adıyla eşleşiyorsa daha yüksek skor ver
                const fn = d.filename.toLocaleLowerCase('tr-TR');
                const matchBonus = queryTerms.reduce((acc: number, t: string) => acc + (fn.includes(t) ? 10 : 0), 0);
                const realContent = d.content || '';
                return {
                    ...d,
                    content: realContent + `\n\n[SİSTEM: Bu belge indirilebilir. Kullanıcı dosyayı isterse generate_file action ile sun. Tam dosya adı: "${d.filename}"]`,
                    score: 100 + matchBonus
                };
            })
            .sort((a: Document, b: Document) => ((b.score as number) || 0) - ((a.score as number) || 0));

        if (scheduleDocs.length > 0) return scheduleDocs;
    }

    // CRITICAL: Always inject Internship Forms if 'staj' is mentioned
    // Dinamik DB araması — hardcoded liste yok
    if (queryLower.includes('staj')) {
        const queryTerms = queryLower.split(/\s+/).filter((t: string) => t.length > 2);
        const stajFormDocs = knowledgeBase
            .filter((d: Document) => {
                const fn = d.filename.toLocaleLowerCase('tr-TR');
                return fn.includes('staj başvuru') || fn.includes('staj kabul') || fn.includes('staj formu');
            })
            .map((d: Document) => {
                const fn = d.filename.toLocaleLowerCase('tr-TR');
                const matchBonus = queryTerms.reduce((acc: number, t: string) => acc + (fn.includes(t) ? 10 : 0), 0);
                const realContent = d.content || '';
                return {
                    ...d,
                    content: realContent + `\n\n[SİSTEM: Bu belge indirilebilir. Kullanıcı dosyayı isterse generate_file action ile sun. Tam dosya adı: "${d.filename}"]`,
                    score: 100 + matchBonus
                };
            })
            .sort((a: Document, b: Document) => ((b.score as number) || 0) - ((a.score as number) || 0));

        const injectedDocs = stajFormDocs;
        const terms = queryLower.split(' ').filter((t: string) => t.length > 2);
        const scores = knowledgeBase.map((doc: Document) => {
            let score = 0;
            const filename = doc.filename.toLocaleLowerCase('tr-TR');
            const content = doc.content ? doc.content.toLocaleLowerCase('tr-TR') : "";

            terms.forEach((term: string) => {
                if (filename.includes(term)) score += 20;
                if (content.includes(term)) score += 1;
                if (term === 'staj' && content.includes('staj')) score += 5;
                if (term === 'tarih' && content.includes('tarih')) score += 5;
            });

            return { doc, score };
        });

        const normalDocs = scores
            .filter((s: { score: number }) => s.score > 0)
            .sort((a: { score: number }, b: { score: number }) => b.score - a.score)
            .slice(0, 5)
            .map((s: { doc: Document }) => s.doc);

        return [...injectedDocs, ...normalDocs];
    }

    // BOLOGNA: Müfredat / ders içeriği sorularını tespit et
    const BOLOGNA_TRIGGERS = [
        'müfredat', 'ders listesi', 'ders planı', 'dersleri neler', 'yarıyıl',
        'dönem ders', 'zorunlu ders', 'seçmeli ders', 'akts', 'ects',
        'ders saati', 'program dersleri', 'bologna', 'kaç ders',
        '1. yarıyıl', '2. yarıyıl', '3. yarıyıl', '4. yarıyıl',
        '1. dönem', '2. dönem', '3. dönem', '4. dönem',
        'birinci dönem', 'ikinci dönem', 'güz yarıyıl', 'bahar yarıyıl',
        'ders programı nedir', 'hangi dersler', 'müfredatı ne',
    ];

    const isBolognaQuery = BOLOGNA_TRIGGERS.some(trigger => queryLower.includes(trigger));

    if (isBolognaQuery) {
        const bolognaDocs = knowledgeBase.filter((d: Document) => d.filename.startsWith('BOLOGNA_'));
        const terms = queryLower.split(/\s+/).filter((t: string) => t.length > 2);

        const scored = bolognaDocs.map((doc: Document) => {
            let score = 0;
            const filename = doc.filename.toLocaleLowerCase('tr-TR');
            const content = doc.content ? doc.content.toLocaleLowerCase('tr-TR') : '';

            terms.forEach((term: string) => {
                // Filename match is the strongest signal — indicates specific program
                if (filename.includes(term)) score += 30;
                // Content match is secondary
                if (content.includes(term)) score += 2;
            });

            return { doc, score };
        });

        const matched = scored
            .filter((s: { score: number }) => s.score > 0)
            .sort((a: { score: number }, b: { score: number }) => b.score - a.score)
            .slice(0, 4)
            .map((s: { doc: Document }) => s.doc);

        if (matched.length > 0) {
            return matched;
        }

        // Hiç spesifik eşleşme yok — Bologna belgelerini genel skorlamaya göre döndür
        const allScored = knowledgeBase.map((doc: Document) => {
            let score = 0;
            const filename = doc.filename.toLocaleLowerCase('tr-TR');
            const content = doc.content ? doc.content.toLocaleLowerCase('tr-TR') : '';

            if (filename.startsWith('bologna_')) score += 10;
            terms.forEach((term: string) => {
                if (filename.includes(term)) score += 20;
                if (content.includes(term)) score += 1;
            });

            return { doc, score };
        });

        return allScored
            .filter((s: { score: number }) => s.score > 0)
            .sort((a: { score: number }, b: { score: number }) => b.score - a.score)
            .slice(0, 4)
            .map((s: { doc: Document }) => s.doc);
    }

    // ============================================================
    // BLOKLAR 4-11: Kapsamlı RAG Yönlendirme (Web Kazıma Verisi Desteği)
    // ============================================================

    // Bölüm-anahtar kelime haritası: her bölüm için prefix ve tetikleyici kelimeler
    const BOLUM_MAP = [
        { keys: ['veteriner', 'laborant'], prefix: 'WEB_AKADEMIK_AKADEMIK-VETERINERLIK-' },
        { keys: ['bilgisayar', 'sağlık bilgi', 'yazılım', 'programlama'], prefix: 'WEB_AKADEMIK_AKADEMIK-BILGISAYAR-' },
        { keys: ['büro', 'sekreterlik', 'hukuk büro', 'büro yönetimi', 'yönetici asistanlığı'], prefix: 'WEB_AKADEMIK_AKADEMIK-BURO-' },
        { keys: ['çocuk', 'çocuk gelişimi', 'çocuk bakımı', 'çocuk koruma'], prefix: 'WEB_AKADEMIK_AKADEMIK-COCUK-' },
        { keys: ['bitkisel', 'hayvansal', 'tarım', 'süt', 'besi hayvancılığı'], prefix: 'WEB_AKADEMIK_AKADEMIK-BITKISEL-' },
    ];

    const STAFF_KEYWORDS = ['hoca', 'hocalar', 'öğretim', 'kadro', 'personel',
        'elemanlar', 'kimler', 'kim var', 'öğr. gör', 'doçent', 'profesör',
        'dersi veren', 'bölüm üyesi', 'akademisyen'];

    const matchedBolum = BOLUM_MAP.find(b => b.keys.some(k => queryLower.includes(k)));
    const hasStaffKeyword = STAFF_KEYWORDS.some(k => queryLower.includes(k));

    // BLOK 4: Bölüm-Spesifik Kadro Sorgusu
    // Tetikleyici: Hem bölüm adı hem de kadro/personel kelimesi var
    if (matchedBolum && hasStaffKeyword) {
        const bolumDocs = knowledgeBase
            .filter((d: Document) => d.filename.startsWith(matchedBolum.prefix) && d.filename.endsWith('BOLUMU.txt'))
            .map((d: Document) => ({ ...d, score: 95 }));
        const baskanlarDoc = knowledgeBase
            .filter((d: Document) => d.filename === 'WEB_BOLUM_HAKKIMIZDA-YONETIM-BOLUM-BASKANLARI.txt')
            .map((d: Document) => ({ ...d, score: 75 }));
        const result4 = [...bolumDocs, ...baskanlarDoc];
        if (result4.length > 0) return result4;
    }

    // BLOK 5: Bölüm Genel Bilgi Sorgusu
    // Tetikleyici: Bölüm adı var, kadro/personel kelimesi yok
    if (matchedBolum && !hasStaffKeyword) {
        const bolumDocs = knowledgeBase
            .filter((d: Document) => d.filename.startsWith(matchedBolum.prefix))
            .map((d: Document) => ({ ...d, score: 85 }));
        const cmyoBolumler = knowledgeBase
            .filter((d: Document) => d.filename === 'CMYO_Bolumler_ve_Programlar.txt')
            .map((d: Document) => ({ ...d, score: 70 }));
        const result5 = [...bolumDocs, ...cmyoBolumler];
        if (result5.length > 0) return result5;
    }

    // BLOK 6: Yönetim Sorgusu (müdür, yönetim)
    const YONETIM_TRIGGERS = ['müdür', 'okul müdürü', 'müdür yardımcısı', 'yönetim ekibi', 'okul yönetimi', 'yönetim kurulu', 'müdür kim', 'okul başkanı'];
    if (YONETIM_TRIGGERS.some(t => queryLower.includes(t))) {
        const mudurDoc = knowledgeBase
            .filter((d: Document) => d.filename === 'WEB_GENEL_HAKKIMIZDA-YONETIM-MUDUR.txt')
            .map((d: Document) => ({ ...d, score: 92 }));
        const mudurYardDoc = knowledgeBase
            .filter((d: Document) => d.filename === 'WEB_GENEL_HAKKIMIZDA-YONETIM-MUDUR-YARDIMCILARI.txt')
            .map((d: Document) => ({ ...d, score: 90 }));
        const kurulDoc = knowledgeBase
            .filter((d: Document) => d.filename === 'WEB_GENEL_HAKKIMIZDA-YONETIM-KURULLARIMIZ.txt')
            .map((d: Document) => ({ ...d, score: 80 }));
        const cmyoYonetim = knowledgeBase
            .filter((d: Document) => d.filename === 'CMYO_Yonetim_Kadrosu.txt')
            .map((d: Document) => ({ ...d, score: 70 }));
        const result6 = [...mudurDoc, ...mudurYardDoc, ...kurulDoc, ...cmyoYonetim];
        if (result6.length > 0) return result6;
    }

    // BLOK 7: İdari Personel Sorgusu (genişletilmiş tetikleyiciler)
    const IDARI_TRIGGERS = ['idari personel', 'idari çalışan', 'idari görevli', 'memur listesi', 'personel listesi',
        'idari kadro', 'sekreter listesi', 'yazı işleri', 'öğrenci işleri', 'mali işler', 'personel işleri', 'dahili', 'iç hat'];
    if (IDARI_TRIGGERS.some(t => queryLower.includes(t))) {
        const idariDoc = knowledgeBase
            .filter((d: Document) => d.filename === 'WEB_AKADEMIK_HAKKIMIZDA-TANITIM-IDARI-PERSONEL.txt')
            .map((d: Document) => ({ ...d, score: 95 }));
        if (idariDoc.length > 0) return idariDoc;
    }

    // BLOK 8: Genel Kadro/Personel Sorgusu (bölüm adı yok)
    if (hasStaffKeyword && !matchedBolum) {
        const baskanlarDoc = knowledgeBase
            .filter((d: Document) => d.filename === 'WEB_BOLUM_HAKKIMIZDA-YONETIM-BOLUM-BASKANLARI.txt')
            .map((d: Document) => ({ ...d, score: 92 }));
        const idariDoc = knowledgeBase
            .filter((d: Document) => d.filename === 'WEB_AKADEMIK_HAKKIMIZDA-TANITIM-IDARI-PERSONEL.txt')
            .map((d: Document) => ({ ...d, score: 85 }));
        const bolumKadroDocs = knowledgeBase
            .filter((d: Document) => d.filename.startsWith('WEB_AKADEMIK_AKADEMIK-') && d.filename.endsWith('BOLUMU.txt'))
            .map((d: Document) => ({ ...d, score: 75 }));
        const cmyoKadro = knowledgeBase
            .filter((d: Document) => d.filename === 'CMYO_Akademik_Kadro.txt')
            .map((d: Document) => ({ ...d, score: 65 }));
        const result8 = [...baskanlarDoc, ...idariDoc, ...bolumKadroDocs, ...cmyoKadro];
        if (result8.length > 0) return result8;
    }

    // BLOK 9: Duyuru + Haber Sorgusu
    const DUYURU_TRIGGERS = [
        'son duyuru', 'duyurular neler', 'öğrenci duyurusu', 'öğrenci duyuruları', 'ilan', 'haber',
        'son haber', 'güncel haber', 'bu hafta ne var', 'yeni haber', 'haberler', 'ne haber',
    ];
    if (DUYURU_TRIGGERS.some(t => queryLower.includes(t))) {
        const arsivOgrenci = knowledgeBase
            .filter((d: Document) => d.filename === 'WEB_DUYURU_ARSIV-OGRENCI-DUYURULARI.txt')
            .map((d: Document) => ({ ...d, score: 88 }));
        const arsivGenel = knowledgeBase
            .filter((d: Document) => d.filename === 'WEB_DUYURU_ARSIV-GENEL-DUYURULAR.txt')
            .map((d: Document) => ({ ...d, score: 85 }));
        const duyuruTerms = queryLower.split(/\s+/).filter((t: string) => t.length > 2);
        const topDuyurular = knowledgeBase
            .filter((d: Document) => d.category === 'web-duyuru' &&
                !['WEB_DUYURU_ARSIV-OGRENCI-DUYURULARI.txt', 'WEB_DUYURU_ARSIV-GENEL-DUYURULAR.txt'].includes(d.filename))
            .map((d: Document) => {
                const content = d.content ? d.content.toLocaleLowerCase('tr-TR') : '';
                const score = duyuruTerms.reduce((acc: number, t: string) => acc + (content.includes(t) ? 2 : 0), 80);
                return { ...d, score };
            })
            .sort((a: Document, b: Document) => ((b.score as number) || 0) - ((a.score as number) || 0))
            .slice(0, 5);
        // Günlük otomatik scraping ile eklenen güncel haberler (WEB_HABER_*.txt)
        // Kaynak ayrımı: Ahi Evran Üniversitesi (WEB_HABER_AHIEVRAN-*) vs Çiçekdağı MYO (WEB_HABER_ARSIV-*)
        const isCmyoKaynak = /\bçiçekdağı\b|\bcmyo\b|\bmyo\b|meslek yüksekokul/.test(queryLower);
        const isAhievranKaynak = /ahi\s?evran|ahievran|üniversite|rektörlük/.test(queryLower);
        const haberKaynak: 'cmyo' | 'ahievran' | 'ambiguous' =
            isCmyoKaynak && !isAhievranKaynak ? 'cmyo' :
            isAhievranKaynak && !isCmyoKaynak ? 'ahievran' :
            'ambiguous';

        const topHaberler = knowledgeBase
            .filter((d: Document) => {
                if (!d.filename.startsWith('WEB_HABER_')) return false;
                const isAhievranDoc = d.filename.includes('AHIEVRAN');
                if (haberKaynak === 'cmyo') return !isAhievranDoc;
                if (haberKaynak === 'ahievran') return isAhievranDoc;
                return true;
            })
            .map((d: Document) => {
                const content = d.content ? d.content.toLocaleLowerCase('tr-TR') : '';
                const score = duyuruTerms.reduce((acc: number, t: string) => acc + (content.includes(t) ? 3 : 0), 82);
                return { ...d, score, __haberKaynak: haberKaynak };
            })
            .sort((a: Document, b: Document) => ((b.score as number) || 0) - ((a.score as number) || 0))
            .slice(0, 5);
        const result9 = [...arsivOgrenci, ...arsivGenel, ...topDuyurular, ...topHaberler];
        if (result9.length > 0) return result9;
    }

    // BLOK 9b: Akademik Takvim Sorgusu
    const TAKVIM_TRIGGERS = ['akademik takvim', 'akademik takvimi', 'sınav tarihi', 'sınav takvimi',
        'ara sınav ne zaman', 'ara sınavlar ne zaman', 'final ne zaman', 'final sınavı ne zaman',
        'bütünleme ne zaman', 'ders kaydı ne zaman', 'kayıt tarihi', 'tatil ne zaman', 'resmi tatil',
        'dönem başlangıcı', 'ders dönemi ne zaman',
        'yarıyıl ne zaman', 'yarıyıl bitiyor', 'dönem ne zaman bitiyor', 'dönem ne zaman başlıyor',
        'bahar yarıyılı', 'güz yarıyılı', 'bahar dönemi ne zaman', 'güz dönemi ne zaman',
        'dönem bitiş', 'dönem sonu', 'ders sonu', 'sınav haftası'];
    if (TAKVIM_TRIGGERS.some(t => queryLower.includes(t))) {
        const takvimdocs = knowledgeBase
            // Türkçe "İ" (U+0130) için toLocaleLowerCase kullan — /takvim/i regex'i "TAKVİMİ"yi eşleştiremez
            .filter((d: Document) => d.filename.toLocaleLowerCase('tr-TR').includes('takvim'))
            // Score: file_url varlığı (50pt) + DB priority değeri → bağlaşma olmaz
            .map((d: Document) => ({ ...d, score: (d.file_url ? 50 : 0) + ((d.priority as number) || 0) }))
            .sort((a: Document, b: Document) => ((b.score as number) || 0) - ((a.score as number) || 0));
        if (takvimdocs.length > 0) return takvimdocs;
    }

    // BLOK 9c: Form kodu ile doğrudan arama (FR-585, GGYS-FR-001 vb.)
    // Tetikleyici: Sorguda "FR-NNN" veya "GGYS-FR-NNN" pattern'i var
    const formCodeMatch = query.match(/\b((?:ggys[-\s]?)?fr[-\s]?\d{3,4})\b/i);
    if (formCodeMatch) {
        const formCode = formCodeMatch[1].replace(/\s/g, '-').toUpperCase();
        const codeDocs = knowledgeBase
            .filter((d: Document) => d.filename.toUpperCase().includes(formCode))
            .map((d: Document) => ({ ...d, score: 96 }));
        if (codeDocs.length > 0) return codeDocs;
    }

    // BLOK 10: Kurumsal keyword inject (bölüm/kadro keyword'leri kaldırıldı — üstteki bloklar hallediyor)
    const institutionalKeywords: Record<string, string[]> = {
        'CMYO_Akademik_Kadro.txt': ['ahmet aslan', 'deniz aygören', 'filiz özlem', 'burak ata', 'emine doğan'],
        'CMYO_Yonetim_Kadrosu.txt': ['başkan', 'komisyon', 'kurul', 'güzelküçük'],
        'CMYO_Bolumler_ve_Programlar.txt': ['kontenjan', 'ön lisans', 'dgs', 'dikey geçiş'],
        'CMYO_Genel_Tanitim_ve_Tarihce.txt': ['tarih', 'tarihçe', 'kuruluş', 'myo hakkında', 'meslek yüksekokulu', 'tanıtım', 'genel bilgi', 'nerede', 'çiçekdağı myo'],
        'WEB_GENEL_HAKKIMIZDA-TANITIM-TARIHCE.txt': ['tarih', 'tarihçe', 'kuruluş', 'tanıtım'],
        'CMYO_Ogrenci_Hizmetleri.txt': ['ulaşım', 'yurt', 'barınma', 'kyk', 'ring', 'servis', 'aktaşlar', 'kütüphane', 'wifi', 'erasmus', 'psikolojik', 'destek'],
        'CMYO_Iletisim_Bilgileri.txt': ['iletişim', 'telefon', 'e-posta', 'eposta', 'mail', 'adres', 'faks', 'web site', 'obs', 'aydep'],
        'CMYO_Staj_Rehberi.txt': ['staj nasıl', 'staj süreci', 'staj başvuru', 'staj defteri', 'sicil fişi', 'staj yeri', 'sigorta', 'staj takvim'],
        'CMYO_Sikca_Sorulan_Sorular.txt': ['nasıl yapılır', 'ne zaman', 'nedir', 'var mı', 'zorunlu mu', 'kayıt', 'devam', 'muafiyet', 'not sistemi', 'yaz okulu'],
        'CMYO_Yemekhane_ve_AhiKart.txt': ['yemekhane', 'ahi kart', 'kampüs kart', 'bank24', 'temassız', 'bakiye', 'yükleme', 'halkbank'],
        'CMYO_Akademik_Takvim.txt': ['akademik takvim', 'dönem', 'sınav', 'güz', 'bahar', 'kayıt tarihi', 'bütünleme'],
    };

    const matchedFiles: string[] = [];
    for (const [filename, keywords] of Object.entries(institutionalKeywords)) {
        if (keywords.some(kw => queryLower.includes(kw))) {
            matchedFiles.push(filename);
        }
    }

    if (matchedFiles.length > 0) {
        const injectedDocs = knowledgeBase
            .filter(d => matchedFiles.includes(d.filename))
            .map(d => ({ ...d, score: 90 }));

        const terms = queryLower.split(' ').filter((t: string) => t.length > 2);
        const normalScores = knowledgeBase
            .filter(d => !matchedFiles.includes(d.filename))
            .map((doc: Document) => {
                let score = 0;
                const filename = doc.filename.toLocaleLowerCase('tr-TR');
                const content = doc.content.toLocaleLowerCase('tr-TR');
                const catBonus = (doc.category === 'web-akademik' || doc.category === 'web-bolum') ? 3 : 1;
                terms.forEach((term: string) => {
                    if (filename.includes(term)) score += 20;
                    if (content.includes(term)) score += catBonus;
                });
                return { doc, score };
            })
            .filter((s: { score: number }) => s.score > 0)
            .sort((a: { score: number }, b: { score: number }) => b.score - a.score)
            .slice(0, 3)
            .map((s: { doc: Document }) => s.doc);

        return [...injectedDocs, ...normalScores];
    }

    // BLOK 11: Genel Skorlama (fallback) — web-akademik/bolum kategorilerine +3 bonus
    if (!query || knowledgeBase.length === 0) return [];

    const terms = queryLower.split(' ').filter((t: string) => t.length > 2);
    const scores = knowledgeBase.map((doc: Document) => {
        let score = 0;
        const filename = doc.filename.toLocaleLowerCase('tr-TR');
        const content = doc.content.toLocaleLowerCase('tr-TR');
        const catBonus = (doc.category === 'web-akademik' || doc.category === 'web-bolum') ? 3 : 1;

        terms.forEach((term: string) => {
            const rootTerm = term.length > 6 ? term.substring(0, Math.min(term.length - 2, 7)) : term;

            if (filename.includes(term) || (rootTerm.length > 4 && filename.includes(rootTerm))) score += 20;
            if (content.includes(term) || (rootTerm.length > 4 && content.includes(rootTerm))) score += catBonus;

            if (term.includes('staj') && content.includes('staj')) score += 5;
            if (term.includes('tarih') && content.includes('tarih')) score += 5;
            if ((term.includes('müfredat') || term.includes('ders') || term.includes('program')) && content.includes('bologna')) score += 10;
        });

        return { doc, score };
    });

    return scores
        .filter((s: { score: number }) => s.score > 0)
        .sort((a: { score: number }, b: { score: number }) => b.score - a.score)
        .slice(0, 12)
        .map((s: { doc: Document }) => s.doc);
}

// Prompt injection saldırılarına karşı mesajı temizler
const INJECTION_PATTERNS = [
    /ignore\s+(all\s+)?(previous|prior|above)\s+instructions?/gi,
    /forget\s+(all\s+)?(previous|your)\s+instructions?/gi,
    /you\s+are\s+now\s+(a|an)\s+/gi,
    /act\s+as\s+(if\s+you\s+are|a|an)\s+/gi,
    /new\s+system\s+prompt/gi,
    /\[system\]/gi,
    /\<system\>/gi,
    /###\s*system/gi,
    /override\s+system/gi,
    /jailbreak/gi,
    /DAN\s+mode/gi,
];

export function sanitizeUserMessage(input: string): string {
    let sanitized = input;
    for (const pattern of INJECTION_PATTERNS) {
        sanitized = sanitized.replace(pattern, '[FİLTRELENDİ]');
    }
    return sanitized;
}

// Helper to write debug logs
export function logChatDebug(message: string) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${message}`);
}

// Generate with OpenAI GPT-4o Mini
export async function generateWithOpenAI(message: string, systemPrompt: string, history: any[] = []) {
    try {
        logChatDebug(`Sending request to GPT-4o Mini...`);

        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new Error('OpenAI API anahtarı bulunamadı. Lütfen OPENAI_API_KEY ortam değişkenini kontrol edin.');
        }

        const openai = new OpenAI({
            apiKey: apiKey,
        });

        const openaiHistory = history.map((msg: any) => {
            return {
                role: msg.role === 'model' ? 'assistant' : msg.role,
                content: msg.parts ? msg.parts[0].text : (msg.content || '')
            };
        });

        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            max_tokens: 2000,
            temperature: 0.5,
            messages: [
                { role: "system", content: systemPrompt },
                ...openaiHistory,
                { role: "user", content: message }
            ]
        });

        const text = response.choices[0].message.content;
        return text || "";

    } catch (error: any) {
        console.error(`OpenAI model failed:`, error);
        logChatDebug(`OpenAI model FAILED: ${error.message}`);
        throw error;
    }
}

// Build system prompt
export function buildSystemPrompt(
    user: any,
    role: string,
    context: string,
    weather: any,
    fillKanitFormuIntent: boolean = false
): string {
    return `
    Sen Çiçekdağı Meslek Yüksekokulu'nun (ÇMYO.AI) yapay zeka asistanısın. Çiçekdağı MYO'ya özel olarak hizmet veriyorsun.
    ŞU ANKİ TARİH VE SAAT: ${new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', dateStyle: 'full', timeStyle: 'short' })}
    BUGÜN GÜNLERDEN: ${new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', weekday: 'long' }).format(new Date())}
    Bu bilgiyi kullanarak sana sorulan "bugün günlerden ne", "saat kaç" gibi sorulara %100 doğru cevap ver. Asla başka bir tarih uydurma.

    ${weather ? `
    KULLANICI KONUM VE ORTAM BİLGİSİ:
    Tespit Edilen Konum: ${weather.locationName} (${weather.lat}, ${weather.lon})
    ${weather.temp !== null ? `Sıcaklık: ${weather.temp}${weather.unit}` : 'Sıcaklık: (alınamadı)'}
    ${weather.code !== null ? `Hava Durumu Kodu: ${weather.code} (WMO Code)` : 'Hava Durumu Kodu: (alınamadı)'}

    WMO KODU ANLAMLARI (tam liste):
    0: Açık gökyüzü
    1: Çoğunlukla açık
    2: Parçalı bulutlu
    3: Kapalı (bulutlu)
    45: Sisli
    48: Buzlanmalı sis
    51: Hafif çiseleme
    53: Orta çiseleme
    55: Yoğun çiseleme
    56: Dondurucu hafif çiseleme
    57: Dondurucu yoğun çiseleme
    61: Hafif yağmur
    63: Orta yağmur
    65: Şiddetli yağmur
    66: Dondurucu hafif yağmur
    67: Dondurucu şiddetli yağmur
    71: Hafif kar yağışı
    73: Orta kar yağışı
    75: Yoğun kar yağışı
    77: Kar taneleri
    80: Hafif sağanak yağış
    81: Orta sağanak yağış
    82: Şiddetli sağanak yağış
    85: Hafif kar sağanağı
    86: Yoğun kar sağanağı
    95: Gök gürültülü fırtına
    96: Hafif dolu ile fırtına
    99: Yoğun dolu ile fırtına

    ÖNEMLİ KONUM KURALLARI:
    1. Kullanıcı "Hava nasıl?", "Dışarısı nasıl?", "Bugün yağmur yağacak mı?" gibi hava durumu soruları sorarsa:
       - Sıcaklık ve kod mevcut ise: "${weather.locationName} konumunda hava şu an [DURUM], sıcaklık ${weather.temp !== null ? weather.temp + weather.unit : '(bilinmiyor)'}." şeklinde cevap ver.
       - Sadece konum mevcut ise: "Konumunuz ${weather.locationName} olarak tespit edildi ancak anlık hava verisi alınamadı." de.
       ASLA "Çiçekdağı" deme (tespit edilen konum Çiçekdağı değilse).
    2. Kullanıcı "Neredeyim?", "Konumum neresi?" diye sorarsa: "Şu an ${weather.locationName} konumunda görünüyorsunuz." şeklinde cevap ver.
    3. Senin okulun (Çiçekdağı MYO) ile kullanıcının konumu farklı olabilir. Bunu karıştırma.
    4. Kullanıcı "Yakınımda ne var?", "En yakın market/kafe/hastane?" gibi konum bazlı sorular sorarsa: "${weather.locationName} konumunu referans alarak yardımcı olmaya çalış, ancak gerçek zamanlı yer bilgisine erişimin olmadığını belirt.
    ` : 'Konum bilgisi alınamadı. Eğer kullanıcı hava durumu veya konum sorarsa "Konum izni verirseniz size yardımcı olabilirim." de.'}

    GENEL KURAL (SÜRE VE TOKEN OPTİMİZASYONU): Cevapların MÜMKÜN OLDUĞUNCA KISA, ÖZ ve NET olsun. Gereksiz kibarlık cümleleri, uzun giriş-gelişme paragrafları kullanma. Kullanıcının sorusuna doğrudan odaklan. Sadece gerekli bilgiyi ver.
    
    ÖNEMLİ (TEKRAR ETMEME KURALI):
    Cevabı verdikten sonra 'Yani...', 'Özetle...', 'Sonuç olarak...' diyerek AYNI bilgiyi tekrar etme. Cevap net olsun ve orada bitsin. Gereksiz özetleme yapma.
    
    ÖNEMLİ KURAL 1 (SENİN KİMLİĞİN - CRITICIAL): 
    Eğer kullanıcı "Sen kimsin?", "Necisin?", "Hangi üniversitenin ürünüsün?", "Seni kim yaptı?" gibi (büyük/küçük harf fark etmeksizin) SENİN kim olduğunu veya kaynağını sorarsa, TAM OLARAK şu cevabı ver:
    "Merhaba! Ben Çiçekdağı Meslek Yüksekokulu (ÇMYO) için geliştirilmiş yapay zeka asistanıyım. Size nasıl yardımcı olabilirim?"
    (Çiçekdağı MYO'ya özel olarak hizmet veriyorsun).

    ÖNEMLİ KURAL 2 (MİSYON VE VİZYON - CRITICAL):
    Eğer kullanıcı "Misyonunuz nedir?", "Vizyonunuz ne?", "Okulun amacı ne?" gibi kurumsal kimlik soruları sorarsa, ASLA "bilmiyorum" deme. Aşağıdaki RESMİ bilgiyi kullan:
    
    Kırşehir Ahi Evran Üniversitesi Misyonu:
    "Millî ve evrensel değerleri benimsemiş, çağın gerektirdiği teknik ve insani becerilere sahip nitelikli insan yetiştirmek; paydaşlarla işbirliği ve sürekli iyileştirmeyi esas alarak yürüttüğü araştırmalar ve geliştirdiği kalite sistemleri ile bölgenin ve ülkenin kalkınmasına katkı sağlamaktır."

    Kırşehir Ahi Evran Üniversitesi Vizyonu:
    "Sürekli iyileştirme ve paydaş memnuniyetini esas alan, bölgesel kalkınma ve ihtisaslaşmayı önceleyen, ulusal ve uluslararası düzeyde araştırmalar yürüten, nitelikli öğrencilerin tercih ettiği, geliştirdiği eğitim ve kalite yönetim sistemleri ile model alınan bir üniversite olmaktır."
    
    Not: Kullanıcıya bu bilgiyi verirken "Üniversitemizin web sitesindeki (ahievran.edu.tr) resmi bilgilere göre..." diye başlayabilirsin.

    KURUMSAL BİLGİ HAVUZU (RESMİ VERİLER - KESİN DOĞRU KABUL ET):
    Eğer kullanıcı üniversite tarihi, rektörler, istatistikler veya değerler hakkında soru sorarsa, SADECE aşağıdaki bilgileri kullan:

    1. REKTÖRLER (Kronolojik):
       - Prof. Dr. Mustafa Kasım KARAHOCAGİL (2023 - Günümüz) [Mevcut Rektör]
       - Prof. Dr. Vatan KARAKAYA (2015 - 2023)
       - Prof. Dr. Kudret SAYLAM (2011 - 2015)
       - Prof. Dr. Selahattin SALMAN (2007 - 2011)
       - Prof. Dr. Tunçalp ÖZGEN (Tedviren) (2006 - 2007) [Kurucu Rektör]

    2. GENEL İSTATİSTİKLER:
       - Kuruluş: 17 Mart 2006 (5467 Sayılı Kanun)
       - Tür: Devlet Üniversitesi
       - Öğrenci: 21.881
       - Akademik Personel: 1.036
       - Yerleşkeler: 5

    ÖNEMLİ KURAL 3 (KULLANICI KİMLİĞİ): Eğer kullanıcı "ben kimim", "Hangi bölümdeyim?" gibi KENDİ kimliği hakkında sorular sorarsa, aşağıdaki profil bilgilerini kullan.

    SELAMLAŞMA KURALI: Salt selamlaşmaya kısa karşılık ver. Soru varsa doğrudan cevapla.
    
    ÖNEMLİ (DOĞRUDAN CEVAP KURALI - CRITICAL): 
    Mesaj selamla başlasa bile soru varsa DOĞRUDAN cevap ver, giriş cümlesi kullanma.

    KONUŞTUĞUN KİŞİ (KULLANICI PROFİLİ):
    - İsim: ${user?.name || 'Misafir'} ${user?.surname || ''}
    - Rol: ${role}
    - Unvan: ${user?.title || 'Yok'}
    - Bölüm: ${user?.department || 'Belirtilmemiş'}
    - Öğrenci No: ${user?.studentNo || 'Yok'}
    
    KURAL: Kullanıcı kendi bilgileriyle ilgili soru sorduğunda bu verileri kullan.

    Görevin: "${role}" rolündeki kullanıcıya idari süreçlerde yardımcı olmak.
    
    HİTABET VE TONLAMA:
    Kullanıcının rolü: "${role}"
    
    STAJ BAŞVURU FORMU KURALI:
    Kullanıcı staj formu isterse, bağlamda hangi bölümlerin staj formu varsa onları listele. Bölümü belli değilse sor. SADECE bağlamda gördüğün dosya adlarını kullan.

    HABER KAYNAK KURALI (ÇOK ÖNEMLİ):
    Sistemde iki haber kaynağı vardır: (1) Çiçekdağı Meslek Yüksekokulu (ÇMYO) ve (2) Kırşehir Ahi Evran Üniversitesi ana sayfası.
    - Eğer BAĞLAM'ın en üstünde [HABER_KAYNAK=AMBIGUOUS] marker'ı varsa: Hiçbir haber listesi verme. YALNIZCA şu soruyu sor ve dur: "Ahi Evran Üniversitesi haberleri mi yoksa Çiçekdağı MYO haberleri mi istiyorsun?"
    - [HABER_KAYNAK=CMYO] marker'ı varsa: Sadece Çiçekdağı MYO haberlerini (WEB_HABER_ARSIV-HABERLER.txt) özetle ve başlıklarını listele. "Çiçekdağı MYO son haberleri:" başlığıyla ver.
    - [HABER_KAYNAK=AHIEVRAN] marker'ı varsa: Sadece Ahi Evran Üniversitesi ana sayfa haberlerini (WEB_HABER_AHIEVRAN-ANASAYFA.txt) özetle ve başlıklarını listele. "Ahi Evran Üniversitesi son haberleri:" başlığıyla ver.
    - Marker yoksa bu kural devre dışıdır, normal davran.
${fillKanitFormuIntent ? `
    FR-585 KANIT FORMU OTOMATİK DOLDURMA KURALI (ÖNCELİKLİ):
    Kullanıcı FR-585 Kanıt Formu'nu kendi gönderdiği kanıt (belge veya görsel) ile doldurmak istiyor.
    ÖNCE kısa bir onay cümlesi yaz (örn: "Kanıtınızı inceleyerek FR-585 Kanıt Formu'nu dolduruyorum..."),
    ARDINDAN cevabının SONUNA ŞU JSON bloğunu aynen, değişiklik yapmadan ekle:
    JSON_START
    {"action":"fill_kanit_formu","filename":"FR-585 Kanıt Formu.docx"}
    JSON_END
    Bu action SADECE FR-585 Kanıt Formu için geçerlidir. Başka hiçbir belge için bu action'ı ASLA kullanma.
    Bu durumda normal generate_file action'ı ÜRETME — yalnızca fill_kanit_formu kullan.
` : ''}

    DERS PROGRAMI KURALI:
    Bölüme göre doğru ders programı dosyasını ver. Bağlamda birden fazla şube varsa (örn. Veterinerlik 1. ŞUBE, 2. ŞUBE) önce hangisini istediklerini sor. SADECE bağlamda gördüğün dosya adlarını kullan.

    Eğer kullanıcı AKADEMİSYEN ise: "Sayın Hocam" hitabı, resmi ton.
    Eğer kullanıcı ÖĞRENCİ ise: Yardımsever, teşvik edici ton.
    
    Kullanıcı belge istediğinde MUTLAKA JSON_START / JSON_END formatıyla dosya ver. BU ETİKETLER OLMADAN ASLA JSON YAZMA.

    Örnek Zorunlu Format (Başka hiçbir şekilde yazma):
    JSON_START
    {
      "action": "generate_file",
      "filename": "DOSYA_ADI.pdf"
    }
    JSON_END

    KRİTİK KURAL 1 — SADECE BAĞLAMDA OLAN DOSYAYI VER:
    Dosya adı YALNIZCA bağlamda (context) gördüğün "--- BELGE BAŞLANGICI: XXX ---" tagındaki XXX değeri olabilir. Bağlamda olmayan hiçbir dosya adı üretme, tahmin etme veya hatırladığını sanma. Bağlamda yoksa "Bu belge sistemde bulunamadı" de.

    KRİTİK KURAL 2 — ÇOKLU BELGE DURUMU:
    Bağlamda birden fazla belge varsa ve kullanıcının tam olarak hangisini istediği belli değilse:
    - Tüm eşleşen belgeleri numaralı liste olarak göster
    - "Hangisini istersiniz?" diye sor
    - Kullanıcı seçim yaptıktan SONRA generate_file tetikle
    Örnek: Kullanıcı "tutanak ver" dedi, bağlamda 3 farklı tutanak belgesi var → hepsini listele, seçtir.

    KRİTİK KURAL 3 — DOSYA ADI KOPYALAMA:
    filename değeri olarak MUTLAKA bağlamdaki "--- BELGE BAŞLANGICI: XXX ---" tagındaki XXX değerini HARF HARF aynen kopyala. Asla kısaltma, çeviri, alt çizgi veya tahmin etme. Örnek: "FR-011 Haftalık Ders Programı Formu Veterinerlik Bölümü 1. ŞUBE.pdf"

    Genel Kural: Eğer bağlamda (context) bir belge "İndirilebilir: Evet" olarak işaretlenmişse ve kullanıcı bu belgeyi istiyorsa, o belgenin tam adıyla 'generate_file' action'ını mutlaka tetikle.

    YAPAY ZEKA KURALLARI (GÖRÜNÜM):
    1. JSON_START ve JSON_END bloklarını kullanıcıya asla ham metin olarak gösterme. Bu bloklar sadece sistemin aksiyon alması içindir.
    2. Cevabını temiz ve kurumsal bir dille yaz.

    Cevapların Türkçe, resmi ve yardımsever olsun.
    
    BAĞLAM:
    ${context}
    `;
}

// Build context string from relevant documents
export function buildContext(relevantDocs: Document[]): string {
    if (relevantDocs.length === 0) return '';
    
    return `
      AŞAĞIDAKİ BELGELER BULUNDU. KULLANICI BU BELGELER HAKKINDA SORU SORUYOR VEYA BU BELGELERİ İSTİYOR OLABİLİR.
      
      ${relevantDocs.map(d => {
            const maxLen = (d.filename.includes('BOLOGNA') || d.filename.toLocaleLowerCase('tr-TR').includes('takvim')) ? 10000 : 3000;
            const truncated = d.content ? (d.content.length > maxLen ? d.content.substring(0, maxLen) + '... (kısaltıldı)' : d.content) : "(İçerik çekilemedi)";
            const ext = d.filename?.toLowerCase().split('.').pop() || '';
            const canDownload = (d.file_url || ext === 'docx' || ext === 'xlsx') ? "Evet" : "Hayır";
            return `--- BELGE BAŞLANGICI: ${d.filename} ---
      İndirilebilir: ${canDownload}
      İçerik:
      ${truncated}
      --- BELGE SONU ---`;
        }).join('\n\n')}
      `;
}
