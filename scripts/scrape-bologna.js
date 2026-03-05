const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://obs.ahievran.edu.tr/oibs/bologna';
const MAX_DELAY_MS = 2000;
const MIN_DELAY_MS = 500;

// Helper to wait to avoid overwhelming the server
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchHtml(url) {
    console.log(`Fetching: ${url}`);

    // Create an AbortController for a 15-second timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
        const response = await fetch(url, {
            method: 'GET',
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            }
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            console.error(`HTTP Error: ${response.status} ${response.statusText} on ${url}`);
            return null;
        }

        return await response.text();
    } catch (error) {
        clearTimeout(timeoutId);
        console.error(`Error fetching URL: ${url} - ${error.name}: ${error.message}`);
        return null;
    }
}

async function scrapeAcademicUnits(type) {
    console.log(`\n=== Scraping Academic Unit Type: ${type.toUpperCase()} ===`);
    // Example: https://obs.ahievran.edu.tr/oibs/bologna/unitSelection.aspx?type=lis&lang=tr
    const url = `${BASE_URL}/unitSelection.aspx?type=${type}&lang=tr`;
    const html = await fetchHtml(url);
    if (!html) return [];

    const $ = cheerio.load(html);
    const units = [];

    $('.panel').each((i, panel) => {
        // Skip wrapper panels that contain other panels to avoid duplicating and concatenating all faculties
        if ($(panel).find('.panel').length > 0) return;

        let facultyName = $(panel).find('.panel-title > a').clone().children().remove().end().text().trim();
        // Fallback for faculty name: get all text and take only the first line
        if (!facultyName || facultyName === "") {
            facultyName = $(panel).find('.panel-title').text().trim().split('\n')[0].trim();
        }

        // Find all departments within this faculty
        $(panel).find('.list-group-item a').each((j, item) => {
            const departmentName = $(item).text().trim();
            const href = $(item).attr('href'); // index.aspx?lang=tr&curOp=showPac&curUnit=20&curSunit=8141

            // Parse URL parameters
            const urlParams = new URLSearchParams(href.split('?')[1]);
            const curUnit = urlParams.get('curUnit');
            const curSunit = urlParams.get('curSunit');

            if (curUnit && curSunit) {
                units.push({
                    type: type,
                    faculty: facultyName || "UNSPECIFIED_FACULTY",
                    department: departmentName,
                    curUnit,
                    curSunit,
                    link: `${BASE_URL}/${href}`
                });
            }
        });
    });

    console.log(`Found ${units.length} departments for ${type}.`);
    return units;
}

// Scrape a specific department's curriculum
// Example URL: https://obs.ahievran.edu.tr/oibs/bologna/progCourses.aspx?lang=tr&curSunit=8141
async function scrapeDepartmentCourses(curSunit) {
    const url = `${BASE_URL}/progCourses.aspx?lang=tr&curSunit=${curSunit}`;

    // Polite delay (reduced to process 478 departments faster)
    await new Promise(r => setTimeout(r, 150 + Math.random() * 150));

    const html = await fetchHtml(url);
    if (!html) return [];

    const $ = cheerio.load(html);
    const semestersObj = {};
    let currentSemester = "Genel";

    $('#grdBolognaDersler tr').each((i, row) => {
        const bgColor = $(row).attr('bgcolor');
        const isSemesterHeader = (bgColor && bgColor.toLowerCase() === '#f2f2f2') || $(row).text().includes('Yarıyıl Ders Planı');
        const isColumnHeader = (bgColor && bgColor.toLowerCase() === '#f7f7f7');

        if (isSemesterHeader) {
            let semText = $(row).find('span[id^="grdBolognaDersler_lblDersAd_"]').text().trim();
            if (!semText) semText = $(row).text().replace(/[\r\n\t]+/g, ' ').trim();
            if (semText) currentSemester = semText;
            if (!semestersObj[currentSemester]) semestersObj[currentSemester] = [];
        } else if (!isColumnHeader) {
            const codeText = $(row).find('a[id^="grdBolognaDersler_btnDersKod_"]').text().trim() || $(row).find('span[id^="grdBolognaDersler_lblDersKod_"]').text().trim();
            const nameText = $(row).find('span[id^="grdBolognaDersler_lblDersAd_"]').text().trim() || $(row).find('td:nth-child(3)').text().trim();
            const tul = $(row).find('span[id^="grdBolognaDersler_Label3_"]').text().trim() || $(row).find('td:nth-child(4)').text().trim();
            const isMandatory = $(row).find('span[id^="grdBolognaDersler_Label5_"]').text().trim() || $(row).find('td:nth-child(5)').text().trim();
            const ects = $(row).find('span[id^="grdBolognaDersler_lblAKTS_"]').text().trim() || $(row).find('td:nth-child(6)').text().trim();

            if (codeText && nameText && nameText !== "Toplam AKTS" && isMandatory !== "Toplam AKTS" && codeText !== "Ders Kodu") {
                let theory = '0', practice = '0', lab = '0';
                if (tul.includes('+')) {
                    const parts = tul.split('+');
                    theory = parts[0] || '0';
                    practice = parts[1] || '0';
                    lab = parts[2] || '0';
                }

                if (!semestersObj[currentSemester]) semestersObj[currentSemester] = [];
                semestersObj[currentSemester].push({
                    code: codeText,
                    name: nameText,
                    theory,
                    practice,
                    lab,
                    type: isMandatory || 'Zorunlu',
                    ects
                });
            }
        }
    });

    const semesters = Object.keys(semestersObj).map(key => ({
        semester: key,
        courses: semestersObj[key]
    }));

    return semesters;
}

async function main() {
    const args = process.argv.slice(2);
    const isTest = args.includes('--test');

    const types = ['myo', 'lis', 'yls', 'dok'];
    let allDepartments = [];

    console.log('Fetching university academic units structure...');
    for (const type of types) {
        const units = await scrapeAcademicUnits(type);
        allDepartments = allDepartments.concat(units);
    }

    // Deduplicate departments by curSunit to avoid multiple scraping of the same department
    const uniqueDepartmentsMap = new Map();
    allDepartments.forEach(dept => {
        if (!uniqueDepartmentsMap.has(dept.curSunit)) {
            uniqueDepartmentsMap.set(dept.curSunit, dept);
        }
    });

    const outputData = [];

    // The --test argument bypass is removed, always run full scrape
    const departmentsToScrape = Array.from(uniqueDepartmentsMap.values());

    console.log(`\nStarting deep scrape of ${departmentsToScrape.length} departments. This might take a while...`);

    let count = 1;
    for (const dept of departmentsToScrape) {
        console.log(`[${count}/${departmentsToScrape.length}] Scraping: ${dept.faculty} -> ${dept.department}`);
        count++;

        const curriculum = await scrapeDepartmentCourses(dept.curSunit);

        outputData.push({
            ...dept,
            curriculum
        });
    }

    const outputFilePath = path.join(process.cwd(), 'src', 'data', 'bologna_data.json');
    fs.writeFileSync(outputFilePath, JSON.stringify(outputData, null, 2), 'utf8');

    console.log(`\n✅ Scraping complete. Data saved to ${outputFilePath}`);
}

main().catch(console.error);
