// Canlı şemayı raporlar (baseline migration yazmak için). Read-only.
// Çalıştırma: node -r dotenv/config scripts/db-introspect.js dotenv_config_path=.env.local
const { Client } = require('pg');

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const tables = (await client.query(`
      SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;
    `)).rows.map(r => r.tablename);

    for (const t of tables) {
      console.log(`\n===== TABLE ${t} =====`);
      const cols = await client.query(`
        SELECT column_name, data_type, udt_name, is_nullable, column_default, character_maximum_length
        FROM information_schema.columns WHERE table_name=$1 ORDER BY ordinal_position;`, [t]);
      cols.rows.forEach(c => {
        console.log(`  ${c.column_name} | ${c.data_type}${c.character_maximum_length ? '(' + c.character_maximum_length + ')' : ''} | udt=${c.udt_name} | null=${c.is_nullable} | def=${c.column_default || '-'}`);
      });

      const cons = await client.query(`
        SELECT tc.constraint_type, tc.constraint_name,
               string_agg(kcu.column_name, ',' ORDER BY kcu.ordinal_position) AS cols,
               ccu.table_name AS ref_table, ccu.column_name AS ref_col
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name
        LEFT JOIN information_schema.constraint_column_usage ccu
          ON tc.constraint_name=ccu.constraint_name AND tc.constraint_type='FOREIGN KEY'
        WHERE tc.table_name=$1
        GROUP BY tc.constraint_type, tc.constraint_name, ccu.table_name, ccu.column_name
        ORDER BY tc.constraint_type;`, [t]);
      cons.rows.forEach(c => {
        const ref = c.constraint_type === 'FOREIGN KEY' ? ` -> ${c.ref_table}(${c.ref_col})` : '';
        console.log(`  CONSTRAINT ${c.constraint_type}: (${c.cols})${ref}`);
      });

      const idx = await client.query(`SELECT indexdef FROM pg_indexes WHERE tablename=$1;`, [t]);
      idx.rows.forEach(i => console.log(`  INDEX: ${i.indexdef}`));
    }
  } catch (e) {
    console.error('HATA:', e.message);
  } finally {
    await client.end();
  }
})();
