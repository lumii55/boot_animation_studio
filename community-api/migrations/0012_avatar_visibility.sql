-- BAS Community: public avatars are opt-in; existing account media remains private.
ALTER TABLE community_users ADD COLUMN avatar_public INTEGER NOT NULL DEFAULT 0 CHECK(avatar_public IN (0,1));
CREATE INDEX IF NOT EXISTS idx_users_avatar_public ON community_users(avatar_public,status);
