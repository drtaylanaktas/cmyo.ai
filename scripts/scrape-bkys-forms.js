/**
 * scrape-bkys-forms.js
 *
 * BKYS Kalite Dokümantasyon sitesindeki "Formlar" kategorisindeki (turId=5)
 * tüm formları kazır, metin içeriklerini çıkarır ve JSON'a kaydeder.
 *
 * Kullanım:
 *   node scripts/scrape-bkys-forms.js           # Tüm formlar
 *   node scripts/scrape-bkys-forms.js --test    # İlk 10 form (test)
 *   node scripts/scrape-bkys-forms.js --no-text # Metinsiz (sadece metadata)
 *
 * Çıktı: src/data/bkys_forms.json
 * Sonraki adım: node scripts/ingest-bkys-forms.js
 */

const cheerio = require('cheerio');
const mammoth = require('mammoth');
const XLSX = require('xlsx');
const pdf = require('pdf-parse');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://bkys.ahievran.edu.tr';
const FORMS_API = `${BASE_URL}/getKaliteDokumantasyonByTur?turId=5`;
const DOWNLOAD_URL = (dosyaId) => `${BASE_URL}/dosyaIndirLoginsiz?dosyaId=${dosyaId}`;
const OUTPUT_PATH = path.join(__dirname, '../src/data/bkys_forms.json');

const DELAY_MS = 450;       // Sunucuya nazik ol
const SAVE_EVERY = 50;      // Her N formda ara kayıt
const REQUEST_TIMEOUT = 20000;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
    'Accept-Language': 'tr-TR,tr;q=0.9',
};

async function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    try {
        const res = await fetch(url, { ...options, signal: controller.signal, headers: { ...HEADERS, ...options.headers } });
        clearTimeout(timer);
        return res;
    } catch (e) {
        clearTimeout(timer);
        throw e;
    }
}

// ── Metin Çıkarımı ─────────────────────────────────────────────────────────

async function extractTextFromBuffer(buffer, contentType, filename) {
    const ext = (filename.split('.').pop() || '').toLowerCase();

    try {
        // DOCX
        if (contentType.includes('wordprocessingml') || ext === 'docx') {
            const result = await mammoth.extractRawText({ buffer });
            return result.value.trim().substring(0, 6000);
        }

        // XLSX / XLS
        if (contentType.includes('spreadsheetml') || contentType.includes('ms-excel') || ext === 'xlsx' || ext === 'xls') {
            const workbook = XLSX.read(buffer, { type: 'buffer' });
            let text = '';
            workbook.SheetNames.forEach(name => {
                const sheet = workbook.Sheets[name];
                text += XLSX.utils.sheet_to_txt(sheet) + '\n';
            });
            return text.trim().substring(0, 6000);
        }

        // PDF
        if (contentType.includes('pdf') || ext === 'pdf') {
            const data = await pdf(buffer);
            return data.text.trim().substring(0, 6000);
        }

    } catch (err) {
        // Sessizce başarısız ol — fallback content kullanılacak
    }
    return '';
}

// ── Form Listesini Parse Et ─────────────────────────────────────────────────
// Cheerio <tr> öğelerini table dışında düşürdüğü için regex tabanlı parse kullanıyoruz.

