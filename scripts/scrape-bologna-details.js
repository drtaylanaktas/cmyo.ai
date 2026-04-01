/**
 * scrape-bologna-details.js
 *
 * Mevcut bologna_data.json'daki her program için her ders kodu butonuna tıklayarak
 * ders detaylarını (açıklama, öğrenme çıktıları, haftalık plan, kaynaklar) kazır.
 *
 * Kullanım:
 *   node scripts/scrape-bologna-details.js           # Tüm üniversite
 *   node scripts/scrape-bologna-details.js --cmyo    # Sadece Çiçekdağı MYO
 *   node scripts/scrape-bologna-details.js --test    # İlk 2 program (test)
 *
 * Çıktı: src/data/bologna_data.json (mevcut dosyayı günceller, ders detaylarını ekler)
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://obs.ahievran.edu.tr/oibs/bologna';
const DATA_PATH = path.join(__dirname, '../src/data/bologna_data.json');
const COURSE_DELAY_MS = 400;   // Her ders arasında bekleme (ms)
const PAGE_DELAY_MS = 800;     // Her program sayfası arasında bekleme (ms)

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Bir programın ders detay sayfasını Playwright ile açar,
 * her ders koduna tıklar ve detayları parse eder.
 */
async function scrapeDetailsForProgram(page, curSunit) {
    const url = `${BASE_URL}/progCourses.aspx?lang=tr&curSunit=${curSunit}`;

    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await sleep(500);
    } catch (e) {
        console.error(`  Sayfa yüklenemedi: ${url} — ${e.message}`);
        return {};
    }

    // Tüm ders kodu butonlarını bul
    const courseButtons = await page.$$('a[id^="grdBolognaDersler_btnDersKod_"]');

    if (courseButtons.length === 0) {
        return {};
    }

    const details = {}; // { dersKodu: { description, outcomes, weeklyPlan, evaluation, resources } }

    for (let i = 0; i < courseButtons.length; i++) {
        let courseCode = '';
        try {
            courseCode = await courseButtons[i].textContent();
            courseCode = (courseCode || '').trim();

            if (!courseCode || courseCode === 'Ders Kodu') continue;

            // Butona tıkla
            await courseButtons[i].click();
            await sleep(COURSE_DELAY_MS);

            // Sayfa değişti mi? Postback sonrası içeriği parse et
            const detail = await parseCourseDetailPage(page, courseCode);

            if (detail) {
                details[courseCode] = detail;
            }

            // Geri dön (back navigation veya reload)
            await page.goBack({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
            await sleep(300);

            // Sayfanın doğru şekilde yüklendiğinden emin ol
            const stillOnCoursePage = await page.$$('a[id^="grdBolognaDersler_btnDersKod_"]');
            if (stillOnCoursePage.length === 0) {
                // Tekrar yükle
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
                await sleep(500);
            }

            // Butonları tekrar al (DOM yenilendi)
            const refreshedButtons = await page.$$('a[id^="grdBolognaDersler_btnDersKod_"]');
            if (refreshedButtons[i + 1]) {
                // Bir sonraki iteration için güncellendi
            }

        } catch (err) {
            console.error(`  Ders detayı alınamadı (${courseCode}): ${err.message}`);
            // Hatada sayfayı yenile ve devam et
            try {
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
                await sleep(500);
            } catch (_) {}
        }
    }

    return details;
}

/**
 * Ders detay sayfasının içeriğini parse eder.
 * ASP.NET postback sonrası sayfa içeriği değişmiş olacak.
 */
async function parseCourseDetailPage(page, courseCode) {
    try {
        // Farklı olası container elementlerini dene
        const content = await page.evaluate(() => {
            const result = {
                description: '',
                outcomes: [],
                weeklyPlan: [],
                evaluation: '',
                resources: '',
            };

            // Ders açıklaması — genellikle "Dersin İçeriği" veya "Ders Tanımı" başlığının altında
            const allText = document.body.innerText;
            if (!allText || allText.length < 100) return null;

            // Açıklama: "Dersin İçeriği" veya "Ders Tanımı" bölümü
            const descMatch = allText.match(/(?:Dersin İçeriği|Ders Tanımı|Course Content)[:\s]*\n([\s\S]{20,1000}?)(?:\n[A-ZÇĞİÖŞÜa-zçğışöşü]+\s*(?:Çıktı|Kazanım|Değerlendirme|Haftalık|Kaynak|Week))/i);
            if (descMatch) {
                result.description = descMatch[1].trim().replace(/\s+/g, ' ').substring(0, 800);
            }

            // Öğrenme çıktıları — "Öğrenme Çıktıları" / "Dersin Öğrenme Çıktıları"
            const outcomesSection = allText.match(/(?:Dersin Öğrenme Çıktıları|Öğrenme Çıktıları|Learning Outcomes)[:\s]*\n([\s\S]{20,2000}?)(?:\n[A-ZÇĞİÖŞÜ].*?(?:Değerlendirme|Haftalık|Kaynak|İçerik|Week|Assess))/i);
            if (outcomesSection) {
                const outcomesText = outcomesSection[1];
                const outcomeLines = outcomesText.split('\n')
                    .map(l => l.replace(/^\s*\d+[.)\-]\s*/, '').trim())
                    .filter(l => l.length > 10);
                result.outcomes = outcomeLines.slice(0, 12);
            }

            // Değerlendirme yöntemi
            const evalMatch = allText.match(/(?:Değerlendirme|Assessment)[:\s]*\n([\s\S]{10,400}?)(?:\n[A-ZÇĞİÖŞÜ].*?(?:Kaynak|Haftalık|Week|Ref))/i);
            if (evalMatch) {
                result.evaluation = evalMatch[1].trim().replace(/\s+/g, ' ').substring(0, 400);
            }

            // Kaynaklar
            const refMatch = allText.match(/(?:Kaynaklar|Ders Kitabı|Önerilen Kaynaklar|References?)[:\s]*\n([\s\S]{10,600}?)(?:\n[A-ZÇĞİÖŞÜ]|$)/i);
            if (refMatch) {
                result.resources = refMatch[1].trim().replace(/\s+/g, ' ').substring(0, 500);
            }

            // Haftalık plan
            const weeklyRows = [];
            const rows = document.querySelectorAll('table tr');
            rows.forEach(row => {
                const cells = Array.from(row.querySelectorAll('td'));
                if (cells.length >= 2) {
                    const firstCell = cells[0]?.textContent?.trim() || '';
                    if (/^\d{1,2}$/.test(firstCell) && parseInt(firstCell) <= 16) {
                        const topic = cells[1]?.textContent?.trim() || '';
                        if (topic.length > 3) {
                            weeklyRows.push(`Hafta ${firstCell}: ${topic}`);
                        }
                    }
                }
            });
            if (weeklyRows.length > 0) {
                result.weeklyPlan = weeklyRows.slice(0, 16);
            }

            // En az bir bilgi varsa döndür
            if (result.description || result.outcomes.length > 0 || result.weeklyPlan.length > 0) {
                return result;
            }
            return null;
        });

        return content;
    } catch (e) {
        return null;
    }
}

