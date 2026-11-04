-- P15.4 — GitHub OAuth state and server-side sessions.
-- Staging-only migration. No real identities or credentials are included.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS oauth_flows (
  state_hash TEXT PRIMARY KEY NOT NULL CHECK(length(state_hash) = 64),
  binder_hash TEXT NOT NULL CHECK(length(binder_hash) = 64),
  pkce_verifier TEXT NOT NULL CHECK(length(pkce_verifier) BETWEEN 43 AND 128),
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_oauth_expiry ON oauth_flows(expires_at);

CREATE TABLE IF NOT EXISTS auth_sessions (
  session_hash TEXT PRIMARY KEY NOT NULL CHECK(length(session_hash) = 64),
  user_id TEXT NOT NULL REFERENCES community_users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_session_expiry ON auth_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_session_owner ON auth_sessions(user_id);

-- HMAC-hashed source-IP buckets. No raw IP address is persisted.
-- Each bucket can start at most 8 OAuth attempts per 15-minute window.
CREATE TABLE IF NOT EXISTS auth_rate_windows (
  bucket_hash TEXT PRIMARY KEY NOT NULL CHECK(length(bucket_hash) = 64),
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0 CHECK(count BETWEEN 0 AND 8)
);
