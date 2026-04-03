/**
 * ingest-website.js
 * website_data.json dosyasını okuyarak knowledge_documents tablosuna upsert eder.
 *
 * Çalıştırma:
 *   node -r dotenv/config scripts/ingest-website.js
 *   (dotenv .env.local'dan POSTGRES_URL'yi otomatik yükler)
 */

const { sql } = require('@vercel/postgres');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const INPUT_FILE = path.join(__dirname, '..', 'src', 'data', 'website_data.json');

async function ingest() {
    console.log('\n📥 Web Sitesi Verisi → knowledge_documents');
    console.log('='.repeat(50));

    if (!fs.existsSync(INPUT_FILE)) {
        console.error(`❌ ${INPUT_FILE} bulunamadı!`);
        console.error('Önce scraper çalıştırın: node scripts/scrape-website.js');
        process.exit(1);
    }

    const data = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
    console.log(`📄 ${data.length} sayfa bulundu.\n`);

    let inserted = 0;
    let updated = 0;
    let errored = 0;

    for (const doc of data) {
        try {
            // Null byte temizle (Postgres uyumsuzluk önlemi)
            const cleanContent = (doc.content || '').replace(/\0/g, '');

            const result = await sql`
                INSERT INTO knowledge_documents (filename, content, category, priority)
                VALUES (${doc.filename}, ${cleanContent}, ${doc.category}, ${doc.priority})
                ON CONFLICT (filename) DO UPDATE
                SET content      = EXCLUDED.content,
                    category     = EXCLUDED.category,
                    priority     = EXCLUDED.priority,
                    updated_at   = CURRENT_TIMESTAMP
                RETURNING (xmax = 0) AS is_insert
            `;

            const isNew = result.rows[0]?.is_insert;
            if (isNew) {
                inserted++;
                console.log(`  ✚ YENİ   ${doc.filename}`);
            } else {
                updated++;
                console.log(`  ↺ GNC    ${doc.filename}`);
            }
        } catch (err) {
            errored++;
            console.error(`  ✗ HATA   ${doc.filename}: ${err.message}`);
        }
    }

    // Cache invalidate (çalışma anında Next.js sunucusu aktifse)
    console.log('\n' + '='.repeat(50));
    console.log(`✅ İşlem tamamlandı!`);
    console.log(`  ✚ Yeni eklenen : ${inserted}`);
    console.log(`  ↺ Güncellenen  : ${updated}`);
    console.log(`  ✗ Hatalı       : ${errored}`);
    console.log(`  Toplam         : ${data.length}`);
    console.log('\nAI bilgi tabanı güncellendi. Değişiklikler hemen aktif olacak.');

    process.exit(0);
}

ingest().catch(err => {
    console.error('Ingest çöktü:', err);
    process.exit(1);
});
