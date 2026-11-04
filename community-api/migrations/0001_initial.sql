-- BAS Community P15.3 — staging schema. SQLite/D1.
-- This migration is deliberately schema-only: no users, submissions or public media.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS community_users (
  id TEXT PRIMARY KEY NOT NULL,
  handle TEXT NOT NULL COLLATE NOCASE UNIQUE
    CHECK(length(handle) BETWEEN 3 AND 32 AND handle NOT GLOB '*[^A-Za-z0-9_]*'),
  display_name TEXT NOT NULL CHECK(length(display_name) BETWEEN 1 AND 80),
  bio TEXT NOT NULL DEFAULT '' CHECK(length(bio) <= 500),
  avatar_object_key TEXT,
  banner_object_key TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active','suspended','deleted')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_users_status ON community_users(status);

-- Provider identities will be linked only after a provider is approved in P15.4.
-- Store a one-way provider subject hash, never OAuth access/refresh tokens.
CREATE TABLE IF NOT EXISTS account_identities (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES community_users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK(provider IN ('github','google','discord')),
  provider_subject_hash TEXT NOT NULL CHECK(length(provider_subject_hash) = 64),
  linked_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(provider,provider_subject_hash)
);

CREATE TABLE IF NOT EXISTS animations (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL REFERENCES community_users(id) ON DELETE RESTRICT,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 3 AND 100),
  summary TEXT NOT NULL DEFAULT '' CHECK(length(summary) <= 1000),
  category TEXT NOT NULL DEFAULT 'abstract'
    CHECK(length(category) BETWEEN 2 AND 32 AND category NOT GLOB '*[^a-z0-9-]*'),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK(status IN ('draft','pending','published','rejected','hidden','removed')),
  published_version_id TEXT,
  download_count INTEGER NOT NULL DEFAULT 0 CHECK(download_count >= 0),
  like_count INTEGER NOT NULL DEFAULT 0 CHECK(like_count >= 0),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  published_at INTEGER,
  CHECK(status != 'published' OR (published_version_id IS NOT NULL AND published_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_animations_owner ON animations(owner_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_animations_listing ON animations(status,published_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_animations_category ON animations(status,category,published_at DESC);
CREATE INDEX IF NOT EXISTS idx_animations_popular ON animations(status,download_count DESC);
CREATE INDEX IF NOT EXISTS idx_animations_liked ON animations(status,like_count DESC);

-- R2 object keys never appear in the public Worker API.
-- "approved" revisions must belong to the selected animation.
CREATE TABLE IF NOT EXISTS animation_versions (
  id TEXT PRIMARY KEY NOT NULL,
  animation_id TEXT NOT NULL REFERENCES animations(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK(revision > 0),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','approved','rejected','hidden')),
  object_key TEXT NOT NULL UNIQUE,
  preview_key TEXT,
  project_key TEXT,
  sha256 TEXT NOT NULL CHECK(length(sha256) = 64),
  size_bytes INTEGER NOT NULL CHECK(size_bytes BETWEEN 1 AND 20971520),
  width INTEGER NOT NULL CHECK(width BETWEEN 1 AND 8192),
  height INTEGER NOT NULL CHECK(height BETWEEN 1 AND 8192),
  fps INTEGER NOT NULL CHECK(fps BETWEEN 1 AND 120),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  reviewed_at INTEGER,
  UNIQUE(animation_id,revision)
);
CREATE INDEX IF NOT EXISTS idx_versions_animation ON animation_versions(animation_id,revision DESC);
CREATE INDEX IF NOT EXISTS idx_versions_status ON animation_versions(status,created_at DESC);

-- Publishing never succeeds if the selected revision is not approved and owned by the animation.
CREATE TRIGGER IF NOT EXISTS trg_publish_insert
BEFORE INSERT ON animations
WHEN NEW.status = 'published' AND NOT EXISTS (
  SELECT 1 FROM animation_versions v
  WHERE v.id = NEW.published_version_id AND v.animation_id = NEW.id AND v.status = 'approved'
)
BEGIN SELECT RAISE(ABORT,'published version is not approved'); END;

CREATE TRIGGER IF NOT EXISTS trg_publish_update
BEFORE UPDATE OF status,published_version_id ON animations
WHEN NEW.status = 'published' AND NOT EXISTS (
  SELECT 1 FROM animation_versions v
  WHERE v.id = NEW.published_version_id AND v.animation_id = NEW.id AND v.status = 'approved'
)
BEGIN SELECT RAISE(ABORT,'published version is not approved'); END;

-- De-approving a live revision must first hide/unpublish its parent animation.
CREATE TRIGGER IF NOT EXISTS trg_version_unapprove
BEFORE UPDATE OF status ON animation_versions
WHEN OLD.status = 'approved' AND NEW.status != 'approved'
 AND EXISTS (
   SELECT 1 FROM animations a
   WHERE a.published_version_id=OLD.id AND a.status='published'
 )
BEGIN SELECT RAISE(ABORT,'unpublish before changing approved version'); END;

-- A live revision cannot be physically deleted without unpublishing first.
CREATE TRIGGER IF NOT EXISTS trg_version_delete_live
BEFORE DELETE ON animation_versions
WHEN EXISTS (
  SELECT 1 FROM animations a WHERE a.published_version_id=OLD.id AND a.status='published'
)
BEGIN SELECT RAISE(ABORT,'unpublish before deleting approved version'); END;

CREATE TABLE IF NOT EXISTS moderation_events (
  id TEXT PRIMARY KEY NOT NULL,
  animation_id TEXT REFERENCES animations(id) ON DELETE SET NULL,
  version_id TEXT REFERENCES animation_versions(id) ON DELETE SET NULL,
  moderator_id TEXT REFERENCES community_users(id) ON DELETE SET NULL,
  action TEXT NOT NULL
    CHECK(action IN ('submit','approve','reject','hide','restore','report','remove')),
  reason TEXT NOT NULL DEFAULT '' CHECK(length(reason) <= 1000),
  occurred_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_moderation_recent ON moderation_events(occurred_at DESC);

-- Global R2 safety threshold is intentionally under the free-tier 10 GB.
-- P15.5 will enforce atomic reservations BEFORE accepting bytes.
CREATE TABLE IF NOT EXISTS storage_budget (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  used_bytes INTEGER NOT NULL DEFAULT 0 CHECK(used_bytes >= 0),
  reserved_bytes INTEGER NOT NULL DEFAULT 0 CHECK(reserved_bytes >= 0),
  cap_bytes INTEGER NOT NULL DEFAULT 8589934592 CHECK(cap_bytes BETWEEN 1 AND 8589934592),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK(used_bytes + reserved_bytes <= cap_bytes)
);
INSERT OR IGNORE INTO storage_budget(id) VALUES(1);

CREATE TABLE IF NOT EXISTS upload_reservations (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES community_users(id) ON DELETE CASCADE,
  reserved_bytes INTEGER NOT NULL CHECK(reserved_bytes BETWEEN 1 AND 20971520),
  status TEXT NOT NULL CHECK(status IN ('reserved','committed','expired','cancelled')),
  idempotency_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_upload_reservations_expiry ON upload_reservations(status,expires_at);
