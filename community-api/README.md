# BAS Community — P15.3 secure API foundation

Status: implemented and testable offline, NOT deployed. The Cloudflare account currently has no D1 databases; R2 returns HTTP 403 asking to enable R2 in the Cloudflare Dashboard. Never enable R2 or billing automatically.

## Contents

- src/index.mjs: read-only Cloudflare module Worker with GET/HEAD /v1/health, /v1/catalog and /v1/animations/:id.
- migrations/0001_initial.sql: SQLite/D1 tables for users, identity placeholders, animations, revisions, moderation audit, global byte budget and future upload reservations.
- wrangler.example.jsonc: staging-only, intentionally invalid D1 UUID; keep private working wrangler.jsonc out of Git.
- tests/api.test.mjs: Node 20+ built-in Worker tests with fake D1.
- tests/test_schema.py: Python/SQLite schema and integrity tests.

## Security decisions (fail closed)

1. PUBLIC_CATALOG_ENABLED defaults to false and a valid DB binding is required. Unavailable catalog returns HTTP 503. Only published animations with approved versions and active creators are readable.
2. Every mutating HTTP method returns 403 in this stage, regardless of other environment variables. No uploads, moderator decisions or private downloads exist.
3. Only public metadata fields are serialized. Object storage keys, owner IDs, OAuth identifiers, hash values and private media are never returned.
4. SQL queries use prepared bindings and a strict sort whitelist. Max page size 24, offset 5000, search 80 characters.
5. CORS is an exact-origin allowlist, never a wildcard, and is not treated as authentication. JSON responses are uncached and have defensive headers.
6. Storage budget caps at 8 GiB, intentionally below the R2 10 GB Standard free allowance; this is a schema safety constraint, NOT live usage enforcement. Atomic reservations and quota coordination are mandatory before upload routes go live in P15.5.
7. SQL triggers prevent public release of non-approved or wrong-owner versions and prevent hiding or deleting an approved live version without unpublishing first.
8. Public source branch: never commit tokens, actual user information, stored files, account secrets, OAuth credentials or a working production configuration.

## Offline tests

From community-api/ run: node --test tests/api.test.mjs
And: python3 -m unittest discover -s tests -p test_schema.py

## Optional local Wrangler (no remote resources)

Copy wrangler.example.jsonc to ignored wrangler.jsonc. Install Wrangler using npm install on a machine with Node >=20.
Initialize only local D1: npx wrangler d1 migrations apply bas-community-staging --local --config wrangler.jsonc
Run locally: npx wrangler dev --config wrangler.jsonc --local
Do not use --remote or wrangler deploy until configuration, billing exposure, domain security and owner consent are reviewed.

## Future milestones

P15.4: OAuth provider, CSRF/OAuth state, PKCE, verified user ownership, secure session cookies, real profile image/banner upload and privacy policies.
P15.5: staging private R2 only after explicit owner approval; zip path/decompression safety, malware review, atomic quota reservations, rate limits, preview derivation.
P15.6-7: publication flows, downloads of approved revisions, versioning, project reuse rights and integration with editor and Companion.
P15.8-10: moderator dashboard, Discord verification and idempotency, comment/report systems.
P15.11-14: social features, privacy, performance, rollback and launch gates.

The website at http://127.0.0.1:8088/ still shows the interactive demo gallery; its JavaScript does not contact this API. Code presence alone is not a release or a deployment.

## Termux localhost API adapter (P15.3)

Node.js LTS is installed in Termux for safe local tests. The adapter is a local development tool and does not enable public Cloudflare routes.

From community-api/, run: node --test tests/*.test.mjs
Run locally: node dev-server.mjs
Local read-only health endpoint: http://127.0.0.1:8788/v1/health
Local catalog defaults to disabled. With BAS_LOCAL_CATALOG_ENABLED=1, approved-only catalog reads may be tested against the local SQLite DB; writes are still always locked.
The API binds exclusively to 127.0.0.1, port 8788. It initializes .local/community.sqlite from the D1 migration. This database is git-ignored and is never sent to Cloudflare.
The development adapter is not a substitute for real authentication, moderation, ZIP scanning or rate limiting. Do not expose its port through a Tunnel or publish it.
