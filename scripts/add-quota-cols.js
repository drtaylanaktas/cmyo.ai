const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function run() {
    const pool = new Pool({ connectionString: process.env.POSTGRES_URL + "?sslmode=require" });
    try {
        console.log("Adding quota columns to users table...");
        await pool.query(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS daily_message_count INTEGER DEFAULT 0,
            ADD COLUMN IF NOT EXISTS last_message_date TIMESTAMP WITH TIME ZONE;
        `);
        console.log("Successfully added quota columns.");
    } catch(e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
run();
