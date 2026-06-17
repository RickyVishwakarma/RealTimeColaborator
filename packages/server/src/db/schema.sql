-- Real-time collaborative editor — MVP schema
-- Run via `npm run migrate --workspace=@rtc/server`

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  display_name  VARCHAR(255) NOT NULL,
  avatar_url    TEXT,
  password_hash VARCHAR(255) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS folders (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(120) NOT NULL,
  owner_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_folders_owner ON folders(owner_id);

CREATE TABLE IF NOT EXISTS documents (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title            VARCHAR(255) NOT NULL DEFAULT 'Untitled',
  owner_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  folder_id        UUID REFERENCES folders(id) ON DELETE SET NULL,
  -- Latest encoded Yjs state vector + document. Flushed periodically from memory.
  content_snapshot BYTEA,
  is_public        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_documents_owner_id ON documents(owner_id);
CREATE INDEX IF NOT EXISTS idx_documents_deleted_at ON documents(deleted_at);

-- Full-text search: plain-text content extracted from the CRDT on each flush,
-- plus a generated tsvector over title + content.
ALTER TABLE documents ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES folders(id) ON DELETE SET NULL;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS search_text TEXT NOT NULL DEFAULT '';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(search_text, ''))
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_documents_search_tsv ON documents USING GIN (search_tsv);
CREATE INDEX IF NOT EXISTS idx_documents_title_trgm ON documents USING GIN (title gin_trgm_ops);

CREATE TABLE IF NOT EXISTS document_permissions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role          VARCHAR(20) NOT NULL CHECK (role IN ('owner','editor','commenter','viewer')),
  granted_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (document_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_permissions_document_id ON document_permissions(document_id);
CREATE INDEX IF NOT EXISTS idx_permissions_user_id ON document_permissions(user_id);

-- Append-only change log for audit / history / recovery.
CREATE TABLE IF NOT EXISTS document_changes (
  id          BIGSERIAL PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  update_data BYTEA NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_changes_document_created ON document_changes(document_id, created_at);

-- Comments & threads. A top-level comment has thread_id = NULL; replies point
-- at their root comment via thread_id.
CREATE TABLE IF NOT EXISTS comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  thread_id   UUID REFERENCES comments(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  resolved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comments_document_id ON comments(document_id);
CREATE INDEX IF NOT EXISTS idx_comments_thread_id ON comments(thread_id);

-- Named, restorable version snapshots (full encoded Yjs state at a point in time).
CREATE TABLE IF NOT EXISTS document_snapshots (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  label       VARCHAR(255) NOT NULL DEFAULT 'Snapshot',
  state       BYTEA NOT NULL,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_snapshots_document_created ON document_snapshots(document_id, created_at DESC);

-- In-app notifications (shares, comments, mentions).
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        VARCHAR(30) NOT NULL,
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  actor_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  body        TEXT NOT NULL,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications(user_id, created_at DESC) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications(user_id, created_at DESC);
