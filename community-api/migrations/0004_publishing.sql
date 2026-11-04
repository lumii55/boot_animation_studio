-- BAS Community P15.6 staging publishing pipeline: all new objects private and review-pending.
-- This migration does NOT turn on uploads, accounts, or any public Worker routes.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS animation_rights (
  animation_id TEXT PRIMARY KEY NOT NULL REFERENCES animations(id) ON DELETE CASCADE,
  license TEXT NOT NULL CHECK(license IN ('CC0-1.0','CC-BY-4.0','CC-BY-SA-4.0','all-rights-reserved')),
  author_credit TEXT NOT NULL DEFAULT '' CHECK(length(author_credit)<=120),
  allows_remix INTEGER NOT NULL CHECK(allows_remix IN (0,1)),
  rights_confirmed_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS publication_drafts (
  id TEXT PRIMARY KEY NOT NULL CHECK(length(id)=32),
  owner_id TEXT NOT NULL REFERENCES community_users(id) ON DELETE RESTRICT,
  animation_id TEXT NOT NULL UNIQUE REFERENCES animations(id) ON DELETE RESTRICT,
  reservation_id TEXT NOT NULL UNIQUE REFERENCES upload_reservations(id) ON DELETE RESTRICT,
  source TEXT NOT NULL CHECK(source IN ('editor','zip','companion')),
  status TEXT NOT NULL DEFAULT 'awaiting_upload'
    CHECK(status IN ('awaiting_upload','processing','pending_review','failed','cancelled')),
  filename TEXT NOT NULL CHECK(length(filename) BETWEEN 1 AND 90),
  expected_bytes INTEGER NOT NULL CHECK(expected_bytes BETWEEN 1 AND 20971520),
  request_hash TEXT NOT NULL CHECK(length(request_hash)=64),
  version_id TEXT UNIQUE REFERENCES animation_versions(id) ON DELETE SET NULL,
  object_key TEXT UNIQUE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_publication_owner_recent ON publication_drafts(owner_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_publication_expiry ON publication_drafts(status,expires_at);

CREATE TRIGGER IF NOT EXISTS trg_draft_owner
BEFORE INSERT ON publication_drafts
WHEN
  NOT EXISTS(SELECT 1 FROM animations a WHERE a.id=NEW.animation_id AND a.owner_id=NEW.owner_id AND a.status='draft')
  OR NOT EXISTS(SELECT 1 FROM upload_reservations r WHERE r.id=NEW.reservation_id AND r.user_id=NEW.owner_id AND r.status='reserved'
      AND r.reserved_bytes=NEW.expected_bytes AND r.expires_at=NEW.expires_at)
BEGIN SELECT RAISE(ABORT,'publication owner/reservation mismatch'); END;

CREATE TRIGGER IF NOT EXISTS trg_draft_no_reassignment
BEFORE UPDATE ON publication_drafts
WHEN NEW.owner_id!=OLD.owner_id OR NEW.animation_id!=OLD.animation_id OR NEW.reservation_id!=OLD.reservation_id
 OR NEW.source!=OLD.source OR NEW.expected_bytes!=OLD.expected_bytes OR NEW.request_hash!=OLD.request_hash
 OR NEW.expires_at!=OLD.expires_at OR NEW.filename!=OLD.filename
BEGIN SELECT RAISE(ABORT,'immutable publication identity'); END;

CREATE TRIGGER IF NOT EXISTS trg_draft_valid_transition
BEFORE UPDATE OF status ON publication_drafts
WHEN NOT (
  (OLD.status='awaiting_upload' AND NEW.status IN ('processing','cancelled','failed'))
  OR (OLD.status='processing' AND NEW.status IN ('pending_review','failed'))
  OR (OLD.status=NEW.status)
)
BEGIN SELECT RAISE(ABORT,'invalid publication status transition'); END;

-- THIS tracks only this application's controlled bucket operations.
-- It cannot limit other buckets or manual operations in the same Cloudflare account.
CREATE TABLE IF NOT EXISTS r2_operation_budget (
  month TEXT PRIMARY KEY NOT NULL CHECK(length(month)=7 AND month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
  class_a INTEGER NOT NULL DEFAULT 0 CHECK(class_a BETWEEN 0 AND 10000),
  class_b INTEGER NOT NULL DEFAULT 0 CHECK(class_b BETWEEN 0 AND 10000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