async function main() {
    const args = process.argv.slice(2);
    const onlyCmyo = args.includes('--cmyo');
    const testMode = args.includes('--test');

    // Mevcut veriyi oku
    if (!fs.existsSync(DATA_PATH)) {
        console.error(`bologna_data.json bulunamadı: ${DATA_PATH}`);
        console.error('Önce node scripts/scrape-bologna.js çalıştırın.');
        process.exit(1);
    }

    const bologna = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));

    let programs = bologna;
    if (onlyCmyo) {
        programs = bologna.filter(p => p.faculty && p.faculty.toUpperCase().includes('ÇİÇEKDAĞI'));
        console.log(`Sadece Çiçekdağı MYO programları: ${programs.length}`);
    }
    if (testMode) {
        programs = programs.slice(0, 2);
        console.log('Test modu: sadece ilk 2 program');
    }

    const withCurriculum = programs.filter(p => p.curriculum && p.curriculum.length > 0);
    console.log(`Toplam işlenecek program: ${withCurriculum.length}`);

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    // Bot tespitini azalt
    await page.setExtraHTTPHeaders({
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'tr-TR,tr;q=0.9',
    });

    let totalCoursesProcessed = 0;
    let totalDetailsFound = 0;

    for (let i = 0; i < withCurriculum.length; i++) {
        const program = withCurriculum[i];
        console.log(`\n[${i + 1}/${withCurriculum.length}] ${program.faculty} → ${program.department}`);

        // Zaten detayları varsa atla
        const hasDetails = program.curriculum.some(sem =>
            sem.courses.some(c => c.details && (c.details.description || c.details.outcomes?.length > 0))
        );
        if (hasDetails) {
            console.log('  (detaylar zaten var, atlanıyor)');
            continue;
        }

        const courseDetails = await scrapeDetailsForProgram(page, program.curSunit);
        const foundCount = Object.keys(courseDetails).length;
        console.log(`  ${foundCount} ders detayı bulundu`);

        if (foundCount > 0) {
            // Detayları ilgili ders objelerine ekle
            for (const sem of program.curriculum) {
                for (const course of sem.courses) {
                    if (courseDetails[course.code]) {
                        course.details = courseDetails[course.code];
                        totalDetailsFound++;
                    }
                }
            }
        }

        totalCoursesProcessed += program.curriculum.reduce((sum, sem) => sum + sem.courses.length, 0);

        // Her 10 programda bir kaydet (ilerlemeyi koru)
        if ((i + 1) % 10 === 0) {
            fs.writeFileSync(DATA_PATH, JSON.stringify(bologna, null, 2), 'utf-8');
            console.log(`  (ara kayıt yapıldı: ${i + 1}/${withCurriculum.length} program)`);
        }

        await sleep(PAGE_DELAY_MS);
    }

    await browser.close();

    // Son kayıt
    fs.writeFileSync(DATA_PATH, JSON.stringify(bologna, null, 2), 'utf-8');

    console.log(`\n✅ Tamamlandı!`);
    console.log(`   İşlenen program: ${withCurriculum.length}`);
    console.log(`   İşlenen ders: ${totalCoursesProcessed}`);
    console.log(`   Detay bulunan ders: ${totalDetailsFound}`);
    console.log(`   Güncellenen dosya: ${DATA_PATH}`);
    console.log(`\nSonraki adımlar:`);
    console.log(`   node scripts/ingest-bologna.js`);
    console.log(`   node scripts/migrate-knowledge.js`);
}

main().catch(err => {
    console.error('Scraper hatası:', err);
    process.exit(1);
});
