/**
 * scrape-website.js
 * Çiçekdağı MYO web sitesini (cmyo.ahievran.edu.tr) Playwright ile tarar.
 * Sonucu src/data/website_data.json dosyasına kaydeder.
 *
 * Çalıştırma:
 *   node scripts/scrape-website.js
 *   node scripts/scrape-website.js --test   (sadece ilk 10 sayfa)
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://cicekdagimyo.ahievran.edu.tr';
const OUTPUT_FILE = path.join(__dirname, '..', 'src', 'data', 'website_data.json');
const MAX_PAGES = 500;
const DELAY_MS = 600;
const TEST_MODE = process.argv.includes('--test');
const TEST_LIMIT = 15;

// ----- Kategori & Öncelik -----
function categorize(url) {
    const p = url.replace(BASE_URL, '').toLowerCase();
    if (p === '/' || p === '') return { category: 'web-genel', priority: 100 };
    if (/duyuru|haber|ilan|anons/.test(p)) return { category: 'web-duyuru', priority: 80 };
    if (/kadro|ogretim|akademik|takvim|personel/.test(p)) return { category: 'web-akademik', priority: 90 };
    if (/bolum|program|birim|department/.test(p)) return { category: 'web-bolum', priority: 70 };
    if (/iletisim|ulasim|adres|contact/.test(p)) return { category: 'web-iletisim', priority: 60 };
    return { category: 'web-genel', priority: 50 };
}

// ----- URL → Dosya adı -----
function urlToFilename(url, category) {
    const slug = url
        .replace(BASE_URL, '')
        .replace(/^\/+|\/+$/g, '')
        .replace(/[/?&=#]+/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 80)
        .toUpperCase() || 'ANASAYFA';

    const prefix = {
        'web-duyuru': 'WEB_DUYURU',
        'web-bolum': 'WEB_BOLUM',
        'web-akademik': 'WEB_AKADEMIK',
        'web-iletisim': 'WEB_ILETISIM',
        'web-genel': 'WEB_GENEL',
    }[category] || 'WEB_GENEL';

    return slug === 'ANASAYFA' ? 'WEB_ANASAYFA.txt' : `${prefix}_${slug}.txt`;
}

// ----- Tablo → Markdown -----
function tableToMarkdown(rows) {
    if (!rows || rows.length === 0) return '';
    const lines = [];
    rows.forEach((row, i) => {
        lines.push('| ' + row.join(' | ') + ' |');
        if (i === 0) lines.push('| ' + row.map(() => '---').join(' | ') + ' |');
    });
    return lines.join('\n');
}

// ----- Sayfa içeriği çıkar -----
async function extractContent(page, url) {
    return await page.evaluate(() => {
        // Menü, header, footer, sidebar kaldır (içerik elementleri dahil etme)
        const removeSelectors = [
            'header', 'footer', 'nav', '.navbar', '.sidebar', '.menu',
            '.breadcrumb', '.pagination', 'script', 'style', 'noscript',
            '.social-media', '.footer-area', '.header-area', '#header', '#footer',
            '.cookie', '.popup', '.modal', '.ad', '.banner', '.top-bar',
            '.mobile-menu', '.overlay', '.back-to-top', '.scroll-top',
        ];
        removeSelectors.forEach(sel => {
            document.querySelectorAll(sel).forEach(el => el.remove());
        });

        // Başlık — birden fazla kaynaktan dene
        const title =
            document.querySelector('h1')?.innerText?.trim() ||
            document.querySelector('h2')?.innerText?.trim() ||
            document.querySelector('.page-title')?.innerText?.trim() ||
            document.title?.replace(/\s*[-|–]\s*.*$/, '').trim() ||
            'Başlıksız Sayfa';

        // Tablolar → markdown (önce çıkar, sonra body text'ten kaldır)
        const tables = [];
        document.querySelectorAll('table').forEach(table => {
            const rows = [];
            table.querySelectorAll('tr').forEach(tr => {
                const cells = [];
                tr.querySelectorAll('th, td').forEach(td => {
                    cells.push(td.innerText.replace(/\s+/g, ' ').trim());
                });
                if (cells.some(c => c)) rows.push(cells);
            });
            if (rows.length > 0) {
                const lines = [];
                rows.forEach((row, i) => {
                    lines.push('| ' + row.join(' | ') + ' |');
                    if (i === 0) lines.push('| ' + row.map(() => '---').join(' | ') + ' |');
                });
                tables.push(lines.join('\n'));
                table.remove();
            }
        });

        // PDF/DOCX/XLSX linkleri topla
        const fileLinks = [];
        document.querySelectorAll('a[href]').forEach(a => {
            const href = a.href || '';
            if (/\.(pdf|docx|doc|xlsx|xls)(\?|$)/i.test(href)) {
                fileLinks.push(`- ${a.innerText.trim() || 'Dosya'}: ${href}`);
            }
        });

        // Ana metin: en büyük içerik alanını bul
        // Öncelikli selektörler dene, yoksa body'nin tamamını al
        const mainEl =
            document.querySelector('.icerik') ||
            document.querySelector('main') ||
            document.querySelector('#content') ||
            document.querySelector('.content-area') ||
            document.querySelector('.page-content') ||
            document.querySelector('.entry-content') ||
            document.body;

        const bodyText = (mainEl?.innerText || '')
            .replace(/\t/g, ' ')
            .replace(/[ ]{3,}/g, ' ')
            .replace(/\n{4,}/g, '\n\n\n')
            .trim();

        return { title, bodyText, tables, fileLinks };
    });
}

// ----- İç linkleri topla -----
async function collectLinks(page) {
    return await page.evaluate((baseUrl) => {
        const links = new Set();
        document.querySelectorAll('a[href]').forEach(a => {
            try {
                const url = new URL(a.href);
                if (url.hostname === new URL(baseUrl).hostname) {
                    // Fragment, query string temizle (sayfalama hariç)
                    const clean = url.origin + url.pathname;
                    // Binary dosyaları atla
                    if (!/\.(pdf|docx|doc|xlsx|xls|jpg|jpeg|png|gif|zip|rar|mp4|mp3)$/i.test(clean)) {
                        links.add(clean);
                    }
                }
            } catch (_) {}
        });
        return [...links];
    }, BASE_URL);
}

// ----- Ana kazıyıcı -----
async function scrape() {
    console.log(`\n🌐 Çiçekdağı MYO Web Kazıyıcı`);
    console.log(`📍 Hedef: ${BASE_URL}`);
    if (TEST_MODE) console.log(`🧪 TEST MODU: ilk ${TEST_LIMIT} sayfa`);
    console.log('');

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (compatible; CMYO-AI-Bot/1.0; +https://cmyoai.com)',
        locale: 'tr-TR',
    });
    const page = await context.newPage();

    const visited = new Set();
    const queue = [{ url: BASE_URL + '/', depth: 0 }];
    const results = [];
    let errorCount = 0;

    while (queue.length > 0 && visited.size < MAX_PAGES) {
        if (TEST_MODE && visited.size >= TEST_LIMIT) break;

        const { url, depth } = queue.shift();
        const normalUrl = url.replace(/\/$/, '') || BASE_URL;

        if (visited.has(normalUrl)) continue;
        visited.add(normalUrl);

        // Derinlik limiti
        if (depth > 4) continue;

        process.stdout.write(`[${visited.size}/${MAX_PAGES}] ${depth > 0 ? '  '.repeat(depth) : ''}${normalUrl.replace(BASE_URL, '') || '/'} ... `);

        try {
            await page.goto(normalUrl, { waitUntil: 'networkidle', timeout: 20000 });
            await page.waitForTimeout(500);

            // Linkleri ÖNCE topla (nav kaldırılmadan, tüm menü linkleri dahil)
            const links = depth < 4 ? await collectLinks(page) : [];

            const { title, bodyText, tables, fileLinks } = await extractContent(page, normalUrl);

            // Çok kısa içerikleri atla (navigasyon sayfaları vs.)
            if (bodyText.length < 80) {
                console.log(`atlandı (içerik çok kısa: ${bodyText.length} karakter)`);
                // Linkleri yine de kuyruğa ekle (menü alt sayfalarına ulaşmak için)
                for (const link of links) {
                    const normLink = link.replace(/\/$/, '');
                    if (!visited.has(normLink)) {
                        queue.push({ url: link, depth: depth + 1 });
                    }
                }
                continue;
            }

            const { category, priority } = categorize(normalUrl);
            const filename = urlToFilename(normalUrl, category);

            // Belge içeriği oluştur
            const scrapedAt = new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
            let content = `Kaynak URL: ${normalUrl}\nSayfa Başlığı: ${title}\nKategori: ${category}\nKazıma Tarihi: ${scrapedAt}\n`;
            content += '---\n\n';
            content += bodyText;

            if (tables.length > 0) {
                content += '\n\n--- TABLOLAR ---\n\n';
                content += tables.join('\n\n');
            }

            if (fileLinks.length > 0) {
                content += '\n\n--- BELGELER VE DOSYALAR ---\n\n';
                content += fileLinks.join('\n');
            }

            // Null byte temizle
            content = content.replace(/\0/g, '');

            results.push({ url: normalUrl, filename, category, priority, title, content });
            console.log(`✓ "${title}" (${category}, ${content.length} karakter)`);

            // Linkleri kuyruğa ekle
            for (const link of links) {
                const normLink = link.replace(/\/$/, '');
                if (!visited.has(normLink)) {
                    queue.push({ url: link, depth: depth + 1 });
                }
            }

        } catch (err) {
            console.log(`✗ HATA: ${err.message}`);
            errorCount++;
        }

        // Kibarca bekle
        await new Promise(r => setTimeout(r, DELAY_MS));
    }

    await browser.close();

    // Kaydet
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2), 'utf8');

    console.log('\n' + '='.repeat(60));
    console.log(`✅ Kazıma tamamlandı!`);
    console.log(`📄 Toplam sayfa: ${results.length}`);
    console.log(`❌ Hata: ${errorCount}`);
    console.log(`💾 Kaydedildi: ${OUTPUT_FILE}`);
    console.log('');
    console.log('Kategoriler:');
    const cats = {};
    results.forEach(r => { cats[r.category] = (cats[r.category] || 0) + 1; });
    Object.entries(cats).sort((a, b) => b[1] - a[1]).forEach(([cat, count]) => {
        console.log(`  ${cat}: ${count} sayfa`);
    });
    console.log('\nSonraki adım: node scripts/ingest-website.js');
}

scrape().catch(err => {
    console.error('Kazıyıcı çöktü:', err);
    process.exit(1);
});
