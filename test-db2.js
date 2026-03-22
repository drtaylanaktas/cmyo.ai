const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function check() {
    const pool = new Pool({
        connectionString: process.env.POSTGRES_URL + "?sslmode=require",
    });
    try {
        const { rows } = await pool.query(`SELECT id, filename FROM knowledge_documents WHERE filename ILIKE '%585%'`);
        console.log("DB Rows for 585:", rows);
        const { rows: allRows } = await pool.query(`SELECT filename FROM knowledge_documents ORDER BY created_at DESC LIMIT 5`);
        console.log("Latest 5 docs:", allRows);
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
check();
