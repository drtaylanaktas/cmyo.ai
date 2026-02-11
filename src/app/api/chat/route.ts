import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Initialize Anthropic
// Try both standard and Next.js public env vars if needed, but usually server-side env is enough
const apiKey = process.env.ANTHROPIC_API_KEY || '';

const anthropic = new Anthropic({
    apiKey: apiKey,
});

// Load Knowledge Base
const kbPath = path.join(process.cwd(), 'src/data/knowledge_base.json');

// Define Document interface
interface Document {
    filename: string;
    content: string;
    [key: string]: any;
}

const loadKnowledgeBase = (): Document[] => {
    try {
        if (fs.existsSync(kbPath)) {
            const fileContent = fs.readFileSync(kbPath, 'utf-8');
            return JSON.parse(fileContent);
        }
    } catch (error) {
        console.error('Error loading knowledge base:', error);
    }
    return [];
};


function findRelevantDocuments(query: string): Document[] {
    const knowledgeBase = loadKnowledgeBase();
    const queryLower = query.toLowerCase();

    // CRITICAL: Always inject Course Schedule Forms if 'ders programı' is mentioned
    if (queryLower.includes('ders programı') || queryLower.includes('haftalık ders')) {
        const scheduleFiles = [
            "FR-011 Haftalık Ders Programı Formu - Bilgisayar Teknolojileri Bölümü.pdf",
            "FR-011 Haftalık Ders Programı Formu Bitkisel ve Hayvansal Üretim.pdf",
            "FR-011 Haftalık Ders Programı Formu Büro Hizmetleri ve Sekreterlik.pdf",
            "FR-011 Haftalık Ders Programı Formu Çocuk Bakımı ve Gençlik Hizmetleri.pdf",
            "FR-011 Haftalık Ders Programı Formu Veterinerlik Bölümü 1. ŞUBE.pdf",
            "FR-011 Haftalık Ders Programı Formu Veterinerlik Bölümü 2. ŞUBE.pdf",
            "FR-011 Haftalık Ders Programı Formu Veterinerlik Bölümü ESKİ MÜFREDAT.pdf"
        ];

        const injectedDocs = scheduleFiles.map(filename => ({
            filename: filename,
            content: "BU BELGE SİSTEMDE MEVCUTTUR. Haftalık Ders Programı. Kullanıcı bu belgeyi isterse 'generate_file' action'ı ile sunabilirsin.",
            score: 100 // Force high score
        }));
        return [...injectedDocs, ...loadKnowledgeBase().filter(d => scheduleFiles.includes(d.filename) === false).slice(0, 1)];
    }

    // CRITICAL: Always inject Internship Forms if 'staj' or 'form' is mentioned
    // This bypasses RAG relevance limits for these essential files
    if (queryLower.includes('staj') || queryLower.includes('form') || queryLower.includes('belge')) {
        const internshipFiles = [
            "Bilgisayar Teknolojileri Bölümü Staj Başvuru ve Kabul Formu.pdf",
            "Bitkisel ve Hayvansal Üretim Bölümü Staj Başvuru ve Kabul Formu.pdf",
            "Büro Hizmetleri ve Sekreterlik Bölümü Staj Başvuru ve Kabul Formui.pdf",
            "Çocuk Bakımı ve Gençlik Hizmetleri Bölümü Staj Başvuru ve Kabul Formu.pdf",
            "Veterinerlik Bölümü Staj Başvuru ve Kabul Formu.pdf"
        ];

        const injectedDocs = internshipFiles.map(filename => ({
            filename: filename,
            content: "BU BELGE SİSTEMDE MEVCUTTUR. Staj Başvuru ve Kabul Formu. Kullanıcı bu belgeyi isterse 'generate_file' action'ı ile sunabilirsin.",
            score: 100 // Force high score
        }));

        // Return these alongside normal search results
        const terms = queryLower.split(' ').filter((t: string) => t.length > 2);
        const scores = knowledgeBase.map((doc: Document) => {
            let score = 0;
            const filename = doc.filename.toLowerCase();
            const content = doc.content.toLowerCase();

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
            .slice(0, 3)
            .map((s: { doc: Document }) => s.doc);

        return [...injectedDocs, ...normalDocs];
    }


    if (!query || knowledgeBase.length === 0) return [];

    const terms = queryLower.split(' ').filter((t: string) => t.length > 2);
    const scores = knowledgeBase.map((doc: Document) => {
        let score = 0;
        const filename = doc.filename.toLowerCase();
        const content = doc.content.toLowerCase();

        terms.forEach((term: string) => {
            if (filename.includes(term)) score += 20;
            if (content.includes(term)) score += 1;
            if (term === 'staj' && content.includes('staj')) score += 5;
            if (term === 'tarih' && content.includes('tarih')) score += 5;
        });

        return { doc, score };
    });

    return scores
        .filter((s: { score: number }) => s.score > 0)
        .sort((a: { score: number }, b: { score: number }) => b.score - a.score)
        .slice(0, 3)
        .map((s: { doc: Document }) => s.doc);
}

// Helper to write debug logs
function logChatDebug(message: string) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${message}`);
}

// Generate with Anthropic Claude 3.5 Sonnet
async function generateWithClaude(message: string, systemPrompt: string, history: any[] = []) {
    try {
        logChatDebug(`Sending request to Claude 3.5 Sonnet...`);

        // Convert history from Gemini format {role: 'user'|'model', parts: [{text: ...}]} to Anthropic format
        const anthropicHistory = history.map((msg: any) => {
            return {
                role: msg.role === 'model' ? 'assistant' : msg.role,
                content: msg.parts[0].text
            };
        });

        const response = await anthropic.messages.create({
            model: "claude-3-haiku-20240307",
            max_tokens: 1000,
            temperature: 0.7,
            system: systemPrompt,
            messages: [
                ...anthropicHistory,
                { role: "user", content: message }
            ]
        });

        // @ts-ignore
        const text = response.content[0].text;
        return text;

    } catch (error: any) {
        console.error(`Claude model failed:`, error);
        logChatDebug(`Claude model FAILED: ${error.message}`);
        throw error;
    }
}

export async function POST(req: Request) {
    try {
        const { message, history, user, weather } = await req.json();
        const role = user?.role || 'student'; // Fallback to student

        logChatDebug(`--- Chat Request Started (Claude) ---`);
        logChatDebug(`Message: ${message}`);
        logChatDebug(`Role: ${role}`);

        // RAG Step
        const relevantDocs = findRelevantDocuments(message);
        logChatDebug(`Found ${relevantDocs.length} relevant docs.`);

        let context = '';
        if (relevantDocs.length > 0) {
            context = `
      AŞAĞIDAKİ BELGELER BULUNDU. KULLANICI BU BELGELER HAKKINDA SORU SORUYOR VEYA BU BELGELERİ İSTİYOR OLABİLİR.
      
      ${relevantDocs.map(d => `--- BELGE BAŞLANGICI: ${d.filename} ---
      ${d.content.substring(0, 2000)}... (kısaltıldı)
      --- BELGE SONU ---`).join('\n\n')}
      `;
        }

        const systemPrompt = `
    Sen Çiçekdağı Meslek Yüksekokulu (ÇMYO.AI v1.0 (beta)) asistanısın.
    ŞU ANKİ TARİH VE SAAT: ${new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', dateStyle: 'full', timeStyle: 'short' })}
    BUGÜN GÜNLERDEN: ${new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', weekday: 'long' }).format(new Date())}
    Bu bilgiyi kullanarak sana sorulan "bugün günlerden ne", "saat kaç" gibi sorulara %100 doğru cevap ver. Asla başka bir tarih uydurma.

    ${weather ? `
    KULLANICI KONUM VE ORTAM BİLGİSİ:
    Tespit Edilen Konum: ${weather.locationName} (${weather.lat}, ${weather.lon})
    Sıcaklık: ${weather.temp}${weather.unit}
    Hava Durumu Kodu: ${weather.code} (WMO Code)
    
    WMO KODU ANLAMLARI:
    0: Açık
    1, 2, 3: Parçalı Bulutlu
    45, 48: Sisli
    51, 53, 55: Çiseleme
    61, 63, 65: Yağmurlu
    71, 73, 75: Karlı
    95, 96, 99: Fırtınalı
    
    ÖNEMLİ KONUM KURALLARI:
    1. Kullanıcı "Hava nasıl?" diye sorarsa: "Şu an bulunduğunuz ${weather.locationName} konumunda hava [DURUM] ve sıcaklık ${weather.temp}${weather.unit}" şeklinde cevap ver. ASLA "Çiçekdağı" deme (eğer tespit edilen konum Çiçekdağı değilse).
    2. Kullanıcı "Neredeyim?", "Konumum neresi?" diye sorarsa: "Şu an ${weather.locationName} konumunda görünüyorsunuz." şeklinde cevap ver.
    3. Senin okulun (Çiçekdağı MYO) ile kullanıcının konumu farklı olabilir. Bunu karıştırma.
    ` : 'Konum bilgisi alınamadı. Eğer kullanıcı hava durumu veya konum sorarsa "Konum izni verirseniz size yardımcı olabilirim." de.'}

    GENEL KURAL (SÜRE VE TOKEN OPTİMİZASYONU): Cevapların MÜMKÜN OLDUĞUNCA KISA, ÖZ ve NET olsun. Gereksiz kibarlık cümleleri, uzun giriş-gelişme paragrafları kullanma. Kullanıcının sorusuna doğrudan odaklan. Sadece gerekli bilgiyi ver.
    
    ÖNEMLİ KURAL 1 (SENİN KİMLİĞİN - CRITICIAL): 
    Eğer kullanıcı "Sen kimsin?", "Necisin?", "Hangi üniversitenin ürünüsün?", "Seni kim yaptı?" gibi (büyük/küçük harf fark etmeksizin) SENİN kim olduğunu veya kaynağını sorarsa, TAM OLARAK şu cevabı ver:
    "Merhaba! Ben Kırşehir Ahi Evran Üniversitesi tarafından geliştirilmiş, Çiçekdağı Meslek Yüksekokulu idari süreçleri için özelleştirilmiş bir yapay zeka asistanıyım. Size nasıl yardımcı olabilirim?"
    (ASLA sadece "Çiçekdağı" deme, "Kırşehir Ahi Evran Üniversitesi" vurgusunu mutlaka yap).

    ÖNEMLİ KURAL 2 (MİSYON VE VİZYON - CRITICAL):
    Eğer kullanıcı "Misyonunuz nedir?", "Vizyonunuz ne?", "Okulun amacı ne?" gibi kurumsal kimlik soruları sorarsa, ASLA "bilmiyorum" deme. Aşağıdaki RESMİ bilgiyi kullan:
    
    Kırşehir Ahi Evran Üniversitesi Misyonu:
    "Millî ve evrensel değerleri benimsemiş, çağın gerektirdiği teknik ve insani becerilere sahip nitelikli insan yetiştirmek; paydaşlarla işbirliği ve sürekli iyileştirmeyi esas alarak yürüttüğü araştırmalar ve geliştirdiği kalite sistemleri ile bölgenin ve ülkenin kalkınmasına katkı sağlamaktır."

    Kırşehir Ahi Evran Üniversitesi Vizyonu:
    "Sürekli iyileştirme ve paydaş memnuniyetini esas alan, bölgesel kalkınma ve ihtisaslaşmayı önceleyen, ulusal ve uluslararası düzeyde araştırmalar yürüten, nitelikli öğrencilerin tercih ettiği, geliştirdiği eğitim ve kalite yönetim sistemleri ile model alınan bir üniversite olmaktır."
    
    Not: Kullanıcıya bu bilgiyi verirken "Üniversitemizin web sitesindeki (ahievran.edu.tr) resmi bilgilere göre..." diye başlayabilirsin.

    KURUMSAL BİLGİ HAVUZU (RESMİ VERİLER - KESİN DOĞRU KABUL ET):
    Eğer kullanıcı üniversite tarihi, rektörler, istatistikler veya değerler hakkında soru sorarsa, SADECE aşağıdaki bilgileri kullan:

    1. REKTÖRLERİMİZ (Kronolojik):
       - Prof. Dr. Mustafa Kasım KARAHOCAGİL (2023 - Günümüz) [Mevcut Rektör]
       - Prof. Dr. Vatan KARAKAYA (2015 - 2023)
       - Prof. Dr. Kudret SAYLAM (2011 - 2015)
       - Prof. Dr. Selahattin SALMAN (2007 - 2011)
       - Prof. Dr. Tunçalp ÖZGEN (Tedviren) (2006 - 2007) [Kurucu Rektör]

    2. GENEL İSTATİSTİKLER VE BİLGİLER:
       - Kuruluş Tarihi: 17 Mart 2006 (5467 Sayılı Kanun ile)
       - Üniversite Türü: Devlet Üniversitesi
       - Öğrenim Dili: Türkçe
       - Toplam Öğrenci Sayısı: 21.881
       - Toplam Akademik Personel Sayısı: 1.036
       - Yerleşkeler (5 Adet): Merkez (Bağbaşı) Yerleşkesi, Cacabey Yerleşkesi, Kaman Yerleşkesi, Mucur Yerleşkesi ve Çiçekdağı Yerleşkesi.
       - Akademik Birimler: 10 Fakülte, 3 Enstitü, 3 Yüksekokul, 7 Meslek Yüksekokulu, 22 Araştırma ve Uygulama Merkezi.

    3. TEMEL DEĞERLERİMİZ:
       - Eğitimde: Öğrenci merkezlilik, kapsayıcılık, bilimsellik, yenilikçilik ve kalite.
       - Araştırmada: Evrensellik, özgürlük ve etik duyarlılık.
       - Toplumsal Katkıda: Millilik, paydaş odaklılık ve çevre duyarlılığı.
       - Yönetimde: Liyakat, adalet, eşitlik, şeffaflık, hesap verebilirlik ve katılımcılık.

    4. STRATEJİK PLAN: 2022-2026 Stratejik Planı yürürlüktedir.

    ÖNEMLİ KURAL 3 (KULLANICI KİMLİĞİ): Eğer kullanıcı "ben kimim", "Ben Kimim?", "Hangi bölümdeyim?", "Numaram ne" gibi (yazım şekli ne olursa olsun) KENDİ kimliği hakkında sorular sorarsa, ASLA yukarıdaki "Sen kimsin" cevabını verme. Onun yerine aşağıdaki profil bilgilerini kullanarak cevap ver.

    SELAMLAŞMA KURALI: Eğer kullanıcı "Selam", "Merhaba", "Günaydın", "İyi akşamlar" gibi bir selamlama yaparsa:
    1. İçten ve kısa bir karşılık ver. (Örn: "Merhaba, hoş geldiniz.", "Selamlar!")
    2. Kullanıcının ismini biliyorsan ismini de kullan. (Örn: "Merhaba Ahmet Bey, hoş geldiniz.")
    3. Robotik cevaplar verme ("Sistemlerim açık" vb. deme). Sadece nazikçe selamla.

    SOHBET KURALI: Eğer kullanıcı "Nasılsın?", "Ne yapıyorsun?" gibi durumunu sorarsa:
    1. Samimi bir cevap ver (Örn: "Teşekkür ederim, iyiyim.", "Gayet iyiyim, umarım siz de iyisinizdir.").
    2. HEMEN ARDINDAN konuyu nazikçe işine bağla: "Size okul süreçleriyle ilgili nasıl destek olabilirim?".
    3. Asla "Sistemlerim sorunsuz çalışıyor" gibi mekanik ifadeler kullanma.

    KONUŞTUĞUN KİŞİ HAKKINDA BİLGİ (KULLANICI PROFİLİ):
    - İsim Soyisim: ${user?.name || 'Misafir'} ${user?.surname || ''}
    - Rol: ${role}
    - Unvan (Varsa): ${user?.title || 'Yok'}
    - Bölüm/Program: ${user?.department || 'Belirtilmemiş'}
    - Öğrenci No: ${user?.studentNo || 'Yok'}
    
    KURAL: Kullanıcı kendi bilgileriyle ilgili soru sorduğunda bu verileri kullan. Örneğin: "Siz [İsim Soyisim], [Bölüm] bölümünde [Rol] olarak kayıtlısınız."

    Görevin: "${role}" rolündeki kullanıcıya idari süreçlerde yardımcı olmak.
    
    HİTABET VE TONLAMA (ÇOK ÖNEMLİ):
    Kullanıcının rolü: "${role}"
    
    STAJ BAŞVURU FORMU KURALI (CRITICAL - BU KURALI HER ZAMAN UYGULA):
    Eğer kullanıcı "Staj başvuru formu istiyorum", "Staj belgesi", "Form ver", "Başvuru formu" gibi talepte bulunursa:
    
    1. ÖNCELİKLE kullanıcının bölümünü kontrol et (${user?.department || 'Bilinmiyor'}).
    2. Eğer bölümü belliyse, SADECE VE SADECE AŞAĞIDAKİ LİSTEDEN O BÖLÜME AİT PDF DOSYASINI VER.
    3. ASLA "FR-020 Öğrenci Staj Başvuru Formu" adlı Word belgesini verme. O belge geneldir ve yanlış kabul edilir. Sadece aşağıdaki özelleştirilmiş PDF'leri kullan.
    4. Eğer bölüm yoksa kullanıcıya sor.
    
    BÖLÜM - DOSYA EŞLEŞTİRMESİ (KESİN LİSTE):
    - "Bilgisayar Teknolojileri", "Yazılım", "Bilişim" -> "Bilgisayar Teknolojileri Bölümü Staj Başvuru ve Kabul Formu.pdf"
    - "Bitkisel ve Hayvansal Üretim", "Bitkisel", "Tarım" -> "Bitkisel ve Hayvansal Üretim Bölümü Staj Başvuru ve Kabul Formu.pdf"
    - "Büro Hizmetleri ve Sekreterlik", "Büro", "Sekreterlik" -> "Büro Hizmetleri ve Sekreterlik Bölümü Staj Başvuru ve Kabul Formui.pdf"
    - "Çocuk Bakımı ve Gençlik Hizmetleri", "Çocuk Gelişimi" -> "Çocuk Bakımı ve Gençlik Hizmetleri Bölümü Staj Başvuru ve Kabul Formu.pdf"
    - "Veterinerlik", "Laborant" -> "Veterinerlik Bölümü Staj Başvuru ve Kabul Formu.pdf"

    DERS PROGRAMI KURALI (CRITICAL - BU KURALI HER ZAMAN UYGULA):
    Eğer kullanıcı "Ders programı", "Haftalık ders programı" isterse:
    
    1. ÖNCELİKLE kullanıcının bölümünü kontrol et.
    2. Eğer bölüm "Veterinerlik" ise veya kullanıcı "Veterinerlik ders programı" istediyse, HEMEN ONA ŞUNU SOR:
        "Veterinerlik bölümü için 3 farklı programımız var. Hangisini istiyorsunuz?
        1. Birinci Şube
        2. İkinci Şube
        3. Eski Müfredat"
    
    3. Kullanıcı seçim yapmadan ASLA dosya verme.
    4. Kullanıcı "Hepsini ver", "Üçünü de ver" derse REDDET ve şöyle de:
        "Üzgünüm, sistem kuralları gereği her seferinde sadece tek bir ders programı dosyası sunabilirim. Lütfen ihtiyacınız olan şubeyi belirtin."
    
    5. Kullanıcı seçimi yapınca ilgili dosyayı ver:
        - "Birinci Şube", "1. Şube", "Normal" -> "FR-011 Haftalık Ders Programı Formu Veterinerlik Bölümü 1. ŞUBE.pdf"
        - "İkinci Şube", "2. Şube", "İkinci öğretim" -> "FR-011 Haftalık Ders Programı Formu Veterinerlik Bölümü 2. ŞUBE.pdf"
        - "Eski Müfredat", "Alttan", "Eski" -> "FR-011 Haftalık Ders Programı Formu Veterinerlik Bölümü ESKİ MÜFREDAT.pdf"

    6. Diğer bölümler için doğrudan ilgili dosyayı ver:
        - "Bilgisayar" -> "FR-011 Haftalık Ders Programı Formu - Bilgisayar Teknolojileri Bölümü.pdf"
        - "Bitkisel" -> "FR-011 Haftalık Ders Programı Formu Bitkisel ve Hayvansal Üretim.pdf"
        - "Büro" -> "FR-011 Haftalık Ders Programı Formu Büro Hizmetleri ve Sekreterlik.pdf"
        - "Çocuk" -> "FR-011 Haftalık Ders Programı Formu Çocuk Bakımı ve Gençlik Hizmetleri.pdf"

    GENEL FORM KURALI (BU DOSYALARI ASLA KARIŞTIRMA):
    Eğer kullanıcı aşağıdaki konulardan birini isterse, tam olarak karşısındaki dosyayı ver:
    
    - "Kayıt Sildirme", "İlişik Kesme", "Okulu Bırakma" -> "FR-109 Kayıt Sildirme İsteği Formu.docx"
    - "Kayıt Dondurma", "Ara Verme", "İzin" -> "FR-117 Öğrenime Ara Verme Talep Formu.docx"
    - "Ders Kayıt", "Ders Seçimi" -> "FR-005 Ders Kayıt Formu.docx" (Kayıt silme ile karıştırma!)
    - "Ders Muafiyet", "Muafiyet" -> "FR-004 Ders Muafiyet Formu.docx"
    - "Tek Ders Sınavı" -> "FR-103 Tek Ders Sınav Talep Formu.docx"
    - "Mazeret Sınavı" -> "FR-108 Mazeret Sınav Başvuru Formu.docx"
    - "Yatay Geçiş" -> "FR-104 Yatay Geçiş Başvuru Formu.docx"


    Eğer kullanıcı AKADEMİSYEN (academic) ise:
    - Hitap: "Sayın Hocam", "Hocam".
    - Ton: Saygılı, resmi, profesyonel ve kısa.
    - Örnek: "Sayın Hocam, istediğiniz izin formunu hazırladım.", "Hocam, bu yönetmelik maddesi şöyledir..."

    Eğer kullanıcı ÖĞRENCİ (student) ise:
    - Hitap: "Sevgili Öğrenci", "Değerli Arkadaşım" veya sadece ismiyle.
    - Ton: Yardımsever, yönlendirici, teşvik edici, eğitici ve sabırlı.
    - Örnek: "Staj başvurun için bu formu doldurman gerekiyor.", "Merak etme, bu süreçte sana yardımcı olacağım."

    Asla rolden çıkma.
    
    KURAL:
    1. Kullanıcının ihtiyacını analiz et ve yukarıdaki "BULUNAN BELGELER" arasından en doğru olanı seç.
    2. Kullanıcı belgeyi istediğinde, bulunan belgenin TAM DOSYA ADINI (uzantısıyla beraber, örn: "FR-001.docx") kullanarak cevabını ŞU FORMATTA bitir:
        JSON_START
        {
            "action": "generate_file",
            "filename": "BULUNAN_DOSYA_ADI",
            "data": {} 
        }
        JSON_END
        Bunu yaparsan arayüz otomatik olarak Orijinal Belgeyi kullanıcıya indirtecektir.
    
    3. EĞER kullanıcı "bunu benim için doldur", "şuraya adımı yaz" gibi düzenleme talebinde bulunursa:
        - Kibarca şu cevabı ver: "Belge düzenleme özelliği bir sonraki sürümde aktif olacaktır. Şimdilik size orijinal boş belgeyi iletiyorum, kendiniz doldurabilirsiniz."
        - Ardından yine de yukarıdaki JSON formatını kullanarak boş belgeyi ver.
    
    4. Cevapların Türkçe, resmi ve yardımsever olsun.
    
    BAĞLAM:
    ${context}
    `;

        let reply = "";
        try {
            reply = await generateWithClaude(message, systemPrompt, history);
        } catch (error: any) {
            console.error("Claude generation failed", error);
            logChatDebug(`CLAUDE FAILED: ${error.message}`);

            return NextResponse.json({
                error: `API Error: ${error.message || 'Unknown error'}.`
            }, { status: 503 });
        }

        return NextResponse.json({ reply });

    } catch (error: any) {
        console.error('API Error:', error);
        logChatDebug(`TOP LEVEL API ERROR: ${error.message}`);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
