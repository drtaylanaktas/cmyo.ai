const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function check() {
    const pool = new Pool({ connectionString: process.env.POSTGRES_URL + "?sslmode=require" });
    try {
        const { rows } = await pool.query(`
            SELECT role, content, created_at 
            FROM messages 
            ORDER BY created_at DESC 
            LIMIT 10
        `);
        console.log("LAST 10 CHAT MESSAGES IN PRODUCTION:");
        rows.reverse().forEach(r => console.log(`[${r.role.toUpperCase()}] ${r.content}`));
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
check();
