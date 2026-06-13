// pgvector kurulumu (güvenli, geri-dönüşsüz değil): extension + embedding kolonu.
// Index, backfill SONRASI ayrı script ile kurulur (boş tabloda index gereksiz).
// Çalıştırma: node -r dotenv/config scripts/pgvector-setup.js dotenv_config_path=.env.local
const { Client } = require('pg');

(async () => {
  const conn = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  const client = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    console.log('1) CREATE EXTENSION vector...');
    await client.query('CREATE EXTENSION IF NOT EXISTS vector;');

    console.log('2) ALTER TABLE add embedding vector(1536)...');
    await client.query('ALTER TABLE knowledge_documents ADD COLUMN IF NOT EXISTS embedding vector(1536);');

    const check = await client.query(`
      SELECT column_name, udt_name FROM information_schema.columns
      WHERE table_name='knowledge_documents' AND column_name='embedding';
    `);
    console.log('   embedding kolonu:', check.rows[0] || '(oluşmadı)');
    console.log('✓ Kurulum tamam. Sıradaki: backfill.');
  } catch (e) {
    console.error('HATA:', e.message);
    process.exit(1);
  } finally {
    await client.end();
  }
})();
