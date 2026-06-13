// HNSW cosine index'i kurar (backfill SONRASI). Idempotent.
// Çalıştırma: node -r dotenv/config scripts/pgvector-index.js dotenv_config_path=.env.local
const { Client } = require('pg');

(async () => {
  const conn = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  const client = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    console.log('HNSW cosine index kuruluyor...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS knowledge_documents_embedding_hnsw
      ON knowledge_documents USING hnsw (embedding vector_cosine_ops);
    `);
    const cov = await client.query(`
      SELECT COUNT(*) AS total, COUNT(embedding) AS embedded FROM knowledge_documents;
    `);
    console.log('   kapsam:', cov.rows[0]);
    console.log('✓ Index hazır.');
  } catch (e) {
    console.error('HATA:', e.message);
    process.exit(1);
  } finally {
    await client.end();
  }
})();
