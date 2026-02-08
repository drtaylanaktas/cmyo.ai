import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Initialize Gemini
// Try both standard and Next.js public env vars
const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY || '';
const genAI = new GoogleGenerativeAI(apiKey);

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
        return [...injectedDocs, ...loadKnowledgeBase().filter(d => scheduleFiles.includes(d.filename) === false).slice(0, 1)]; // Return injected docs + 1 random for variety if needed, or just injected.
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

// Helper to try multiple models
async function generateWithFallback(message: string, history: any[] = []) {
    const modelsToTry = [
        'gemini-2.0-flash-lite',
        'gemini-2.5-flash',
        'gemini-1.5-flash'
    ];

    for (const modelName of modelsToTry) {
        try {
            console.log(`Trying model: ${modelName}`);
            const model = genAI.getGenerativeModel({ model: modelName });

            const chat = model.startChat({
                history: history,
                generationConfig: {
                    maxOutputTokens: 2048,
                },
            });

            const result = await chat.sendMessage(message);
            const text = result.response.text();
            return text;
        } catch (error: any) {
            console.error(`Model ${modelName} failed:`, error.message);
            logChatDebug(`Model ${modelName} FAILED: ${error.message}`);
            // Continue to next model if available
            if (modelsToTry.indexOf(modelName) === modelsToTry.length - 1) {
                throw error; // Throw only if all fail
            }
        }
    }
    throw new Error("All models failed");
}

// Helper to write debug logs
// Helper to write debug logs (Console only for Vercel)
function logChatDebug(message: string) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${message}`);
}

export async function POST(req: Request) {
    try {
        const { message, history, user } = await req.json();
        const role = user?.role || 'student'; // Fallback to student

        logChatDebug(`--- Chat Request Started ---`);
        logChatDebug(`Message: ${message}`);
        logChatDebug(`Role: ${role}`);

        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite' });

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
    Sen Çiçekdağı Meslek Yüksekokulu (ÇMYO.AI) asistanısın.
    ŞU ANKİ TARİH VE SAAT: ${new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', dateStyle: 'full', timeStyle: 'short' })}
    BUGÜN GÜNLERDEN: ${new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', weekday: 'long' }).format(new Date())}
    Bu bilgiyi kullanarak sana sorulan "bugün günlerden ne", "saat kaç" gibi sorulara %100 doğru cevap ver. Asla başka bir tarih uydurma.
    
    ÖNEMLİ KURAL 1 (SENİN KİMLİĞİN): Eğer kullanıcı "Sen kimsin?", "Necisin?" gibi (büyük/küçük harf fark etmeksizin) SENİN kim olduğunu sorarsa, TAM OLARAK şu cümleyi kur:
    "Merhaba! Ben Çiçekdağı Meslek Yüksekokulu bünyesinde oluşturulmuş yapay zeka asistanıyım. Size nasıl yardımcı olabilirim?"
    
    ÖNEMLİ KURAL 2 (KULLANICI KİMLİĞİ): Eğer kullanıcı "ben kimim", "Ben Kimim?", "Hangi bölümdeyim?", "Numaram ne" gibi (yazım şekli ne olursa olsun) KENDİ kimliği hakkında sorular sorarsa, ASLA yukarıdaki "Sen kimsin" cevabını verme. Onun yerine aşağıdaki profil bilgilerini kullanarak cevap ver.

    SOHBET KURALI: Eğer kullanıcı "Nasılsın?", "Ne yapıyorsun?" gibi günlük sohbet soruları sorarsa:
    1. Önce samimi ve mantıklı bir cevap ver (Örn: "Teşekkür ederim, dijital dünyamda her şey yolunda.", "Sistemlerim sorunsuz çalışıyor, sorduğunuz için teşekkürler.").
    2. HEMEN ARDINDAN konuyu nazikçe işine bağla: "Sizin için yapabileceğim bir idari işlem veya bulmam gereken bir belge var mı?", "Size okul süreçleriyle ilgili nasıl destek olabilirim?".
    Asla sadece sohbet edip cümleyi bitirme, mutlaka göreve davet et.

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

        // Add system prompt to history if it's the start, or prepend it effectively
        // Since Gemini API handles history differently, we usually just prepend system instruction if possible, 
        // or add it as the first message of the session. 
        // Here we construct the chat sequence.

        let chatHistoryForModel = [];

        // System prompt is always first
        chatHistoryForModel.push({
            role: "user",
            parts: [{ text: systemPrompt }],
        });
        chatHistoryForModel.push({
            role: "model",
            parts: [{ text: "Anlaşıldı. ÇMYO asistanı olarak yardım etmeye hazırım." }],
        });

        // Append previous history if available
        if (history && Array.isArray(history)) {
            chatHistoryForModel = chatHistoryForModel.concat(history);
        }

        let reply = "";
        try {
            // We don't use the 'history' param of startChat in the same way because we manually constructed the whole flow including system prompt
            // So we send the last message as new input, but we need to respect the context.
            // Actually, generateWithFallback takes (message, history). 
            // We should pass our constructed history.
            reply = await generateWithFallback(message, chatHistoryForModel);
        } catch (error: any) {
            console.error("All models failed", error);
            logChatDebug(`ALL MODELS FAILED: ${error.message}`);
            if (error.response) {
                logChatDebug(`Response blocked: ${JSON.stringify(error.response)}`);
            }
            // Return ACTUAL error for debugging
            return NextResponse.json({
                error: `API Error: ${error.message || 'Unknown error'}. Key Status: ${apiKey ? 'Present (' + apiKey.length + ' chars)' : 'MISSING'}`
            }, { status: 503 });
        }

        return NextResponse.json({ reply });

    } catch (error: any) {
        console.error('API Error:', error);
        logChatDebug(`TOP LEVEL API ERROR: ${error.message}`);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
