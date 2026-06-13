# Veritabanı Migration'ları

Şema değişikliklerinin **tek kaynağı** burasıdır. Eski `src/app/api/setup-db/*`
endpoint'leri (ad-hoc, elle tetiklenen) yerini bu versiyonlu sisteme bırakmıştır.

## Kullanım

```bash
# Bekleyen migration'ları uygula
npm run db:migrate

# Durumu gör (hangileri uygulandı)
npm run db:migrate:status
```

Bağlantı `DATABASE_URL` (ya da `POSTGRES_URL`) ortam değişkeninden alınır
(`.env.local`). Production'da Vercel ortam değişkenleri kullanılır.

## Yeni migration ekleme

`migrations/` altına sıradaki numarayla bir `.sql` dosyası oluştur, örn.
`0003_add_xyz.sql`. Kurallar:

- **İleri-yönlü ve idempotent** yaz (`CREATE TABLE IF NOT EXISTS`,
  `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`). Böylece mevcut
  canlı DB'de no-op çalışır, boş DB'de şemayı sıfırdan kurar.
- Her dosya tek transaction'da çalışır; `CREATE INDEX CONCURRENTLY` kullanma.
- Uygulananlar `schema_migrations` tablosunda izlenir; runner aynı dosyayı
  iki kez uygulamaz.

## Mevcut migration'lar

- `0001_baseline.sql` — temel şema (users, conversations, messages,
  knowledge_documents, news_items, events) + uuid-ossp.
- `0002_pgvector.sql` — pgvector extension + `knowledge_documents.embedding`
  vector(1536) + HNSW cosine index (hibrit RAG).
