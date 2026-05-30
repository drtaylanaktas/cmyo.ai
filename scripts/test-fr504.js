const fs = require('fs');
const dotenv = require('dotenv');
const path = require('path');

// Load env
const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
for (const k in envConfig) {
  process.env[k] = envConfig[k];
}

async function test() {
    console.log('--- Testing generate-file logic ---');
    const filename = 'FR-504 Sınav Soru - Cevap Kağıdı.docx';
    const data = {}; // Empty data for testing
    
    try {
        const { sql } = require('@vercel/postgres');
        const targetFilename = filename.toLowerCase().replace('.docx', '').replace('.pdf', '');
        console.log(`Searching for: ${targetFilename}`);
        
        const dbQuery = await sql`
            SELECT filename, file_url FROM knowledge_documents 
            WHERE LOWER(filename) LIKE ${'%' + targetFilename + '%'}
            LIMIT 1
        `;
        
        console.log('DB Results:', dbQuery.rows);
        
        if (dbQuery.rows.length > 0 && dbQuery.rows[0].file_url) {
            console.log(`Attempting to fetch: ${dbQuery.rows[0].file_url}`);
            const response = await fetch(dbQuery.rows[0].file_url);
            console.log(`Fetch status: ${response.status} ${response.statusText}`);
            if (response.ok) {
                console.log('SUCCESS: File exists and is reachable.');
            } else {
                console.log('FAILURE: URL exists but fetch failed.');
            }
        } else {
            console.log('FAILURE: document not found in DB or missing file_url.');
        }
    } catch (err) {
        console.error('ERROR during test:', err);
    }
}

test();
