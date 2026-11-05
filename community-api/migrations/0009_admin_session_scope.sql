-- Distinct server-enforced privilege for administrator sign-in sessions.
-- Legacy and normal BAS sessions always default to the unprivileged client.
ALTER TABLE auth_sessions ADD COLUMN client_kind TEXT NOT NULL DEFAULT 'bas'
  CHECK(client_kind IN ('bas','admin'));
