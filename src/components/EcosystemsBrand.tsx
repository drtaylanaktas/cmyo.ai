import React from 'react';

/**
 * ÇMYO.AI Ecosystems marka wordmark'ı.
 *
 * "ÇMYO.AI" düz (mevcut font), "Ecosystems" ise premium el yazısı (Great Vibes,
 * `.font-ecosystems`) ile render edilir. Yalnız görünen marka logo/başlıklarında
 * kullanılır; `ÇMYO.AI FİT` alt-markası ve cümle içi metinler için KULLANILMAZ.
 *
 * @param className     Dış span'e uygulanacak sınıflar (boyut/renk/ağırlık).
 * @param scriptClassName "Ecosystems" kelimesine ek sınıf (renk/boyut ince ayarı).
 * @param suffix        Marka sonrası düz ek, ör. "v2.0" / "Yönetim".
 */
export function EcosystemsBrand({
    className = '',
    scriptClassName = '',
    suffix,
}: {
    className?: string;
    scriptClassName?: string;
    suffix?: string;
}) {
    return (
        <span className={className}>
            ÇMYO.AI{' '}
            <span className={`font-ecosystems ${scriptClassName}`}>Ecosystems</span>
            {suffix ? <span className="font-sans font-semibold"> {suffix}</span> : null}
        </span>
    );
}

export default EcosystemsBrand;
