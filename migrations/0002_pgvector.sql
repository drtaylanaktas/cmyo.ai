-- 0002_pgvector — hibrit RAG için vektör altyapısı (idempotent).
-- text-embedding-3-small → 1536 boyut. Boyut değişirse kolon + index güncellenmeli.

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE knowledge_documents
    ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- HNSW cosine index (yaklaşık en-yakın-komşu; hızlı semantik arama).
CREATE INDEX IF NOT EXISTS knowledge_documents_embedding_hnsw
    ON knowledge_documents USING hnsw (embedding vector_cosine_ops);