function stripHtml(str) {
    return str.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseFormList(html) {
    const forms = [];

    // Her <tr id="dokuman_XXX"> bloğunu regex ile yakala
    const rowPattern = /<tr\s+id="dokuman_(\d+)">([\s\S]*?)<\/tr>/gi;
    let match;

    while ((match = rowPattern.exec(html)) !== null) {
        const dokumanId = parseInt(match[1], 10);
        const rowHtml = match[2];

        // Ad + kod: <strong>...</strong>
        const strongMatch = rowHtml.match(/<strong>([\s\S]*?)<\/strong>/i);
        if (!strongMatch) continue;
        const fullName = stripHtml(strongMatch[1]);
        if (!fullName) continue;

        // dosyaId: onclick="dosyaIndirLoginsiz(6424)"
        const onclickMatch = rowHtml.match(/dosyaIndirLoginsiz\((\d+)\)/);
        if (!onclickMatch) continue;
        const dosyaId = parseInt(onclickMatch[1], 10);

        // Dosya adı: title="FR-001 Askerlik ..."
        const titleMatch = rowHtml.match(/title="([^"]+\.\w{2,5})"/i);
        let filename = titleMatch ? titleMatch[1].trim() : '';
        if (!filename) filename = `${fullName}.docx`;

        // Birim: <td width="%10">KALİTE YÖNETİM...</td> — genellikle son sütunlardan biri
        const tdMatches = [...rowHtml.matchAll(/<td[^>]*width="%10"[^>]*>([\s\S]*?)<\/td>/gi)];
        let owner = '';
        let date = '';
        if (tdMatches.length >= 2) {
            owner = stripHtml(tdMatches[tdMatches.length - 2]?.[1] || '');
            date = stripHtml(tdMatches[tdMatches.length - 1]?.[1] || '');
        } else if (tdMatches.length === 1) {
            owner = stripHtml(tdMatches[0][1]);
        }

        // fullName'den ilk "sözcük grubu" kodu ve geri kalanı ayır
        // Örn: "KYS-FR-001 Askerlik Durumu Beyan Formu"
        const parts = fullName.split(/\s+/);
        let code = '';
        let name = fullName;
        if (parts.length > 1 && /^[A-Z0-9İÇĞÖŞÜ][\w\-.:]+$/.test(parts[0])) {
            code = parts[0];
            name = parts.slice(1).join(' ');
        }

        forms.push({
            dokuman_id: dokumanId,
            code,
            name,
            full_name: fullName,
            filename,
            dosyaId,
            owner,
            date,
            download_url: DOWNLOAD_URL(dosyaId),
        });
    }

    return forms;
}

// ── Ana Fonksiyon ──────────────────────────────────────────────────────────

async function main() {
    const args = process.argv.slice(2);
    const testMode = args.includes('--test');
    const noText = args.includes('--no-text');

    console.log('BKYS Form Scraper başlatılıyor...');
    console.log(`Hedef: ${FORMS_API}`);

    // Mevcut JSON'u yükle (devam etmek için)
    let existingForms = [];
    const existingIds = new Set();
    if (fs.existsSync(OUTPUT_PATH)) {
        existingForms = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf-8'));
        existingForms.forEach(f => existingIds.add(f.dosyaId));
        console.log(`Mevcut: ${existingForms.length} form yüklendi (devam modu)`);
    }

    // Form listesini çek
    console.log('\nForm listesi çekiliyor...');
    let html;
    try {
        const res = await fetchWithTimeout(FORMS_API);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        html = await res.text();
    } catch (e) {
        console.error(`Form listesi alınamadı: ${e.message}`);
        process.exit(1);
    }

    let forms = parseFormList(html);
    console.log(`Toplam ${forms.length} form bulundu.`);

    // Zaten işlenenleri filtrele
    const remaining = forms.filter(f => !existingIds.has(f.dosyaId));
    console.log(`İşlenecek: ${remaining.length} yeni form`);

    if (testMode) {
        forms = remaining.slice(0, 10);
        console.log('Test modu: sadece ilk 10 form');
    } else {
        forms = remaining;
    }

    const results = [...existingForms];
    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    for (let i = 0; i < forms.length; i++) {
        const form = forms[i];
        process.stdout.write(`\r[${i + 1}/${forms.length}] ${form.filename.substring(0, 50).padEnd(50)}`);

        let content = '';

        if (!noText) {
            try {
                const res = await fetchWithTimeout(form.download_url);
                if (res.ok) {
                    const contentType = res.headers.get('content-type') || '';
                    const buffer = Buffer.from(await res.arrayBuffer());

                    if (buffer.length > 0) {
                        const extracted = await extractTextFromBuffer(buffer, contentType, form.filename);
                        content = extracted;
                        successCount++;
                    } else {
                        skipCount++;
                    }
                } else {
                    errorCount++;
                }
            } catch (err) {
                errorCount++;
            }
        }

        // Fallback: en azından metadata
        if (!content) {
            content = '';
        }

        results.push({ ...form, content });

        // Ara kayıt
        if ((i + 1) % SAVE_EVERY === 0) {
            fs.writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2), 'utf-8');
        }

        await sleep(DELAY_MS);
    }

    // Son kayıt
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2), 'utf-8');

    console.log(`\n\n✅ Tamamlandı!`);
    console.log(`   Toplam form: ${results.length}`);
    console.log(`   Metin çıkarıldı: ${successCount}`);
    console.log(`   Boş dosya: ${skipCount}`);
    console.log(`   Hata: ${errorCount}`);
    console.log(`   Kaydedildi: ${OUTPUT_PATH}`);
    console.log(`\nSonraki adım: node scripts/ingest-bkys-forms.js`);
}

main().catch(err => {
    console.error('\nScraper hatası:', err);
    process.exit(1);
});
