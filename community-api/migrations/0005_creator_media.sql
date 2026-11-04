-- P15.6 private avatar/banner media and usage budgets. No public read access.
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS creator_media (
  id TEXT PRIMARY KEY CHECK(length(id)=32),
  owner_id TEXT NOT NULL REFERENCES community_users(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK(kind IN ('avatar','banner')),
  object_key TEXT NOT NULL UNIQUE CHECK(length(object_key) BETWEEN 40 AND 150),
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK(status IN ('processing','active','delete_pending','deleted','failed')),
  size_bytes INTEGER NOT NULL DEFAULT 0 CHECK(size_bytes BETWEEN 0 AND 524288),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_creator_media_owner ON creator_media(owner_id,kind,status);
CREATE INDEX IF NOT EXISTS idx_creator_media_cleanup ON creator_media(status,updated_at);

CREATE TABLE IF NOT EXISTS creator_media_current (
  user_id TEXT NOT NULL REFERENCES community_users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('avatar','banner')),
  media_id TEXT NOT NULL UNIQUE REFERENCES creator_media(id) ON DELETE RESTRICT,
  PRIMARY KEY(user_id,kind)
);

CREATE TABLE IF NOT EXISTS media_transform_budget (
  month TEXT PRIMARY KEY CHECK(length(month)=7 AND month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
  count INTEGER NOT NULL CHECK(count BETWEEN 0 AND 200)
);
CREATE TRIGGER IF NOT EXISTS trg_media_daily_rate
BEFORE INSERT ON creator_media
WHEN (SELECT COUNT(*) FROM creator_media WHERE owner_id=NEW.owner_id
      AND created_at>=unixepoch()-86400)>=8
 OR EXISTS(SELECT 1 FROM creator_media WHERE owner_id=NEW.owner_id AND kind=NEW.kind AND status='processing')
 OR NEW.status!='processing'
BEGIN SELECT RAISE(ABORT,'media rate or state exceeded'); END;

CREATE TRIGGER IF NOT EXISTS trg_media_budget_reserve
BEFORE INSERT ON creator_media
BEGIN
 UPDATE storage_budget SET reserved_bytes=reserved_bytes+524288,updated_at=unixepoch()
 WHERE id=1 AND used_bytes+reserved_bytes+524288<=cap_bytes;
 SELECT CASE WHEN changes()!=1 THEN RAISE(ABORT,'global media storage cap') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_media_status_guard
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

CREATE TRIGGER IF NOT EXISTS trg_media_budget_commit
AFTER UPDATE OF status ON creator_media
WHEN OLD.status='processing' AND NEW.status IN ('active','failed')
BEGIN
 UPDATE storage_budget SET reserved_bytes=reserved_bytes-524288,
   used_bytes=used_bytes+CASE WHEN NEW.status='active' THEN NEW.size_bytes ELSE 0 END,
   updated_at=unixepoch() WHERE id=1;
END;

CREATE TRIGGER IF NOT EXISTS trg_media_budget_delete
AFTER UPDATE OF status ON creator_media
WHEN OLD.status='delete_pending' AND NEW.status='deleted'
BEGIN
 UPDATE storage_budget SET used_bytes=used_bytes-OLD.size_bytes,updated_at=unixepoch()
 WHERE id=1 AND used_bytes>=OLD.size_bytes;
 SELECT CASE WHEN changes()!=1 THEN RAISE(ABORT,'media ledger drift') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_media_current_consistency
BEFORE INSERT ON creator_media_current
WHEN NOT EXISTS(SELECT 1 FROM creator_media m WHERE m.id=NEW.media_id
  AND m.owner_id=NEW.user_id AND m.kind=NEW.kind AND m.status='active')
BEGIN SELECT RAISE(ABORT,'invalid media reference'); END;

CREATE TRIGGER IF NOT EXISTS trg_media_current_update_consistency
BEFORE UPDATE ON creator_media_current
WHEN NEW.user_id!=OLD.user_id OR NEW.kind!=OLD.kind
 OR NOT EXISTS(SELECT 1 FROM creator_media m WHERE m.id=NEW.media_id
  AND m.owner_id=NEW.user_id AND m.kind=NEW.kind AND m.status='active')
BEGIN SELECT RAISE(ABORT,'invalid media reference'); END;
