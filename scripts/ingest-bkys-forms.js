/**
 * ingest-bkys-forms.js
 *
 * scrape-bkys-forms.js ile oluşturulan bkys_forms.json'ı okuyarak
 * Neon Postgres knowledge_documents tablosuna upsert eder.
 *
 * Kullanım:
 *   node scripts/ingest-bkys-forms.js
 */

const { neon } = require('@neondatabase/serverless');
const fs = require('fs');
const path = require('path');

// .env.local'dan POSTGRES_URL oku
const envPath = path.join(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
        const m = line.match(/^([^#=]+)=(.*)$/);
        if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    });
}

const sql = neon(process.env.POSTGRES_URL);

const FORMS_PATH = path.join(__dirname, '../src/data/bkys_forms.json');
const LOCAL_DATA_DIR = path.join(__dirname, '../src/data');


function buildContent(form) {
    let content = `Belge Kodu: ${form.code || form.full_name}\n`;
    content += `Belge Adı: ${form.name}\n`;
    content += `Belge Türü: Form (Kalite Belgesi)\n`;
    if (form.owner) content += `Hazırlayan Birim: ${form.owner}\n`;
    if (form.date) content += `Tarih: ${form.date}\n`;
    content += `İndirilebilir: Evet\n`;

    if (form.content && form.content.trim().length > 20) {
        content += `\n--- Dosya İçeriği ---\n${form.content.trim()}`;
    }

    return content;
}

// /src/data/ klasöründe aynı isimde yerel dosya var mı?
function hasLocalFile(filename) {
    try {
        const files = fs.readdirSync(LOCAL_DATA_DIR);
        const norm = filename.normalize('NFC').toLowerCase();
        return files.some(f => f.normalize('NFC').toLowerCase() === norm);
    } catch (_) {
        return false;
    }
}

async function main() {
    if (!fs.existsSync(FORMS_PATH)) {
        console.error(`bkys_forms.json bulunamadı: ${FORMS_PATH}`);
        console.error('Önce: node scripts/scrape-bkys-forms.js');
        process.exit(1);
    }

    const forms = JSON.parse(fs.readFileSync(FORMS_PATH, 'utf-8'));
    console.log(`${forms.length} form yüklendi.`);

    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (let i = 0; i < forms.length; i++) {
        const form = forms[i];

        if (!form.filename || !form.dosyaId) {
            skipped++;
            continue;
        }

        const content = buildContent(form).replace(/\x00/g, '');

        // Yerel dosya varsa file_url güncellenmez (yerel öncelikli)
        const localExists = hasLocalFile(form.filename);
        const fileUrl = localExists ? null : form.download_url;

        try {
            if (localExists) {
                await sql(
                    `INSERT INTO knowledge_documents (filename, content, category, priority)
                     VALUES ($1, $2, 'form', 50)
                     ON CONFLICT (filename) DO UPDATE
                         SET content = EXCLUDED.content, updated_at = NOW()`,
                    [form.filename, content]
                );
            } else {
                await sql(
                    `INSERT INTO knowledge_documents (filename, content, category, priority, file_url)
                     VALUES ($1, $2, 'form', 50, $3)
                     ON CONFLICT (filename) DO UPDATE
                         SET content = EXCLUDED.content, file_url = EXCLUDED.file_url, updated_at = NOW()`,
                    [form.filename, content, fileUrl]
                );
            }

            // İlk ekleme mi güncelleme mi anlamak için basit kontrol
            inserted++;
        } catch (err) {
            console.error(`\nHata (${form.filename}): ${err.message}`);
            errors++;
        }

        if ((i + 1) % 100 === 0) {
            console.log(`İlerleme: ${i + 1}/${forms.length}`);
        }
    }

    console.log(`\n✅ Tamamlandı!`);
    console.log(`   İşlenen: ${inserted + skipped}`);
    console.log(`   Başarılı upsert: ${inserted}`);
    console.log(`   Atlandı (eksik veri): ${skipped}`);
    console.log(`   Hata: ${errors}`);

    // Toplam sayıyı göster
    const result = await sql(`SELECT COUNT(*) as count FROM knowledge_documents WHERE category = 'form'`);
    const count = result[0]?.count ?? result.rows?.[0]?.count ?? '?';
    console.log(`   DB'deki toplam "form" kategorisi belge: ${count}`);
}

main().catch(err => {
    console.error('İngestion hatası:', err);
    process.exit(1);
});
