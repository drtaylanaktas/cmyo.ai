// Read-only inceleme: pgvector hibrit RAG öncesi DB durumunu raporlar.
// Çalıştırma: node -r dotenv/config scripts/pgvector-inspect.js dotenv_config_path=.env.local
const { Client } = require('pg');

(async () => {
  const conn = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!conn) { console.error('DATABASE_URL yok'); process.exit(1); }
  const client = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    // 1) knowledge_documents şeması
    const cols = await client.query(`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'knowledge_documents' ORDER BY ordinal_position;
    `);
    console.log('=== knowledge_documents kolonları ===');
    cols.rows.forEach(r => console.log(`  ${r.column_name}: ${r.data_type}`));

    // 2) satır sayısı + içerik uzunluk istatistikleri
    const stats = await client.query(`
      SELECT COUNT(*) AS n,
             COALESCE(SUM(length(content)),0) AS total_chars,
             COALESCE(MAX(length(content)),0) AS max_chars,
             COALESCE(AVG(length(content))::int,0) AS avg_chars
      FROM knowledge_documents;
    `);
    console.log('=== içerik istatistikleri ===');
    console.log('  ', stats.rows[0]);

    // 3) kategori dağılımı
    const cats = await client.query(`
      SELECT category, COUNT(*) AS n FROM knowledge_documents GROUP BY category ORDER BY n DESC;
    `);
    console.log('=== kategori dağılımı ===');
    cats.rows.forEach(r => console.log(`  ${r.category || '(yok)'}: ${r.n}`));

    // 4) pgvector mevcut mu / kurulu mu?
    const avail = await client.query(`SELECT name, default_version, installed_version FROM pg_available_extensions WHERE name = 'vector';`);
    console.log('=== pgvector durumu ===');
    if (avail.rows.length === 0) console.log('  vector eklentisi MEVCUT DEĞİL (Neon\'da etkinleştirme gerekebilir)');
    else console.log('  ', avail.rows[0]);

    // 5) embedding kolonu zaten var mı?
    const hasEmb = cols.rows.some(r => r.column_name === 'embedding');
    console.log('=== embedding kolonu var mı? ===');
    console.log('  ', hasEmb ? 'EVET' : 'HAYIR');
  } catch (e) {
    console.error('HATA:', e.message);
  } finally {
    await client.end();
  }
})();
