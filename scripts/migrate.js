/**
 * Basit, ileri-yönlü migration runner.
 *   node -r dotenv/config scripts/migrate.js          dotenv_config_path=.env.local  → bekleyenleri uygula
 *   node -r dotenv/config scripts/migrate.js status    dotenv_config_path=.env.local  → durum listesi
 *
 * migrations/ klasöründeki NNNN_*.sql dosyaları sıralı uygulanır; uygulananlar
 * schema_migrations tablosunda izlenir. Her dosya tek transaction'da çalışır.
 * Migration'lar idempotent (IF NOT EXISTS) yazıldığı için tekrar güvenlidir.
 */
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

async function ensureTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

function migrationFiles() {
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => /^\d+.*\.sql$/.test(f))
    .sort();
}

async function appliedVersions(client) {
  const { rows } = await client.query('SELECT version FROM schema_migrations');
  return new Set(rows.map(r => r.version));
}

(async () => {
  const mode = process.argv[2] || 'apply';
  const client = new Client({ connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await ensureTable(client);
    const files = migrationFiles();
    const applied = await appliedVersions(client);

    if (mode === 'status') {
      console.log('Migration durumu:');
      for (const f of files) {
        const v = f.replace(/\.sql$/, '');
        console.log(`  [${applied.has(v) ? 'x' : ' '}] ${f}`);
      }
      return;
    }

    const pending = files.filter(f => !applied.has(f.replace(/\.sql$/, '')));
    if (pending.length === 0) { console.log('Bekleyen migration yok. Şema güncel.'); return; }

    for (const f of pending) {
      const v = f.replace(/\.sql$/, '');
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8');
      process.stdout.write(`Uygulanıyor: ${f} ... `);
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [v]);
        await client.query('COMMIT');
        console.log('OK');
      } catch (e) {
        await client.query('ROLLBACK');
        console.log('HATA');
        throw e;
      }
    }
    console.log(`✓ ${pending.length} migration uygulandı.`);
  } catch (e) {
    console.error('Migration hatası:', e.message);
    process.exit(1);
  } finally {
    await client.end();
  }
})();
