-- P15.7 private-beta: explicit public banner consent and reliable Discord DM cleanup.
-- Preserve all existing users' private media. New users get the default-on settings at creation.
ALTER TABLE community_users ADD COLUMN banner_public INTEGER NOT NULL DEFAULT 0 CHECK(banner_public IN (0,1));
CREATE INDEX IF NOT EXISTS idx_users_banner_public ON community_users(banner_public,status);
-- Save the exact bot DM message for safe deletion after a completed moderation action.
ALTER TABLE discord_admin_events ADD COLUMN dm_channel_id TEXT;
ALTER TABLE discord_admin_events ADD COLUMN cleaned_at INTEGER;
ALTER TABLE discord_admin_events ADD COLUMN cleanup_attempts INTEGER NOT NULL DEFAULT 0 CHECK(cleanup_attempts BETWEEN 0 AND 8);
ALTER TABLE discord_admin_events ADD COLUMN cleanup_retry_at INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_discord_cleanup ON discord_admin_events(state,cleaned_at,cleanup_retry_at,created_at);
