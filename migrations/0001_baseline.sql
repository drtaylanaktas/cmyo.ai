-- 0001_baseline — ÇMYO.AI mevcut şemasının temel hattı (idempotent).
-- Canlı DB'de no-op çalışır (IF NOT EXISTS); boş bir DB'de tüm şemayı kurar.
-- Not: pgvector (embedding kolonu + index) ayrı 0002 migration'ındadır.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Kullanıcılar
CREATE TABLE IF NOT EXISTS users (
    id                              SERIAL PRIMARY KEY,
    name                            VARCHAR(255) NOT NULL,
    surname                         VARCHAR(255) NOT NULL,
    email                           VARCHAR(255) NOT NULL UNIQUE,
    password                        VARCHAR(255) NOT NULL,
    role                            VARCHAR(50)  NOT NULL,
    title                           VARCHAR(100),
    academic_unit                   VARCHAR(255),
    avatar                          TEXT,
    created_at                      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    reset_token                     VARCHAR(255),
    reset_token_expiry              TIMESTAMPTZ,
    email_verified                  BOOLEAN DEFAULT false,
    verification_token              TEXT,
    daily_message_count             INTEGER DEFAULT 0,
    last_message_date               TIMESTAMPTZ,
    telegram_chat_id                BIGINT,
    telegram_linked                 BOOLEAN DEFAULT false,
    telegram_link_code              VARCHAR(8),
    last_logout_at                  TIMESTAMPTZ,
    terms_accepted                  BOOLEAN DEFAULT false,
    terms_accepted_at               TIMESTAMPTZ,
    telegram_history                JSONB DEFAULT '[]'::jsonb,
    telegram_history_updated_at     TIMESTAMPTZ,
    active_telegram_conversation_id UUID,
    daily_humanize_count            INTEGER DEFAULT 0,
    daily_detect_count              INTEGER DEFAULT 0,
    last_humanizer_date             TIMESTAMPTZ
);

-- Sohbetler
CREATE TABLE IF NOT EXISTS conversations (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_email  VARCHAR(255) NOT NULL REFERENCES users(email),
    title       VARCHAR(255) NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    is_pinned   BOOLEAN DEFAULT false,
    channel     VARCHAR(20) DEFAULT 'web'
);

-- Mesajlar (sohbet silinince CASCADE)
CREATE TABLE IF NOT EXISTS messages (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    role            VARCHAR(50) NOT NULL,
    content         TEXT NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Bilgi tabanı (RAG)
CREATE TABLE IF NOT EXISTS knowledge_documents (
    id          SERIAL PRIMARY KEY,
    filename    VARCHAR(255) NOT NULL UNIQUE,
    content     TEXT NOT NULL,
    category    VARCHAR(100),
    priority    INTEGER DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    file_url    VARCHAR(1024)
);

-- Haberler (takvim UI + RAG kaynağı)
CREATE TABLE IF NOT EXISTS news_items (
    id                  SERIAL PRIMARY KEY,
    external_url        TEXT NOT NULL UNIQUE,
    title               TEXT NOT NULL,
    published_date      DATE,
    published_date_text TEXT,
    source              TEXT NOT NULL,
    scraped_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_news_date   ON news_items (published_date);
CREATE INDEX IF NOT EXISTS idx_news_source ON news_items (source);

-- Etkinlikler
CREATE TABLE IF NOT EXISTS events (
    id              SERIAL PRIMARY KEY,
    external_url    TEXT NOT NULL UNIQUE,
    title           TEXT NOT NULL,
    description     TEXT,
    event_date      DATE,
    event_date_text TEXT,
    source          TEXT DEFAULT 'ahievran-etkinlik',
    scraped_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_events_date ON events (event_date);
