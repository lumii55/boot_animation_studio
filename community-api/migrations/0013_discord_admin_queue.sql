-- P15.7 Discord administrative DM outbox. DISABLED until administrator configures the official bot.
-- Does NOT expose ZIPs, profile media, or contents through public URLs.
CREATE TABLE IF NOT EXISTS discord_admin_events (
 event_id TEXT PRIMARY KEY NOT NULL CHECK(length(event_id) BETWEEN 36 AND 80),
 kind TEXT NOT NULL CHECK(kind IN ('publication','revision','post_report','comment_report')),
 source_id TEXT NOT NULL CHECK(length(source_id)=32),
 state TEXT NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','sending','delivered','retry','blocked')),
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 next_attempt_at INTEGER NOT NULL DEFAULT 0,
 last_error TEXT NOT NULL DEFAULT '' CHECK(length(last_error)<=100),
 discord_message_id TEXT,
 created_at INTEGER NOT NULL DEFAULT (unixepoch()),
 delivered_at INTEGER,
 UNIQUE(kind,source_id)
);
CREATE INDEX IF NOT EXISTS idx_discord_admin_dispatch ON discord_admin_events(state,next_attempt_at,created_at);
CREATE TRIGGER IF NOT EXISTS trg_discord_new_publication AFTER UPDATE OF status ON publication_drafts
WHEN NEW.status='pending_review' AND OLD.status!='pending_review'
BEGIN
 INSERT OR IGNORE INTO discord_admin_events(event_id,kind,source_id)
 VALUES('publication:'||NEW.animation_id,'publication',NEW.animation_id);
END;
CREATE TRIGGER IF NOT EXISTS trg_discord_new_revision AFTER UPDATE OF status ON owner_revisions
WHEN NEW.status='pending_review' AND OLD.status!='pending_review'
BEGIN
 INSERT OR IGNORE INTO discord_admin_events(event_id,kind,source_id)
 VALUES('revision:'||NEW.id,'revision',NEW.id);
END;
CREATE TRIGGER IF NOT EXISTS trg_discord_new_post_report AFTER INSERT ON community_reports
BEGIN
 INSERT OR IGNORE INTO discord_admin_events(event_id,kind,source_id)
 VALUES('post_report:'||NEW.id,'post_report',NEW.id);
END;
CREATE TRIGGER IF NOT EXISTS trg_discord_new_comment_report AFTER INSERT ON comment_reports
BEGIN
 INSERT OR IGNORE INTO discord_admin_events(event_id,kind,source_id)
 VALUES('comment_report:'||NEW.id,'comment_report',NEW.id);
END;
-- Backfill all currently pending work in staging. Nobody is DM'ed before the bot is enabled.
INSERT OR IGNORE INTO discord_admin_events(event_id,kind,source_id)
 SELECT 'publication:'||animation_id,'publication',animation_id FROM publication_drafts WHERE status='pending_review';
INSERT OR IGNORE INTO discord_admin_events(event_id,kind,source_id)
 SELECT 'revision:'||id,'revision',id FROM owner_revisions WHERE status='pending_review';
INSERT OR IGNORE INTO discord_admin_events(event_id,kind,source_id)
 SELECT 'post_report:'||id,'post_report',id FROM community_reports WHERE status='open';
INSERT OR IGNORE INTO discord_admin_events(event_id,kind,source_id)
 SELECT 'comment_report:'||id,'comment_report',id FROM comment_reports WHERE status='open';
