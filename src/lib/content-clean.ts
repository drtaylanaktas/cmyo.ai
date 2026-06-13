/**
 * Asistan yanıtından teknik aksiyon artıklarını (JSON_START/END blokları ve
 * sızan tool argümanı JSON'ları) temizler. Hem canlı akışta hem nihai/önceki
 * mesajların görüntülenmesinde kullanılır. Saf fonksiyonlar — test edilebilir.
 */

// JSON_START ... JSON_END blokları (opsiyonel ``` çitleriyle).
export const JSON_CLEAN_REGEX = /(?:```(?:json)?\s*)?JSON_START\s*[\s\S]*?JSON_END(?:\s*```)?/gi;

// Güvenlik ağı: model bazen tool argümanlarını ({ "filename": ... }) metne sızdırır.
export const ACTION_JSON_REGEX = /\{[\s\S]*?"(?:filename|file_name|action)"[\s\S]*?\}/gi;

/** Tamamlanmış teknik blokları temizler (render + nihai içerik için). */
export function stripJsonBlock(content: string): string {
    return content.replace(JSON_CLEAN_REGEX, '').replace(ACTION_JSON_REGEX, '').trim();
}

/**
 * Canlı akış için: tamamlanmış blokların yanı sıra HENÜZ kapanmamış (yarım) bir
 * action JSON'u veya JSON_START'ı da gizler — kullanıcı yazılırken görmesin.
 */
export function cleanStreamingContent(content: string): string {
    let out = stripJsonBlock(content);
    const partialObj = out.search(/\{[^}]*"(?:filename|file_name|action)"/i);
    if (partialObj !== -1) out = out.slice(0, partialObj);
    const js = out.indexOf('JSON_START');
    if (js !== -1) out = out.slice(0, js);
    return out.trimEnd();
}
