-- BAS P15.7: 9 GB decimal storage and 40 MiB compressed ZIP.
-- Preserve data, triggers, all foreign keys and moderation audit.
PRAGMA defer_foreign_keys = ON;
DROP TRIGGER IF EXISTS "trg_animation_like_delete";
DROP TRIGGER IF EXISTS "trg_animation_like_insert";
DROP TRIGGER IF EXISTS "trg_comment_rate";
DROP TRIGGER IF EXISTS "trg_comment_report_rate";
DROP TRIGGER IF EXISTS "trg_discord_new_comment_report";
DROP TRIGGER IF EXISTS "trg_discord_new_post_report";
DROP TRIGGER IF EXISTS "trg_discord_new_publication";
DROP TRIGGER IF EXISTS "trg_discord_new_revision";
DROP TRIGGER IF EXISTS "trg_draft_no_reassignment";
DROP TRIGGER IF EXISTS "trg_draft_owner";
DROP TRIGGER IF EXISTS "trg_draft_valid_transition";
DROP TRIGGER IF EXISTS "trg_media_budget_commit";
DROP TRIGGER IF EXISTS "trg_media_budget_delete";
DROP TRIGGER IF EXISTS "trg_media_budget_reserve";
DROP TRIGGER IF EXISTS "trg_media_current_consistency";
DROP TRIGGER IF EXISTS "trg_media_current_update_consistency";
DROP TRIGGER IF EXISTS "trg_media_daily_rate";
DROP TRIGGER IF EXISTS "trg_media_status_guard";
DROP TRIGGER IF EXISTS "trg_owner_revision_immutable";
DROP TRIGGER IF EXISTS "trg_owner_revision_insert";
DROP TRIGGER IF EXISTS "trg_owner_revision_no_approval_on_removed";
DROP TRIGGER IF EXISTS "trg_owner_revision_transitions";
DROP TRIGGER IF EXISTS "trg_publish_insert";
DROP TRIGGER IF EXISTS "trg_publish_update";
DROP TRIGGER IF EXISTS "trg_remix_source_guard";
DROP TRIGGER IF EXISTS "trg_remove_while_owner_upload";
DROP TRIGGER IF EXISTS "trg_report_limit";
DROP TRIGGER IF EXISTS "trg_reservation_charge";
DROP TRIGGER IF EXISTS "trg_reservation_keep_history";
DROP TRIGGER IF EXISTS "trg_reservation_limit_user";
DROP TRIGGER IF EXISTS "trg_reservation_only_new";
DROP TRIGGER IF EXISTS "trg_reservation_release";
DROP TRIGGER IF EXISTS "trg_reservation_transition";
DROP TRIGGER IF EXISTS "trg_tags_limit";
DROP TRIGGER IF EXISTS "trg_version_delete_live";
DROP TRIGGER IF EXISTS "trg_version_unapprove";
CREATE TABLE "_bas_upgrade_animation_versions"(id TEXT PRIMARY KEY,value INTEGER);
INSERT INTO "_bas_upgrade_animation_versions"(id,value) SELECT id,size_bytes FROM animation_versions;
ALTER TABLE animation_versions DROP COLUMN size_bytes;
ALTER TABLE animation_versions ADD COLUMN size_bytes INTEGER NOT NULL DEFAULT 1 CHECK(size_bytes BETWEEN 1 AND 41943040);
UPDATE animation_versions SET size_bytes=(SELECT value FROM "_bas_upgrade_animation_versions" WHERE "_bas_upgrade_animation_versions".id=animation_versions.id);
DROP TABLE "_bas_upgrade_animation_versions";
CREATE TABLE "_bas_upgrade_upload_reservations"(id TEXT PRIMARY KEY,value INTEGER);
INSERT INTO "_bas_upgrade_upload_reservations"(id,value) SELECT id,reserved_bytes FROM upload_reservations;
ALTER TABLE upload_reservations DROP COLUMN reserved_bytes;
ALTER TABLE upload_reservations ADD COLUMN reserved_bytes INTEGER NOT NULL DEFAULT 1 CHECK(reserved_bytes BETWEEN 1 AND 41943040);
UPDATE upload_reservations SET reserved_bytes=(SELECT value FROM "_bas_upgrade_upload_reservations" WHERE "_bas_upgrade_upload_reservations".id=upload_reservations.id);
DROP TABLE "_bas_upgrade_upload_reservations";
CREATE TABLE "_bas_upgrade_publication_drafts"(id TEXT PRIMARY KEY,value INTEGER);
INSERT INTO "_bas_upgrade_publication_drafts"(id,value) SELECT id,expected_bytes FROM publication_drafts;
ALTER TABLE publication_drafts DROP COLUMN expected_bytes;
ALTER TABLE publication_drafts ADD COLUMN expected_bytes INTEGER NOT NULL DEFAULT 1 CHECK(expected_bytes BETWEEN 1 AND 41943040);
UPDATE publication_drafts SET expected_bytes=(SELECT value FROM "_bas_upgrade_publication_drafts" WHERE "_bas_upgrade_publication_drafts".id=publication_drafts.id);
DROP TABLE "_bas_upgrade_publication_drafts";
CREATE TABLE owner_revisions_new (
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
 expected_bytes INTEGER CHECK(expected_bytes BETWEEN 1 AND 41943040),
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
INSERT INTO owner_revisions_new("id","animation_id","owner_id","base_version_id","status","title","summary","category","license","author_credit","allows_remix","tags_json","expected_bytes","reservation_id","version_id","object_key","idempotency_hash","request_hash","expires_at","created_at","updated_at") SELECT "id","animation_id","owner_id","base_version_id","status","title","summary","category","license","author_credit","allows_remix","tags_json","expected_bytes","reservation_id","version_id","object_key","idempotency_hash","request_hash","expires_at","created_at","updated_at" FROM owner_revisions;
DROP TABLE owner_revisions;
ALTER TABLE owner_revisions_new RENAME TO owner_revisions;
CREATE UNIQUE INDEX idx_one_active_owner_revision ON owner_revisions(animation_id)
 WHERE status IN ('awaiting_upload','processing','pending_review');
CREATE INDEX idx_owner_revisions_owner ON owner_revisions(owner_id,created_at DESC);
CREATE INDEX idx_owner_revisions_queue ON owner_revisions(status,created_at);
CREATE TABLE storage_budget_new (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  used_bytes INTEGER NOT NULL DEFAULT 0 CHECK(used_bytes >= 0),
  reserved_bytes INTEGER NOT NULL DEFAULT 0 CHECK(reserved_bytes >= 0),
  cap_bytes INTEGER NOT NULL DEFAULT 9000000000 CHECK(cap_bytes BETWEEN 1 AND 9000000000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK(used_bytes + reserved_bytes <= cap_bytes)
);
INSERT INTO storage_budget_new(id,used_bytes,reserved_bytes,cap_bytes,updated_at) SELECT id,used_bytes,reserved_bytes,9000000000,updated_at FROM storage_budget;
DROP TABLE storage_budget;
ALTER TABLE storage_budget_new RENAME TO storage_budget;
CREATE TRIGGER trg_animation_like_delete AFTER DELETE ON animation_likes
 BEGIN UPDATE animations SET like_count=(SELECT COUNT(*) FROM animation_likes WHERE animation_id=OLD.animation_id)
 WHERE id=OLD.animation_id; END;
CREATE TRIGGER trg_animation_like_insert AFTER INSERT ON animation_likes
 BEGIN UPDATE animations SET like_count=(SELECT COUNT(*) FROM animation_likes WHERE animation_id=NEW.animation_id)
 WHERE id=NEW.animation_id; END;
CREATE TRIGGER trg_comment_rate BEFORE INSERT ON community_comments
 WHEN (SELECT COUNT(*) FROM community_comments WHERE author_id=NEW.author_id AND created_at>unixepoch()-86400)>=30
 OR EXISTS(SELECT 1 FROM community_comments WHERE author_id=NEW.author_id AND created_at>unixepoch()-12)
 BEGIN SELECT RAISE(ABORT,'comment_rate_limited'); END;
CREATE TRIGGER trg_comment_report_rate BEFORE INSERT ON comment_reports
 WHEN (SELECT COUNT(*) FROM comment_reports WHERE reporter_id=NEW.reporter_id AND created_at>unixepoch()-86400)>=5
 BEGIN SELECT RAISE(ABORT,'comment_report_rate_limited'); END;
CREATE TRIGGER trg_discord_new_comment_report AFTER INSERT ON comment_reports
BEGIN
 INSERT OR IGNORE INTO discord_admin_events(event_id,kind,source_id)
 VALUES('comment_report:'||NEW.id,'comment_report',NEW.id);
END;
CREATE TRIGGER trg_discord_new_post_report AFTER INSERT ON community_reports
BEGIN
 INSERT OR IGNORE INTO discord_admin_events(event_id,kind,source_id)
 VALUES('post_report:'||NEW.id,'post_report',NEW.id);
END;
CREATE TRIGGER trg_discord_new_publication AFTER UPDATE OF status ON publication_drafts
WHEN NEW.status='pending_review' AND OLD.status!='pending_review'
BEGIN
 INSERT OR IGNORE INTO discord_admin_events(event_id,kind,source_id)
 VALUES('publication:'||NEW.animation_id,'publication',NEW.animation_id);
END;
CREATE TRIGGER trg_discord_new_revision AFTER UPDATE OF status ON owner_revisions
WHEN NEW.status='pending_review' AND OLD.status!='pending_review'
BEGIN
 INSERT OR IGNORE INTO discord_admin_events(event_id,kind,source_id)
 VALUES('revision:'||NEW.id,'revision',NEW.id);
END;
CREATE TRIGGER trg_draft_no_reassignment
BEFORE UPDATE ON publication_drafts
WHEN NEW.owner_id!=OLD.owner_id OR NEW.animation_id!=OLD.animation_id OR NEW.reservation_id!=OLD.reservation_id
 OR NEW.source!=OLD.source OR NEW.expected_bytes!=OLD.expected_bytes OR NEW.request_hash!=OLD.request_hash
 OR NEW.expires_at!=OLD.expires_at OR NEW.filename!=OLD.filename
BEGIN SELECT RAISE(ABORT,'immutable publication identity'); END;
CREATE TRIGGER trg_draft_owner
BEFORE INSERT ON publication_drafts
WHEN
  NOT EXISTS(SELECT 1 FROM animations a WHERE a.id=NEW.animation_id AND a.owner_id=NEW.owner_id AND a.status='draft')
  OR NOT EXISTS(SELECT 1 FROM upload_reservations r WHERE r.id=NEW.reservation_id AND r.user_id=NEW.owner_id AND r.status='reserved'
      AND r.reserved_bytes=NEW.expected_bytes AND r.expires_at=NEW.expires_at)
BEGIN SELECT RAISE(ABORT,'publication owner/reservation mismatch'); END;
CREATE TRIGGER trg_draft_valid_transition
BEFORE UPDATE OF status ON publication_drafts
WHEN NOT (
  (OLD.status='awaiting_upload' AND NEW.status IN ('processing','cancelled','failed'))
  OR (OLD.status='processing' AND NEW.status IN ('pending_review','failed'))
  OR (OLD.status=NEW.status)
)
BEGIN SELECT RAISE(ABORT,'invalid publication status transition'); END;
CREATE TRIGGER trg_media_budget_commit
AFTER UPDATE OF status ON creator_media
WHEN OLD.status='processing' AND NEW.status IN ('active','failed')
BEGIN
 UPDATE storage_budget SET reserved_bytes=reserved_bytes-524288,
   used_bytes=used_bytes+CASE WHEN NEW.status='active' THEN NEW.size_bytes ELSE 0 END,
   updated_at=unixepoch() WHERE id=1;
END;
CREATE TRIGGER trg_media_budget_delete
AFTER UPDATE OF status ON creator_media
WHEN OLD.status='delete_pending' AND NEW.status='deleted'
BEGIN
 UPDATE storage_budget SET used_bytes=used_bytes-OLD.size_bytes,updated_at=unixepoch()
 WHERE id=1 AND used_bytes>=OLD.size_bytes;
 SELECT CASE WHEN changes()!=1 THEN RAISE(ABORT,'media ledger drift') END;
END;
CREATE TRIGGER trg_media_budget_reserve
BEFORE INSERT ON creator_media
BEGIN
 UPDATE storage_budget SET reserved_bytes=reserved_bytes+524288,updated_at=unixepoch()
 WHERE id=1 AND used_bytes+reserved_bytes+524288<=cap_bytes;
 SELECT CASE WHEN changes()!=1 THEN RAISE(ABORT,'global media storage cap') END;
END;
CREATE TRIGGER trg_media_current_consistency
BEFORE INSERT ON creator_media_current
WHEN NOT EXISTS(SELECT 1 FROM creator_media m WHERE m.id=NEW.media_id
  AND m.owner_id=NEW.user_id AND m.kind=NEW.kind AND m.status='active')
BEGIN SELECT RAISE(ABORT,'invalid media reference'); END;
CREATE TRIGGER trg_media_current_update_consistency
BEFORE UPDATE ON creator_media_current
WHEN NEW.user_id!=OLD.user_id OR NEW.kind!=OLD.kind
 OR NOT EXISTS(SELECT 1 FROM creator_media m WHERE m.id=NEW.media_id
  AND m.owner_id=NEW.user_id AND m.kind=NEW.kind AND m.status='active')
BEGIN SELECT RAISE(ABORT,'invalid media reference'); END;
CREATE TRIGGER trg_media_daily_rate
BEFORE INSERT ON creator_media
WHEN (SELECT COUNT(*) FROM creator_media WHERE owner_id=NEW.owner_id
      AND created_at>=unixepoch()-86400)>=8
 OR EXISTS(SELECT 1 FROM creator_media WHERE owner_id=NEW.owner_id AND kind=NEW.kind AND status='processing')
 OR NEW.status!='processing'
BEGIN SELECT RAISE(ABORT,'media rate or state exceeded'); END;
CREATE TRIGGER trg_media_status_guard
BEFORE UPDATE ON creator_media
WHEN NEW.id!=OLD.id OR NEW.owner_id!=OLD.owner_id OR NEW.kind!=OLD.kind
 OR NEW.object_key!=OLD.object_key OR NEW.created_at!=OLD.created_at
 OR NOT (
  (OLD.status='processing' AND NEW.status IN ('active','failed'))
  OR (OLD.status='active' AND NEW.status='delete_pending')
  OR (OLD.status='delete_pending' AND NEW.status='deleted')
  OR NEW.status=OLD.status
 )
 OR (OLD.status='processing' AND NEW.status='active' AND NEW.size_bytes=0)
 OR (OLD.status NOT IN ('processing') AND NEW.size_bytes!=OLD.size_bytes)
BEGIN SELECT RAISE(ABORT,'invalid media transition'); END;
CREATE TRIGGER trg_owner_revision_immutable BEFORE UPDATE ON owner_revisions
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
CREATE TRIGGER trg_owner_revision_insert BEFORE INSERT ON owner_revisions
 WHEN NOT EXISTS(SELECT 1 FROM animations a JOIN animation_versions v
  ON v.id=a.published_version_id AND v.status='approved'
  WHERE a.id=NEW.animation_id AND a.owner_id=NEW.owner_id
  AND a.status='published' AND a.published_version_id=NEW.base_version_id)
 OR (NEW.expected_bytes IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM upload_reservations r WHERE r.id=NEW.reservation_id
  AND r.user_id=NEW.owner_id AND r.status='reserved'
  AND r.reserved_bytes=NEW.expected_bytes AND r.expires_at=NEW.expires_at))
 BEGIN SELECT RAISE(ABORT,'invalid owner revision'); END;
CREATE TRIGGER trg_owner_revision_no_approval_on_removed BEFORE UPDATE OF status ON owner_revisions
 WHEN NEW.status='approved' AND
 NOT EXISTS(SELECT 1 FROM animations a WHERE a.id=NEW.animation_id
 AND a.status='published' AND a.published_version_id=NEW.base_version_id)
 BEGIN SELECT RAISE(ABORT,'owner revision superseded'); END;
CREATE TRIGGER trg_owner_revision_transitions BEFORE UPDATE OF status ON owner_revisions
 WHEN NOT (OLD.status=NEW.status OR
 (OLD.status='awaiting_upload' AND NEW.status IN ('processing','cancelled','failed')) OR
 (OLD.status='processing' AND NEW.status IN ('pending_review','failed')) OR
 (OLD.status='pending_review' AND NEW.status IN ('approved','rejected','cancelled')))
 BEGIN SELECT RAISE(ABORT,'invalid revision transition'); END;
CREATE TRIGGER trg_publish_insert
BEFORE INSERT ON animations
WHEN NEW.status = 'published' AND NOT EXISTS (
  SELECT 1 FROM animation_versions v
  WHERE v.id = NEW.published_version_id AND v.animation_id = NEW.id AND v.status = 'approved'
)
BEGIN SELECT RAISE(ABORT,'published version is not approved'); END;
CREATE TRIGGER trg_publish_update
BEFORE UPDATE OF status,published_version_id ON animations
WHEN NEW.status = 'published' AND NOT EXISTS (
  SELECT 1 FROM animation_versions v
  WHERE v.id = NEW.published_version_id AND v.animation_id = NEW.id AND v.status = 'approved'
)
BEGIN SELECT RAISE(ABORT,'published version is not approved'); END;
CREATE TRIGGER trg_remix_source_guard BEFORE INSERT ON animation_remixes
 WHEN NOT EXISTS (
  SELECT 1 FROM animations a JOIN animation_rights r ON r.animation_id=a.id
  JOIN animation_versions v ON v.id=a.published_version_id
  WHERE a.id=NEW.source_animation_id AND a.status='published' AND v.status='approved'
   AND r.allows_remix=1 AND r.license=NEW.source_license AND v.id=NEW.source_version_id
 ) BEGIN SELECT RAISE(ABORT,'remix_source_not_licensed'); END;
CREATE TRIGGER trg_remove_while_owner_upload BEFORE UPDATE OF status ON animations
 WHEN NEW.status='removed' AND EXISTS(SELECT 1 FROM owner_revisions r
  WHERE r.animation_id=NEW.id AND r.status='processing')
 BEGIN SELECT RAISE(ABORT,'upload in progress'); END;
CREATE TRIGGER trg_report_limit BEFORE INSERT ON community_reports
WHEN (SELECT COUNT(*) FROM community_reports
 WHERE reporter_id=NEW.reporter_id AND created_at>=unixepoch()-86400)>=5
BEGIN SELECT RAISE(ABORT,'daily report limit'); END;
CREATE TRIGGER trg_reservation_charge
BEFORE INSERT ON upload_reservations
WHEN NEW.status='reserved'
BEGIN
  UPDATE storage_budget
  SET reserved_bytes=reserved_bytes+NEW.reserved_bytes,updated_at=unixepoch()
  WHERE id=1
    AND used_bytes+reserved_bytes+NEW.reserved_bytes<=cap_bytes;
  SELECT CASE WHEN changes()!=1
    THEN RAISE(ABORT,'global storage budget exceeded') END;
END;
CREATE TRIGGER trg_reservation_keep_history
BEFORE DELETE ON upload_reservations
BEGIN SELECT RAISE(ABORT,'reservation history cannot be deleted'); END;
CREATE TRIGGER trg_reservation_limit_user
BEFORE INSERT ON upload_reservations
WHEN
  (SELECT COUNT(*) FROM upload_reservations
   WHERE user_id=NEW.user_id AND status='reserved' AND expires_at>unixepoch())>=3
 OR
  (SELECT COALESCE(SUM(reserved_bytes),0) FROM upload_reservations
   WHERE user_id=NEW.user_id AND status='reserved' AND expires_at>unixepoch())+NEW.reserved_bytes>62914560
 OR
  (SELECT COUNT(*) FROM upload_reservations
   WHERE user_id=NEW.user_id AND created_at>=unixepoch()-86400)>=8
 OR
  (SELECT COALESCE(SUM(reserved_bytes),0) FROM upload_reservations
   WHERE user_id=NEW.user_id AND created_at>=unixepoch()-86400)+NEW.reserved_bytes>104857600
BEGIN SELECT RAISE(ABORT,'per-user quota exceeded'); END;
CREATE TRIGGER trg_reservation_only_new
BEFORE INSERT ON upload_reservations
WHEN NEW.status!='reserved'
 OR NEW.expires_at<=unixepoch()
 OR NEW.expires_at>unixepoch()+3600
BEGIN SELECT RAISE(ABORT,'invalid reservation'); END;
CREATE TRIGGER trg_reservation_release
AFTER UPDATE OF status ON upload_reservations
WHEN OLD.status='reserved'
BEGIN
  UPDATE storage_budget
  SET reserved_bytes=reserved_bytes-OLD.reserved_bytes,
    used_bytes=used_bytes+(CASE WHEN NEW.status='committed' THEN OLD.reserved_bytes ELSE 0 END),
    updated_at=unixepoch()
  WHERE id=1;
END;
CREATE TRIGGER trg_reservation_transition
BEFORE UPDATE ON upload_reservations
WHEN OLD.status!='reserved'
 OR NEW.status NOT IN ('committed','cancelled','expired')
 OR NEW.id!=OLD.id
 OR NEW.user_id!=OLD.user_id
 OR NEW.idempotency_hash!=OLD.idempotency_hash
 OR NEW.reserved_bytes!=OLD.reserved_bytes
 OR NEW.created_at!=OLD.created_at
 OR NEW.expires_at!=OLD.expires_at
BEGIN SELECT RAISE(ABORT,'invalid reservation transition'); END;
CREATE TRIGGER trg_tags_limit BEFORE INSERT ON animation_tags
WHEN (SELECT COUNT(*) FROM animation_tags WHERE animation_id=NEW.animation_id)>=12
BEGIN SELECT RAISE(ABORT,'too many tags'); END;
CREATE TRIGGER trg_version_delete_live
BEFORE DELETE ON animation_versions
WHEN EXISTS (
  SELECT 1 FROM animations a WHERE a.published_version_id=OLD.id AND a.status='published'
)
BEGIN SELECT RAISE(ABORT,'unpublish before deleting approved version'); END;
CREATE TRIGGER trg_version_unapprove
BEFORE UPDATE OF status ON animation_versions
WHEN OLD.status = 'approved' AND NEW.status != 'approved'
 AND EXISTS (
   SELECT 1 FROM animations a
   WHERE a.published_version_id=OLD.id AND a.status='published'
 )
BEGIN SELECT RAISE(ABORT,'unpublish before changing approved version'); END;
PRAGMA foreign_key_check;
PRAGMA defer_foreign_keys = OFF;
