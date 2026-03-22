const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function run() {
    const pool = new Pool({ connectionString: process.env.POSTGRES_URL + "?sslmode=require" });
    try {
        console.log("Adding file_url column...");
        await pool.query(`ALTER TABLE knowledge_documents ADD COLUMN IF NOT EXISTS file_url VARCHAR(1024);`);
        console.log("Successfully added file_url.");
    } catch(e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
run();
