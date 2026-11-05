-- P15.7 — real creator tags, safe search, bounded reports and notifications.
-- Does not enable public catalog. Staging remains account-gated.
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS animation_search (
  animation_id TEXT PRIMARY KEY NOT NULL REFERENCES animations(id) ON DELETE CASCADE,
  title_fold TEXT NOT NULL CHECK(length(title_fold)<=220),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
INSERT OR IGNORE INTO animation_search(animation_id,title_fold)
  SELECT id,lower(title) FROM animations;
CREATE INDEX IF NOT EXISTS idx_search_title ON animation_search(title_fold);

CREATE TABLE IF NOT EXISTS animation_tags (
  animation_id TEXT NOT NULL REFERENCES animations(id) ON DELETE CASCADE,
  tag TEXT NOT NULL CHECK(length(tag) BETWEEN 1 AND 32 AND tag NOT GLOB '*[^a-z0-9_-]*'),
  PRIMARY KEY(animation_id,tag)
);
CREATE INDEX IF NOT EXISTS idx_tags_lookup ON animation_tags(tag,animation_id);
CREATE TRIGGER IF NOT EXISTS trg_tags_limit BEFORE INSERT ON animation_tags
WHEN (SELECT COUNT(*) FROM animation_tags WHERE animation_id=NEW.animation_id)>=12
BEGIN SELECT RAISE(ABORT,'too many tags'); END;

CREATE TABLE IF NOT EXISTS community_reports (
  id TEXT PRIMARY KEY NOT NULL CHECK(length(id)=32),
  animation_id TEXT NOT NULL REFERENCES animations(id) ON DELETE RESTRICT,
  reporter_id TEXT NOT NULL REFERENCES community_users(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL CHECK(length(reason) BETWEEN 5 AND 500),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved','dismissed')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  resolved_at INTEGER,
  UNIQUE(animation_id,reporter_id)
);
CREATE INDEX IF NOT EXISTS idx_reports_status ON community_reports(status,created_at DESC);
CREATE TRIGGER IF NOT EXISTS trg_report_limit BEFORE INSERT ON community_reports
WHEN (SELECT COUNT(*) FROM community_reports
 WHERE reporter_id=NEW.reporter_id AND created_at>=unixepoch()-86400)>=5
BEGIN SELECT RAISE(ABORT,'daily report limit'); END;

CREATE TABLE IF NOT EXISTS discord_outbox (
  id TEXT PRIMARY KEY NOT NULL CHECK(length(id)=32),
  animation_id TEXT NOT NULL REFERENCES animations(id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK(action IN ('approve','reject','hide','report')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','delivered','skipped','failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  processed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_discord_queue ON discord_outbox(status,created_at);
