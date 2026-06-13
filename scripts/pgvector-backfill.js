// embedding'i NULL olan tüm knowledge_documents satırları için embedding üretir.
// Tekrar çalıştırılabilir (yalnızca eksikleri doldurur).
// Çalıştırma: node -r dotenv/config scripts/pgvector-backfill.js dotenv_config_path=.env.local
const { Client } = require('pg');
const OpenAI = require('openai');

const MODEL = 'text-embedding-3-small';
const MAX_CHARS = 8000;
const BATCH = 64;

(async () => {
  const conn = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) { console.error('OPENAI_API_KEY yok'); process.exit(1); }
  const openai = new OpenAI({ apiKey });
  const client = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    const { rows } = await client.query(
      `SELECT id, filename, content FROM knowledge_documents WHERE embedding IS NULL ORDER BY id;`
    );
    console.log(`Embedding gerektiren satır: ${rows.length}`);
    if (rows.length === 0) { console.log('Hepsi dolu.'); return; }

    let done = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const inputs = batch.map(r => `${r.filename}\n\n${(r.content || '').slice(0, MAX_CHARS)}`.trim() || ' ');
      const res = await openai.embeddings.create({ model: MODEL, input: inputs });
      const embs = res.data.sort((a, b) => a.index - b.index).map(d => d.embedding);

      // Satır başına UPDATE (tek transaction)
      await client.query('BEGIN');
      for (let j = 0; j < batch.length; j++) {
        const lit = `[${embs[j].join(',')}]`;
        await client.query('UPDATE knowledge_documents SET embedding = $1::vector WHERE id = $2', [lit, batch[j].id]);
      }
      await client.query('COMMIT');

      done += batch.length;
      console.log(`  ${done}/${rows.length}`);
    }
    console.log('✓ Backfill tamam.');
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('HATA:', e.message);
    process.exit(1);
  } finally {
    await client.end();
  }
})();
