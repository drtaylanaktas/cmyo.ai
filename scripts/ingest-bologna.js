const fs = require('fs');
const path = require('path');

const srcDataPath = path.join(__dirname, '../src/data/bologna_data.json');
const kbPath = path.join(__dirname, '../src/data/knowledge_base.json');

async function main() {
    console.log('Starting data ingestion into knowledge base...');

    if (!fs.existsSync(srcDataPath)) {
        console.error(`Source data not found at: ${srcDataPath}. Please run the scraper first.`);
        process.exit(1);
    }

    let kb = [];
    if (fs.existsSync(kbPath)) {
        kb = JSON.parse(fs.readFileSync(kbPath, 'utf-8'));
    }

    const initialLen = kb.length;
    // Remove existing bologna data to prevent duplication
    kb = kb.filter(doc => !doc.filename.includes('BOLOGNA_'));

    console.log(`Cleaned up ${initialLen - kb.length} old bologna documents from knowledge base.`);

    const bolognaData = JSON.parse(fs.readFileSync(srcDataPath, 'utf-8'));

    let addedDocs = 0;

    // Convert curriculum data into unstructured text optimized for keyword search
    for (const unit of bolognaData) {
        if (!unit.curriculum || unit.curriculum.length === 0) continue;

        // Ensure these critical tokens are present for AI search relevance!
        // Adding keywords ensures it matches when users type things like "ders programı, müfredat, dersleri"
        const filename = `BOLOGNA_MÜFREDAT_DERS_PROGRAMI_${unit.faculty}_${unit.department}.txt`.replace(/\s+/g, '_');

        let contentObj = `Bologna Bilgi Paketi - ${unit.type.toUpperCase()} Eğitim Kademesi\n`;
        contentObj += `Fakülte/Yüksekokul: ${unit.faculty}\n`;
        contentObj += `Bölüm/Program: ${unit.department}\n`;
        contentObj += `Sayfa Linki: ${unit.link}\n\n`;
        contentObj += `MÜFREDAT DERSLERİ VE BİLGİLERİ:\n`;

        for (const sem of unit.curriculum) {
            contentObj += `\n>> ${sem.semester}\n`;
            for (const course of sem.courses) {
                contentObj += `- Ders Kodu: ${course.code}, Ders Adı: ${course.name} | Tür: ${course.type} | Teori: ${course.theory}, Uygulama: ${course.practice}, Laboratuvar: ${course.lab} | AKTS: ${course.ects}\n`;

                // Ders detayları varsa ekle (scrape-bologna-details.js ile kazınan veriler)
                if (course.details) {
                    if (course.details.description) {
                        contentObj += `  Açıklama: ${course.details.description}\n`;
                    }
                    if (course.details.outcomes && course.details.outcomes.length > 0) {
                        contentObj += `  Öğrenme Çıktıları:\n`;
                        course.details.outcomes.forEach((o, idx) => {
                            contentObj += `    ${idx + 1}. ${o}\n`;
                        });
                    }
                    if (course.details.weeklyPlan && course.details.weeklyPlan.length > 0) {
                        contentObj += `  Haftalık Plan:\n`;
                        course.details.weeklyPlan.forEach(w => {
                            contentObj += `    ${w}\n`;
                        });
                    }
                    if (course.details.evaluation) {
                        contentObj += `  Değerlendirme: ${course.details.evaluation}\n`;
                    }
                    if (course.details.resources) {
                        contentObj += `  Kaynaklar: ${course.details.resources}\n`;
                    }
                }
            }
        }

        contentObj += `\nNot: Öğrenci bu bölümün müfredatını, ders çalışma programını veya ders listesini sorduğunda bu verideki tabloyu listeleyebilirsin.`;

        kb.push({
            filename: filename,
            content: contentObj,
            source: 'bologna_scraper'
        });
        addedDocs++;
    }

    fs.writeFileSync(kbPath, JSON.stringify(kb, null, 2), 'utf-8');
    console.log(`Successfully ingested ${addedDocs} curriculum documents into the Knowledge Base.`);
    console.log(`Total documents in Knowledge Base: ${kb.length}`);
}

main().catch(err => {
    console.error('Ingestion failed:', err);
});
