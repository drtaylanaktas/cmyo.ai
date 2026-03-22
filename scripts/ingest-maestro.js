const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });
const mammoth = require('mammoth');

async function ingest() {
    console.log("Starting ingestion for FR-585_Kan_t_Formu (4).docx...");

    const filePath = path.join(__dirname, '../../ÇMYO.AI Maestro Files/FR-585_Kan_t_Formu (4).docx');
    
    if (!fs.existsSync(filePath)) {
        console.error("File not found at:", filePath);
        return;
    }

    // 1. Parse DOCX text using Mammoth
    console.log("Parsing Word document...");
    const buffer = fs.readFileSync(filePath);
    const result = await mammoth.extractRawText({ buffer });
    const content = result.value.trim();

    if (!content) {
        console.error("Could not extract any text from the document!");
        return;
    }

    console.log(`Successfully extracted ${content.length} characters.`);

    // 2. Connect to Postgres and Insert
    console.log("Connecting to Vercel Postgres...");
    const pool = new Pool({
        connectionString: process.env.POSTGRES_URL + "?sslmode=require",
    });

    try {
        const filename = "FR-585_Kan_t_Formu (4).docx";
        const category = "kalite-formu";
        const priority = 10;

        await pool.query(
            `INSERT INTO knowledge_documents (filename, content, category, priority) 
             VALUES ($1, $2, $3, $4)`,
            [filename, content, category, priority]
        );

        console.log(`SUCCESS! Document ${filename} has been saved to the database.`);
        console.log(`Content Preview: \n`, content.substring(0, 100) + '...');
    } catch (e) {
        console.error("Database Error:", e);
    } finally {
        await pool.end();
    }
}
ingest();
