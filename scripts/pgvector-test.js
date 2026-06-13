// Vektör aramayı doğrular: paraphrase sorgular için en yakın belgeleri gösterir.
// Çalıştırma: node -r dotenv/config scripts/pgvector-test.js dotenv_config_path=.env.local
const { Client } = require('pg');
const OpenAI = require('openai');

const QUERIES = [
  'kampüse nasıl ulaşırım, servis var mı',
  'yemek kartıma nasıl para yüklerim',
  'okula kayıt için hangi belgeler lazım',
  'staj yaparken sigortam nasıl oluyor',
];

(async () => {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const client = new Client({ connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    for (const q of QUERIES) {
      const e = await openai.embeddings.create({ model: 'text-embedding-3-small', input: q });
      const lit = `[${e.data[0].embedding.join(',')}]`;
      const { rows } = await client.query(
        `SELECT filename, ROUND((1 - (embedding <=> $1::vector))::numeric, 3) AS sim
         FROM knowledge_documents WHERE embedding IS NOT NULL
         ORDER BY embedding <=> $1::vector LIMIT 4;`, [lit]
      );
      console.log(`\nSORGU: "${q}"`);
      rows.forEach(r => console.log(`   ${r.sim}  ${r.filename}`));
    }
  } catch (e) {
    console.error('HATA:', e.message);
  } finally {
    await client.end();
  }
})();
