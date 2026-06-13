import { describe, it, expect } from 'vitest';
import { buildEmbeddingInput, toVectorLiteral, EMBEDDING_DIM } from '@/lib/embeddings';

describe('toVectorLiteral', () => {
    it('sayı dizisini pgvector literal\'ine çevirir', () => {
        expect(toVectorLiteral([0.1, 0.2, -0.3])).toBe('[0.1,0.2,-0.3]');
    });

    it('boş dizi için [] döndürür', () => {
        expect(toVectorLiteral([])).toBe('[]');
    });
});

describe('buildEmbeddingInput', () => {
    it('dosya adı + içeriği birleştirir', () => {
        expect(buildEmbeddingInput('dosya.pdf', 'içerik')).toBe('dosya.pdf\n\niçerik');
    });

    it('içeriği 8000 karaktere kırpar', () => {
        const longContent = 'a'.repeat(20000);
        const out = buildEmbeddingInput('f', longContent);
        // 'f\n\n' + 8000 karakter
        expect(out.length).toBeLessThanOrEqual('f\n\n'.length + 8000);
        expect(out.startsWith('f\n\n')).toBe(true);
    });
});

describe('EMBEDDING_DIM', () => {
    it('1536 boyutludur (text-embedding-3-small)', () => {
        expect(EMBEDDING_DIM).toBe(1536);
    });
});
