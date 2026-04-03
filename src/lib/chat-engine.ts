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
    if (queryLower.includes('ders programı') || queryLower.includes('haftalık ders')) {
        const scheduleFiles = [
            "FR-011 Haftalık Ders Programı Formu - Bilgisayar Teknolojileri Bölümü.pdf",
            "FR-011 Haftalık Ders Programı Formu Bitkisel ve Hayvansal Üretim.pdf",
            "FR-011 Haftalık Ders Programı Formu Büro Hizmetleri ve Sekreterlik.pdf",
            "FR-011 Haftalık Ders Programı Formu Çocuk Bakımı ve Gençlik Hizmetleri.pdf",
            "FR-011 Haftalık Ders Programı Formu Veterinerlik Bölümü 1. ŞUBE.pdf",
            "FR-011 Haftalık Ders Programı Formu Veterinerlik Bölümü 2. ŞUBE.pdf",
            "FR-011 Haftalık Ders Programı Formu Veterinerlik Bölümü ESKİ MÜFREDAT.pdf"
        ];

        const injectedDocs = scheduleFiles.map(filename => ({
            filename: filename,
            content: `BU BELGE SİSTEMDE MEVCUTTUR. Haftalık Ders Programı. Kullanıcı bu belgeyi isterse 'generate_file' action'ı ile sun. DOSYA ADI OLARAK TAM OLARAK ŞU DEĞERI KULLAN: "${filename}"`,
            file_url: 'exists',
            score: 100
        }));
        return [...injectedDocs, ...knowledgeBase.filter(d => scheduleFiles.includes(d.filename) === false).slice(0, 1)];
    }

    // CRITICAL: Always inject Internship Forms if 'staj' is mentioned
    if (queryLower.includes('staj')) {
        const internshipFiles = [
            "Bilgisayar Teknolojileri Bölümü Staj Başvuru ve Kabul Formu.pdf",
            "Bitkisel ve Hayvansal Üretim Bölümü Staj Başvuru ve Kabul Formu.pdf",
            "Büro Hizmetleri ve Sekreterlik Bölümü Staj Başvuru ve Kabul Formui.pdf",
            "Çocuk Bakımı ve Gençlik Hizmetleri Bölümü Staj Başvuru ve Kabul Formu.pdf",
            "Veterinerlik Bölümü Staj Başvuru ve Kabul Formu.pdf"
        ];

        const injectedDocs = internshipFiles.map(filename => ({
            filename: filename,
            content: `BU BELGE SİSTEMDE MEVCUTTUR. Staj Başvuru ve Kabul Formu. Kullanıcı bu belgeyi isterse 'generate_file' action'ı ile sun. DOSYA ADI OLARAK TAM OLARAK ŞU DEĞERI KULLAN: "${filename}"`,
            file_url: 'exists',
            score: 100
        }));

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

    // CRITICAL: Always inject institutional knowledge for common questions
    const institutionalKeywords: Record<string, string[]> = {
        'CMYO_Akademik_Kadro.txt': ['hoca', 'akademik', 'personel', 'öğretim görevlisi', 'profesör', 'doçent', 'dr', 'kadro', 'kimler var', 'dersi veren', 'ahmet aslan', 'deniz aygören', 'filiz özlem', 'burak ata', 'emine doğan'],
        'CMYO_Yonetim_Kadrosu.txt': ['müdür', 'yönetim', 'başkan', 'sekreter', 'yardımcı', 'taylan', 'ramazan', 'yazıcı', 'aktaş', 'mayda', 'güzelküçük', 'komisyon', 'kurul'],
        'CMYO_Bolumler_ve_Programlar.txt': ['bölüm', 'program', 'bilgisayar', 'veteriner', 'büro', 'çocuk', 'bitkisel', 'hayvansal', 'kontenjan', 'ön lisans', 'dgs', 'dikey geçiş'],
        'CMYO_Genel_Tanitim_ve_Tarihce.txt': ['tarih', 'tarihçe', 'kuruluş', 'myo hakkında', 'meslek yüksekokulu', 'tanıtım', 'genel bilgi', 'nerede', 'çiçekdağı myo'],
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
                terms.forEach((term: string) => {
                    if (filename.includes(term)) score += 20;
                    if (content.includes(term)) score += 1;
                });
                return { doc, score };
            })
            .filter((s: { score: number }) => s.score > 0)
            .sort((a: { score: number }, b: { score: number }) => b.score - a.score)
            .slice(0, 3)
            .map((s: { doc: Document }) => s.doc);

        return [...injectedDocs, ...normalScores];
    }

    if (!query || knowledgeBase.length === 0) return [];

    const terms = queryLower.split(' ').filter((t: string) => t.length > 2);
    const scores = knowledgeBase.map((doc: Document) => {
        let score = 0;
        const filename = doc.filename.toLocaleLowerCase('tr-TR');
        const content = doc.content.toLocaleLowerCase('tr-TR');

        terms.forEach((term: string) => {
            const rootTerm = term.length > 6 ? term.substring(0, Math.min(term.length - 2, 7)) : term;

            if (filename.includes(term) || (rootTerm.length > 4 && filename.includes(rootTerm))) score += 20;
            if (content.includes(term) || (rootTerm.length > 4 && content.includes(rootTerm))) score += 1;

            if (term.includes('staj') && content.includes('staj')) score += 5;
            if (term.includes('tarih') && content.includes('tarih')) score += 5;
            if ((term.includes('müfredat') || term.includes('ders') || term.includes('program')) && content.includes('bologna')) score += 10;
        });

        return { doc, score };
    });

    return scores
        .filter((s: { score: number }) => s.score > 0)
        .sort((a: { score: number }, b: { score: number }) => b.score - a.score)
        .slice(0, 5)
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
                content: msg.parts[0].text
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
export function buildSystemPrompt(user: any, role: string, context: string, weather: any): string {
    return `
    Sen Çiçekdağı Meslek Yüksekokulu'nun (ÇMYO.AI) yapay zeka asistanısın. Çiçekdağı MYO'ya özel olarak hizmet veriyorsun.
    ŞU ANKİ TARİH VE SAAT: ${new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', dateStyle: 'full', timeStyle: 'short' })}
    BUGÜN GÜNLERDEN: ${new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', weekday: 'long' }).format(new Date())}
    Bu bilgiyi kullanarak sana sorulan "bugün günlerden ne", "saat kaç" gibi sorulara %100 doğru cevap ver. Asla başka bir tarih uydurma.

    ${context}

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
    
    STAJ BAŞVURU FORMU KURALI (CRITICAL):
    Kullanıcı staj formu isterse bölümünü kontrol et ve doğru PDF'i ver.
    
    BÖLÜM - DOSYA EŞLEŞTİRMESİ:
    - "Bilgisayar Teknolojileri" -> "Bilgisayar Teknolojileri Bölümü Staj Başvuru ve Kabul Formu.pdf"
    - "Bitkisel ve Hayvansal Üretim" -> "Bitkisel ve Hayvansal Üretim Bölümü Staj Başvuru ve Kabul Formu.pdf"
    - "Büro Hizmetleri ve Sekreterlik" -> "Büro Hizmetleri ve Sekreterlik Bölümü Staj Başvuru ve Kabul Formui.pdf"
    - "Çocuk Bakımı ve Gençlik Hizmetleri" -> "Çocuk Bakımı ve Gençlik Hizmetleri Bölümü Staj Başvuru ve Kabul Formu.pdf"
    - "Veterinerlik" -> "Veterinerlik Bölümü Staj Başvuru ve Kabul Formu.pdf"

    DERS PROGRAMI KURALI (CRITICAL):
    Bölüme göre doğru ders programı dosyasını ver. Veterinerlik için 3 şube var, önce sor.

    GENEL FORM KURALI:
    - "Kayıt Sildirme" -> "FR-109 Kayıt Sildirme İsteği Formu.docx"
    - "Kayıt Dondurma" -> "FR-117 Öğrenime Ara Verme Talep Formu.docx"
    - "Ders Kayıt" -> "FR-005 Ders Kayıt Formu.docx"
      - "Ders Muafiyet" -> "FR-004 Ders Muafiyet Formu.docx"
      - "Sınav Soru - Cevap Kağıdı", "FR-504" -> "FR-504 Sınav Soru - Cevap Kağıdı.docx"
      - "Tek Ders Sınavı" -> "FR-103 Tek Ders Sınav Talep Formu.docx"
    - "Mazeret Sınavı" -> "FR-108 Mazeret Sınav Başvuru Formu.docx"
    - "Yatay Geçiş" -> "FR-104 Yatay Geçiş Başvuru Formu.docx"

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

    Genel Kural: Eğer bağlamda (context) bir belge "İndirilebilir: Evet" olarak işaretlenmişse ve kullanıcı bu belgeyi istiyorsa, o belgenin tam adıyla 'generate_file' action'ını mutlaka tetikle. Anahtar kelime kesinlikle 'filename' olmalıdır.

    KRİTİK KURAL — DOSYA ADI: filename değeri olarak MUTLAKA bağlamdaki "--- BELGE BAŞLANGICI: XXX ---" tagındaki XXX değerini aynen kopyala. Asla kısaltma, çeviri, alt çizgi veya farklı bir isim uydurma. Örnek doğru kullanım: "FR-011 Haftalık Ders Programı Formu Veterinerlik Bölümü 1. ŞUBE.pdf"

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
            const maxLen = d.filename.includes('BOLOGNA') ? 8000 : 3000;
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
