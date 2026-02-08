const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');
const XLSX = require('xlsx');

const DOCUMENTS_DIR = path.resolve(__dirname, '../../ÇMYO.AI Maestro Files');
const OUTPUT_FILE = path.resolve(__dirname, '../src/data/knowledge_base.json');
const OUTPUT_DIR = path.dirname(OUTPUT_FILE);

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function parseDocx(filePath) {
    try {
        const result = await mammoth.extractRawText({ path: filePath });
        return result.value;
    } catch (error) {
        console.error(`Error parsing DOCX ${filePath}:`, error);
        return null;
    }
}

function parseXlsx(filePath) {
    try {
        const workbook = XLSX.readFile(filePath);
        let text = '';
        workbook.SheetNames.forEach(sheetName => {
            const sheet = workbook.Sheets[sheetName];
            text += `Sheet: ${sheetName}\n`;
            text += XLSX.utils.sheet_to_txt(sheet);
        });
        return text;
    } catch (error) {
        console.error(`Error parsing XLSX ${filePath}:`, error);
        return null;
    }
}

async function ingest() {
    console.log(`Scanning directory: ${DOCUMENTS_DIR}`);
    if (!fs.existsSync(DOCUMENTS_DIR)) {
        console.error('Documents directory not found!');
        return;
    }

    const files = fs.readdirSync(DOCUMENTS_DIR);
    const knowledgeBase = [];

    for (const file of files) {
        if (file.startsWith('~$') || file.startsWith('.')) continue; // Skip temp/hidden files

        const filePath = path.join(DOCUMENTS_DIR, file);
        const stats = fs.statSync(filePath);

        if (stats.isDirectory()) continue;

        console.log(`Processing ${file}...`);
        let content = '';
        let type = 'unknown';

        if (file.endsWith('.docx')) {
            type = 'docx';
            content = await parseDocx(filePath);
        } else if (file.endsWith('.xlsx')) {
            type = 'xlsx';
            content = parseXlsx(filePath); // Sync
        } else if (file.endsWith('.pdf')) {
            type = 'pdf';
            content = '[PDF Content extraction skipped - requires pdf-parse]'; // Placeholder
        } else {
            continue;
        }

        if (content) {
            knowledgeBase.push({
                filename: file,
                path: filePath,
                type: type,
                content: content.substring(0, 10000) // Limit content length if needed
            });
        }
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(knowledgeBase, null, 2));
    console.log(`Ingestion complete! ${knowledgeBase.length} documents indexed to ${OUTPUT_FILE}`);
}

ingest();
