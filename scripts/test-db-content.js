const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function check() {
    const pool = new Pool({
        connectionString: process.env.POSTGRES_URL + "?sslmode=require",
    });
    try {
        const { rows } = await pool.query('SELECT filename, length(content) as content_length, content FROM knowledge_documents WHERE id = 709;');
        console.log("Document 709:", rows[0].filename, "Length:", rows[0].content_length);
        console.log("Snippet:", rows[0].content ? rows[0].content.substring(0, 500) : "EMPTY");
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
check();
