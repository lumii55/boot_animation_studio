-- P15 social beta: text/emoji-only discussion, idempotent engagement, provenance.
-- Additive; no existing animation, account, version or moderation row is removed.
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS animation_likes (
 animation_id TEXT NOT NULL REFERENCES animations(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES community_users(id) ON DELETE CASCADE,
 created_at INTEGER NOT NULL DEFAULT (unixepoch()),
 PRIMARY KEY(animation_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_animation_likes_user ON animation_likes(user_id,created_at DESC);
CREATE TRIGGER IF NOT EXISTS trg_animation_like_insert AFTER INSERT ON animation_likes
 BEGIN UPDATE animations SET like_count=(SELECT COUNT(*) FROM animation_likes WHERE animation_id=NEW.animation_id)
 WHERE id=NEW.animation_id; END;
CREATE TRIGGER IF NOT EXISTS trg_animation_like_delete AFTER DELETE ON animation_likes
 BEGIN UPDATE animations SET like_count=(SELECT COUNT(*) FROM animation_likes WHERE animation_id=OLD.animation_id)
 WHERE id=OLD.animation_id; END;
CREATE TABLE IF NOT EXISTS creator_follows (
 follower_id TEXT NOT NULL REFERENCES community_users(id) ON DELETE CASCADE,
 creator_id TEXT NOT NULL REFERENCES community_users(id) ON DELETE CASCADE,
 created_at INTEGER NOT NULL DEFAULT (unixepoch()),
 PRIMARY KEY(follower_id,creator_id),
 CHECK(follower_id<>creator_id)
);
CREATE INDEX IF NOT EXISTS idx_creator_follows_creator ON creator_follows(creator_id,created_at DESC);
CREATE TABLE IF NOT EXISTS community_comments (
 id TEXT PRIMARY KEY NOT NULL CHECK(length(id)=32),
 animation_id TEXT NOT NULL REFERENCES animations(id) ON DELETE RESTRICT,
 author_id TEXT NOT NULL REFERENCES community_users(id) ON DELETE RESTRICT,
 content TEXT NOT NULL CHECK(length(trim(content)) BETWEEN 1 AND 600),
 status TEXT NOT NULL DEFAULT 'visible' CHECK(status IN ('visible','hidden','removed')),
 created_at INTEGER NOT NULL DEFAULT (unixepoch()),
 updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_comments_animation ON community_comments(animation_id,status,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_comments_author ON community_comments(author_id,created_at DESC);
CREATE TRIGGER IF NOT EXISTS trg_comment_rate BEFORE INSERT ON community_comments
 WHEN (SELECT COUNT(*) FROM community_comments WHERE author_id=NEW.author_id AND created_at>unixepoch()-86400)>=30
 OR EXISTS(SELECT 1 FROM community_comments WHERE author_id=NEW.author_id AND created_at>unixepoch()-12)
 BEGIN SELECT RAISE(ABORT,'comment_rate_limited'); END;
CREATE TABLE IF NOT EXISTS comment_likes (
 comment_id TEXT NOT NULL REFERENCES community_comments(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES community_users(id) ON DELETE CASCADE,
 created_at INTEGER NOT NULL DEFAULT (unixepoch()),
 PRIMARY KEY(comment_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_comment_likes_user ON comment_likes(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS comment_reports (
 id TEXT PRIMARY KEY NOT NULL CHECK(length(id)=32),
 comment_id TEXT NOT NULL REFERENCES community_comments(id) ON DELETE RESTRICT,
 reporter_id TEXT NOT NULL REFERENCES community_users(id) ON DELETE RESTRICT,
 reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 5 AND 500),
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','dismissed','resolved')),
 created_at INTEGER NOT NULL DEFAULT (unixepoch()),
 reviewed_at INTEGER,
 UNIQUE(comment_id,reporter_id)
);
CREATE INDEX IF NOT EXISTS idx_comment_reports_open ON comment_reports(status,created_at);
CREATE TRIGGER IF NOT EXISTS trg_comment_report_rate BEFORE INSERT ON comment_reports
 WHEN (SELECT COUNT(*) FROM comment_reports WHERE reporter_id=NEW.reporter_id AND created_at>unixepoch()-86400)>=5
 BEGIN SELECT RAISE(ABORT,'comment_report_rate_limited'); END;
CREATE TABLE IF NOT EXISTS animation_remixes (
 animation_id TEXT PRIMARY KEY NOT NULL REFERENCES animations(id) ON DELETE RESTRICT,
 source_animation_id TEXT NOT NULL REFERENCES animations(id) ON DELETE RESTRICT,
 source_version_id TEXT NOT NULL REFERENCES animation_versions(id) ON DELETE RESTRICT,
 source_license TEXT NOT NULL CHECK(source_license IN ('CC-BY-4.0','CC-BY-SA-4.0','CC0-1.0')),
 created_at INTEGER NOT NULL DEFAULT (unixepoch()),
 CHECK(animation_id<>source_animation_id)
);
CREATE INDEX IF NOT EXISTS idx_remixes_origin ON animation_remixes(source_animation_id,created_at DESC);
CREATE TRIGGER IF NOT EXISTS trg_remix_source_guard BEFORE INSERT ON animation_remixes
 WHEN NOT EXISTS (
  SELECT 1 FROM animations a JOIN animation_rights r ON r.animation_id=a.id
  JOIN animation_versions v ON v.id=a.published_version_id
  WHERE a.id=NEW.source_animation_id AND a.status='published' AND v.status='approved'
   AND r.allows_remix=1 AND r.license=NEW.source_license AND v.id=NEW.source_version_id
 ) BEGIN SELECT RAISE(ABORT,'remix_source_not_licensed'); END;
