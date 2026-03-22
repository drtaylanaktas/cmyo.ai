const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function check() {
    const pool = new Pool({
        connectionString: process.env.POSTGRES_URL + "?sslmode=require",
    });
    try {
        const { rows } = await pool.query('SELECT id, filename, created_at FROM knowledge_documents ORDER BY created_at DESC LIMIT 10;');
        console.log("LAST 10 DOCUMENTS UPLOADED:");
        rows.forEach(r => console.log(`- ID: ${r.id} | Filename: ${r.filename} | Created: ${r.created_at}`));
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
check();
