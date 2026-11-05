-- BAS P15.7: GitHub OAuth handoff from backend to trusted local BAS client.
-- Never store full access tokens in plaintext. One-time grants expire after 120 s.
ALTER TABLE oauth_flows ADD COLUMN local_origin TEXT;
ALTER TABLE oauth_flows ADD COLUMN local_return_path TEXT;
ALTER TABLE oauth_flows ADD COLUMN local_challenge TEXT;
CREATE TABLE IF NOT EXISTS oauth_local_grants (
  grant_hash TEXT PRIMARY KEY NOT NULL CHECK(length(grant_hash)=64),
  user_id TEXT NOT NULL REFERENCES community_users(id) ON DELETE CASCADE,
  local_origin TEXT NOT NULL CHECK(length(local_origin) BETWEEN 10 AND 180),
  verifier_challenge TEXT NOT NULL CHECK(length(verifier_challenge)=43),
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_local_grants_expiry ON oauth_local_grants(expires_at);
