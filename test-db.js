require('dotenv').config({ path: '.env.local' });
const { sql } = require('@vercel/postgres');

async function check() {
    try {
        const { rows } = await sql`SELECT id, filename FROM knowledge_documents WHERE filename ILIKE '%585%';`;
        console.log("Found:", rows);
    } catch (e) {
        console.error(e);
    }
}
check();
