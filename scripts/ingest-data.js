const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');
const XLSX = require('xlsx');

const dataDir = path.join(__dirname, '../src/data');
const outputFile = path.join(dataDir, 'knowledge_base.json');

async function extractTextFromDocx(filePath) {
    try {
        const result = await mammoth.extractRawText({ path: filePath });
        return result.value;
    } catch (error) {
        console.error(`Error reading DOCX ${filePath}:`, error);
        return '';
    }
}

function extractTextFromXlsx(filePath) {
    try {
        const workbook = XLSX.readFile(filePath);
        let text = '';
        workbook.SheetNames.forEach(sheetName => {
            const sheet = workbook.Sheets[sheetName];
            text += XLSX.utils.sheet_to_txt(sheet);
        });
        return text;
    } catch (error) {
        console.error(`Error reading XLSX ${filePath}:`, error);
        return '';
    }
}

async function main() {
    const files = fs.readdirSync(dataDir);
    const documents = [];

    console.log(`Found ${files.length} files in ${dataDir}`);

    for (const file of files) {
        if (file === 'knowledge_base.json') continue;

        const filePath = path.join(dataDir, file);
        const ext = path.extname(file).toLowerCase();
        let content = '';

        if (ext === '.docx') {
            content = await extractTextFromDocx(filePath);
        } else if (ext === '.xlsx') {
            content = extractTextFromXlsx(filePath);
        } else {
            console.log(`Skipping unsupported file type: ${file}`);
            continue;
        }

        if (content.trim()) {
            documents.push({
                filename: file,
                content: content.trim()
            });
            console.log(`Indexed: ${file}`);
        }
    }

    fs.writeFileSync(outputFile, JSON.stringify(documents, null, 2));
    console.log(`\nSuccessfully created knowledge base with ${documents.length} documents.`);
}

main();
