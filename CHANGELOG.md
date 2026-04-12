# Changelog

Tum onemli degisiklikler bu dosyada belgelenir.
Format [Keep a Changelog](https://keepachangelog.com/tr/1.1.0/) ve
[Semantic Versioning](https://semver.org/lang/tr/) standartlarini takip eder.

---

## [1.5.0] - 2026-04-12

### Eklenen
- **FR-585 Kanit Formu otomatik doldurma** — Kullanici gorsel, DOCX, PDF veya metin kanitini chat'e yukleyip "FR-585 kanit formunu doldur" dediginde GPT-4o Vision + Structured Outputs ile alanlar cikarilip docxtemplater ile doldurulmus DOCX indirilir. Emin olunmayan alanlar bos birakilir ve kullaniciya uyari notu gosterilir.
- **Gorsel yukleme destegi** — JPG/PNG/WEBP gorselleri chat'e yuklenebilir (4 MB limit, magic-byte dogrulama).
- **Otomatik buyuyen chat input** — Tek satirlik input yerine icerige gore dikey buyuyen textarea. Shift+Enter ile yeni satir, Enter ile gonderme.
- **Claude tarzi dusunme animasyonu** — Shimmer text efekti, avatar etrafinda nabiz pariltisi, Framer Motion ile yumusak faz gecisleri.
- **Gunluk otomatik haber sistemi** — Vercel Cron ile universite haberlerini otomatik cekme ve chat'te sunma.
- **Form kodu ile arama** — "FR-585'i ver" gibi kodlarla dogrudan belge eslestirme.
- **Disk dosyalarini DB ile senkronize et** — Admin panelinden tek butonla dosya-DB esitlemesi.
- **Haber kisayolu** — "Bugunun haberleri" hizli erisim butonu.

### Degistirilen
- Chat input butonlari (mikrofon, dosya ekleme) textarea ile piksel eslesimli boyutlara getirildi.
- RAG sistemi kökten yeniden yazildi — 11 bloklu oncelikli yonlendirme sistemi.
- Dosya bulma sistemi — Turkce keyword, ILIKE, uzanti normalizasyonu.
- Ders programi ve staj bloklari hardcoded listeden dinamik DB aramasina gecirildi.
- Loading animasyonu animate-pulse'tan shimmer efektine yukseltildi.
- Faz gecis araligi 1.5s'den 2.2s'ye yavaslatildi (daha sakin, profesyonel).

### Duzeltilen
- Telegram webhook dosya gonderme 401 hatasi.
- Turkce I harfi regex hatasi (RAG).
- Coklu belge listeleme ve baglam disi dosya yasagi.
- PDF file_url proxy + akademik takvim RAG blogu.
- Chat input mobilde yatay tasma sorunu.
- Konum izin akisi sagllamastirildi.

### Guvenlik
- npm audit fix ile 10 guvenlik acigi giderildi (2 critical dahil).
- Gorsel yukleme icin magic-byte dogrulamasi (MIME spoof korumasi).
- FR-585 maliyet kontrolu: 3 katmanli guvenlik (intent gate, endpoint whitelist, rate limit).

---

## [1.0.0] - 2025-12-01

Ilk kararli surum. Temel ozellikler:
- RAG tabanli soru-cevap sistemi (Bologna, akademik takvim, formlar)
- Kullanici kayit/giris (ogrenci/akademisyen rolleri)
- Belge indirme (DOCX/PDF/XLSX uretimi)
- Sesli metin girisi (Web Speech API)
- Konum tabanli hava durumu
- Sohbet gecmisi (kaydetme, silme, yeniden adlandirma, sabitleme)
- Admin paneli (bilgi tabani yonetimi, chat loglari, kullanici yonetimi)
- Telegram bot entegrasyonu
- Gunluk mesaj kotasi (100 mesaj/ogrenci)
- Kullanim Kosullari, KVKK Aydinlatma Metni, Gizlilik Politikasi
- Kapsamli guvenlik (rate limiting, CSP, input sanitization)
- GPT-4o Mini'den GPT-4o'ya gecis
