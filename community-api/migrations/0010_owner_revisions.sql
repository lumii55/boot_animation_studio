-- BAS P15.7 private owner management. Existing published revision remains live
-- while a proposed metadata and/or ZIP replacement awaits human approval.
-- Only additive schema; do not rewrite publication_drafts or old animations.
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS owner_revisions (
 id TEXT PRIMARY KEY NOT NULL CHECK(length(id)=32),
 animation_id TEXT NOT NULL REFERENCES animations(id) ON DELETE RESTRICT,
 owner_id TEXT NOT NULL REFERENCES community_users(id) ON DELETE RESTRICT,
 base_version_id TEXT NOT NULL REFERENCES animation_versions(id) ON DELETE RESTRICT,
 status TEXT NOT NULL CHECK(status IN
  ('awaiting_upload','processing','pending_review','approved','rejected','cancelled','failed')),
 title TEXT NOT NULL CHECK(length(title) BETWEEN 3 AND 100),
 summary TEXT NOT NULL DEFAULT '' CHECK(length(summary)<=1000),
 category TEXT NOT NULL DEFAULT 'abstract',
 license TEXT NOT NULL CHECK(license IN ('CC0-1.0','CC-BY-4.0','CC-BY-SA-4.0','all-rights-reserved')),
 author_credit TEXT NOT NULL DEFAULT '' CHECK(length(author_credit)<=120),
 allows_remix INTEGER NOT NULL CHECK(allows_remix IN (0,1)),
 tags_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(tags_json)),
 expected_bytes INTEGER CHECK(expected_bytes BETWEEN 1 AND 20971520),
 reservation_id TEXT UNIQUE REFERENCES upload_reservations(id) ON DELETE RESTRICT,
 version_id TEXT UNIQUE REFERENCES animation_versions(id) ON DELETE SET NULL,
 object_key TEXT UNIQUE,
 idempotency_hash TEXT NOT NULL UNIQUE CHECK(length(idempotency_hash)=64),
 request_hash TEXT NOT NULL CHECK(length(request_hash)=64),
 expires_at INTEGER,
 created_at INTEGER NOT NULL DEFAULT (unixepoch()),
 updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
 CHECK((expected_bytes IS NULL AND reservation_id IS NULL AND expires_at IS NULL AND status!='awaiting_upload' AND status!='processing') OR
       (expected_bytes IS NOT NULL AND reservation_id IS NOT NULL AND expires_at IS NOT NULL)),
 CHECK((license='all-rights-reserved' AND allows_remix=0) OR
       (license!='all-rights-reserved' AND allows_remix=1))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_owner_revision ON owner_revisions(animation_id)
 WHERE status IN ('awaiting_upload','processing','pending_review');
CREATE INDEX IF NOT EXISTS idx_owner_revisions_queue ON owner_revisions(status,created_at);
CREATE INDEX IF NOT EXISTS idx_owner_revisions_owner ON owner_revisions(owner_id,created_at DESC);
CREATE TRIGGER IF NOT EXISTS trg_owner_revision_insert BEFORE INSERT ON owner_revisions
 WHEN NOT EXISTS(SELECT 1 FROM animations a JOIN animation_versions v
  ON v.id=a.published_version_id AND v.status='approved'
  WHERE a.id=NEW.animation_id AND a.owner_id=NEW.owner_id
  AND a.status='published' AND a.published_version_id=NEW.base_version_id)
 OR (NEW.expected_bytes IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM upload_reservations r WHERE r.id=NEW.reservation_id
  AND r.user_id=NEW.owner_id AND r.status='reserved'
  AND r.reserved_bytes=NEW.expected_bytes AND r.expires_at=NEW.expires_at))
 BEGIN SELECT RAISE(ABORT,'invalid owner revision'); END;
CREATE TRIGGER IF NOT EXISTS trg_owner_revision_immutable BEFORE UPDATE ON owner_revisions
 WHEN NEW.animation_id!=OLD.animation_id OR NEW.owner_id!=OLD.owner_id
 OR NEW.base_version_id!=OLD.base_version_id OR NEW.title!=OLD.title
 OR NEW.summary!=OLD.summary OR NEW.category!=OLD.category OR NEW.license!=OLD.license
 OR NEW.author_credit!=OLD.author_credit OR NEW.allows_remix!=OLD.allows_remix
 OR NEW.tags_json!=OLD.tags_json OR NEW.idempotency_hash!=OLD.idempotency_hash
 OR NEW.request_hash!=OLD.request_hash
 OR NEW.expected_bytes IS NOT OLD.expected_bytes
 OR NEW.reservation_id IS NOT OLD.reservation_id
 OR NEW.expires_at IS NOT OLD.expires_at
 BEGIN SELECT RAISE(ABORT,'immutable owner revision'); END;
CREATE TRIGGER IF NOT EXISTS trg_owner_revision_transitions BEFORE UPDATE OF status ON owner_revisions
 WHEN NOT (OLD.status=NEW.status OR
 (OLD.status='awaiting_upload' AND NEW.status IN ('processing','cancelled','failed')) OR
 (OLD.status='processing' AND NEW.status IN ('pending_review','failed')) OR
 (OLD.status='pending_review' AND NEW.status IN ('approved','rejected','cancelled')))
 BEGIN SELECT RAISE(ABORT,'invalid revision transition'); END;
CREATE TRIGGER IF NOT EXISTS trg_owner_revision_no_approval_on_removed BEFORE UPDATE OF status ON owner_revisions
 WHEN NEW.status='approved' AND
 NOT EXISTS(SELECT 1 FROM animations a WHERE a.id=NEW.animation_id
 AND a.status='published' AND a.published_version_id=NEW.base_version_id)
 BEGIN SELECT RAISE(ABORT,'owner revision superseded'); END;
CREATE TRIGGER IF NOT EXISTS trg_remove_while_owner_upload BEFORE UPDATE OF status ON animations
 WHEN NEW.status='removed' AND EXISTS(SELECT 1 FROM owner_revisions r
  WHERE r.animation_id=NEW.id AND r.status='processing')
 BEGIN SELECT RAISE(ABORT,'upload in progress'); END;
