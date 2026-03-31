# GÜVENLİK AKSİYONLARI — ÇMYO.AI

> **UYARI:** Bu dosyadaki tüm adımlar tamamlanana kadar sistemi production'a almayın.
> .env.local Google Drive'da senkronize edildiği için aşağıdaki tüm credential'lar ifşa olmuş sayılmalıdır.

---

## 1. ROTATE EDİLECEK CREDENTIAL'LAR (ACİL)

### 1.1 Neon PostgreSQL Şifresi
- URL: https://console.neon.tech → Project: icy-leaf-55680130 → Settings → Reset password
- Yeni bağlantı string'lerini Vercel Environment Variables'a ekle

### 1.2 OpenAI API Key
- URL: https://platform.openai.com/api-keys
- Mevcut key'i (sk-proj-vIbU01...) iptal et → Yeni key oluştur
- Vercel'e ekle: `OPENAI_API_KEY`

### 1.3 Google Gemini API Key
- URL: https://aistudio.google.com/app/apikey
- Mevcut key'i (AIzaSyBoj...) sil → Yeni key oluştur
- Vercel'e ekle: `GEMINI_API_KEY` (NEXT_PUBLIC_ prefix'siz!)

### 1.4 Gmail App Password
- URL: https://myaccount.google.com/apppasswords
- Mevcut şifreyi (wcysesh...) iptal et → Yeni oluştur
- Vercel'e ekle: `SMTP_PASS`

### 1.5 UploadThing Secret
- URL: https://uploadthing.com/dashboard → API Keys
- Mevcut key'i (sk_live_15c...) iptal et → Yeni oluştur
- Vercel'e ekle: `UPLOADTHING_SECRET`

### 1.6 Telegram Bot Token
- Telegram'da @BotFather'a yaz → /mybots → botunu seç → API Token → Revoke current token
- Yeni token'ı Vercel'e ekle: `TELEGRAM_BOT_TOKEN`
- Yeni token'dan sonra webhook'u yeniden ayarla: `/api/telegram/set-webhook` endpoint'ini çalıştır

### 1.7 JWT Secret (YENİ)
Terminalde güçlü bir secret üret:
```bash
openssl rand -base64 64
```
Vercel'e ekle: `JWT_SECRET`

---

## 2. VERCEL ENVIRONMENT VARIABLES KURULUMU

Tüm credential'ları Vercel dashboard'dan ayarla (asla .env.local'e yazma):
1. https://vercel.com/drtaylans-projects/cmyo-ai/settings/environment-variables
2. Her değişkeni Production + Preview + Development ortamlarına ekle
3. Re-deploy yap

**Eklenecek değişkenler:**
```
DATABASE_URL          → Neon yeni connection string
POSTGRES_PASSWORD     → Neon yeni şifre
OPENAI_API_KEY        → Yeni OpenAI key
GEMINI_API_KEY        → Yeni Gemini key (NEXT_PUBLIC_ değil!)
SMTP_PASS             → Yeni Gmail app password
UPLOADTHING_SECRET    → Yeni UploadThing secret
TELEGRAM_BOT_TOKEN    → Yeni Telegram token
JWT_SECRET            → openssl rand -base64 64 çıktısı
```

---

## 3. UPSTASH REDIS KURULUMU (FAZ 2.1)

Distributed rate limiting için:
1. https://upstash.com → Yeni Redis database oluştur (EU veya US, uygun bölge)
2. REST URL ve TOKEN'ı kopyala
3. Vercel'e ekle:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
4. `npm install @upstash/ratelimit @upstash/redis` çalıştır

---

## 4. .ENV.LOCAL GÜVENLİĞİ

.env.local artık gerçek credential içermiyor (placeholder değerler var).
Lokal geliştirme için credential'ları ya:
- Vercel CLI ile pull et: `vercel env pull .env.local`
- Ya da password manager'da sakla

**ÖNEMLİ:** .env.local asla Google Drive, iCloud, OneDrive veya herhangi bir
bulut depolama klasörü içinde bulunmamalıdır.

---

## 5. KONTROL LİSTESİ

- [ ] Neon şifresi rotate edildi
- [ ] OpenAI key rotate edildi
- [ ] Gemini key rotate edildi
- [ ] Gmail app password rotate edildi
- [ ] UploadThing secret rotate edildi
- [ ] Telegram bot token rotate edildi
- [ ] JWT_SECRET Vercel'e eklendi
- [ ] Tüm credential'lar Vercel dashboard'da güncellendi
- [ ] Re-deploy yapıldı
- [ ] Upstash Redis kuruldu
- [ ] .env.local bulut dışına taşındı
