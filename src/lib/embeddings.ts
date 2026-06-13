import OpenAI from 'openai';
import { sql } from '@vercel/postgres';

// Hibrit RAG için embedding üretimi. text-embedding-3-small (1536 boyut) —
// ucuz, hızlı ve kaliteli. Boyut değişirse DB kolonu + index de güncellenmeli.
export const EMBEDDING_MODEL = 'text-embedding-3-small';
export const EMBEDDING_DIM = 1536;

// Embedding girişi için güvenli üst sınır (token limiti ~8191; karakter ≈ token*4).
const MAX_EMBED_CHARS = 8000;

let _client: OpenAI | null = null;
function client(): OpenAI {
    if (!_client) {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) throw new Error('OPENAI_API_KEY yok — embedding üretilemez.');
        _client = new OpenAI({ apiKey });
    }
    return _client;
}

/** Bir belge için embedding metnini hazırlar: dosya adı + kırpılmış içerik. */
export function buildEmbeddingInput(filename: string, content: string): string {
    const body = (content || '').slice(0, MAX_EMBED_CHARS);
    return `${filename}\n\n${body}`.trim();
}

/** Tek bir metin için embedding döndürür (number[]). */
export async function embedText(text: string): Promise<number[]> {
    const input = (text || '').slice(0, MAX_EMBED_CHARS) || ' ';
    const res = await client().embeddings.create({ model: EMBEDDING_MODEL, input });
    return res.data[0].embedding;
}

/** Birden çok metin için embedding (toplu — backfill'de verimli). */
export async function embedBatch(texts: string[]): Promise<number[][]> {
    const inputs = texts.map((t) => (t || '').slice(0, MAX_EMBED_CHARS) || ' ');
    const res = await client().embeddings.create({ model: EMBEDDING_MODEL, input: inputs });
    // OpenAI sırayı korur ama index'e göre de sıralayalım (garanti).
    return res.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

/** number[] → pgvector literal '[0.1,0.2,...]' (SQL parametresi için). */
export function toVectorLiteral(vec: number[]): string {
    return `[${vec.join(',')}]`;
}

/**
 * Bir belge için embedding üretip knowledge_documents.embedding kolonuna yazar.
 * Yazma yollarından (admin ekleme/güncelleme, cron scraping) çağrılır.
 * Dayanıklı: hata olsa bile asıl yazma işlemini bozmaz (yalnızca loglar).
 */
export async function storeDocumentEmbedding(id: number, filename: string, content: string): Promise<void> {
    try {
        const vec = await embedText(buildEmbeddingInput(filename, content));
        const literal = toVectorLiteral(vec);
        await sql`UPDATE knowledge_documents SET embedding = ${literal}::vector WHERE id = ${id}`;
    } catch (e) {
        console.error('storeDocumentEmbedding error:', e);
    }
}
