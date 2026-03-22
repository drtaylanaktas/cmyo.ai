const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function run() {
    const pool = new Pool({ connectionString: process.env.POSTGRES_URL + "?sslmode=require" });
    try {
        const { rows: knowledgeBase } = await pool.query('SELECT filename, content FROM knowledge_documents');
        const queryLower = "fr-585 formunu ver".toLocaleLowerCase('tr-TR');
        const terms = queryLower.split(' ').filter(t => t.length > 2);
        
        const scores = knowledgeBase.map(doc => {
            let score = 0;
            const filename = doc.filename.toLocaleLowerCase('tr-TR');
            const content = doc.content ? doc.content.toLocaleLowerCase('tr-TR') : "";

            terms.forEach(term => {
                const rootTerm = term.length > 6 ? term.substring(0, Math.min(term.length - 2, 7)) : term;
                if (filename.includes(term) || (rootTerm.length > 4 && filename.includes(rootTerm))) score += 20;
                if (content.includes(term) || (rootTerm.length > 4 && content.includes(rootTerm))) score += 1;
            });
            return { filename: doc.filename, score };
        });

        const sorted = scores.filter(s => s.score > 0).sort((a, b) => b.score - a.score).slice(0, 5);
        console.log("MATCHED DOCS FOR RAG:", sorted);
    } catch(e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
run();
