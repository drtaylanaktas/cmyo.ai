#!/bin/bash
# ─── ÇMYO.AI Telegram Deploy Sonrası Kurulum Scripti ─────────────
#
# Bu script deploy sonrası 3 işlem yapar:
#   1. DB migration'ları çalıştırır (channel kolonu + active_telegram_conversation_id)
#   2. Telegram webhook'u ayarlar (secret token + bot komutları)
#
# Kullanım:
#   chmod +x scripts/setup-telegram.sh
#   ./scripts/setup-telegram.sh
#
# ─────────────────────────────────────────────────────────────────

set -e

# ─── Ayarlar ─────────────────────────────────────────────────────
# Site URL'nizi buraya yazın (sonunda / olmadan)
SITE_URL="${SITE_URL:-https://cmyoai.com}"

# CRON_SECRET değerini .env.local'den veya Vercel'den alın
if [ -z "$CRON_SECRET" ]; then
    # .env.local'den okumayı dene
    if [ -f .env.local ]; then
        CRON_SECRET=$(grep '^CRON_SECRET=' .env.local | cut -d'=' -f2-)
    fi
fi

if [ -z "$CRON_SECRET" ]; then
    echo "❌ CRON_SECRET bulunamadı."
    echo "   Kullanım: CRON_SECRET=your_secret ./scripts/setup-telegram.sh"
    echo "   veya .env.local dosyasında CRON_SECRET tanımlı olmalı."
    exit 1
fi

echo "🚀 ÇMYO.AI Telegram Kurulum Scripti"
echo "   Site: $SITE_URL"
echo ""

# ─── Adım 1: conversations tablosuna channel kolonu ─────────────
echo "📦 [1/3] DB Migration: conversations.channel kolonu ekleniyor..."
RESPONSE=$(curl -s -w "\n%{http_code}" "${SITE_URL}/api/setup-db/chat-schema?secret=${CRON_SECRET}")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -1)

if [ "$HTTP_CODE" = "200" ]; then
    echo "   ✅ Başarılı: $BODY"
else
    echo "   ⚠️  HTTP $HTTP_CODE: $BODY"
fi
echo ""

# ─── Adım 2: users tablosuna active_telegram_conversation_id ────
echo "📦 [2/3] DB Migration: users.active_telegram_conversation_id kolonu ekleniyor..."
RESPONSE=$(curl -s -w "\n%{http_code}" "${SITE_URL}/api/setup-db/add-telegram-columns?secret=${CRON_SECRET}")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -1)

if [ "$HTTP_CODE" = "200" ]; then
    echo "   ✅ Başarılı: $BODY"
else
    echo "   ⚠️  HTTP $HTTP_CODE: $BODY"
fi
echo ""

# ─── Adım 3: Telegram webhook + bot komutları ───────────────────
echo "🤖 [3/3] Telegram webhook ve bot komutları ayarlanıyor..."
RESPONSE=$(curl -s -w "\n%{http_code}" "${SITE_URL}/api/telegram/set-webhook")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -1)

if [ "$HTTP_CODE" = "200" ]; then
    echo "   ✅ Başarılı: $BODY"
else
    echo "   ⚠️  HTTP $HTTP_CODE: $BODY"
fi
echo ""

echo "─────────────────────────────────────────"
echo "✅ Kurulum tamamlandı!"
echo ""
echo "📋 Kontrol listesi:"
echo "   □ Vercel Dashboard'ta TELEGRAM_WEBHOOK_SECRET env variable eklendi mi?"
echo "   □ Vercel Dashboard'ta TELEGRAM_BOT_TOKEN gerçek token ile güncellendi mi?"
echo "   □ Telegram'da /start komutu çalışıyor mu?"
echo "   □ Telegram'da / yazınca komut menüsü görünüyor mu?"
