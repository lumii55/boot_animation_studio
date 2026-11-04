# BAS Community — P15.3 secure API foundation

Status: code tested locally; **private D1 staging database now provisioned at Cloudflare**, with migrations 0001, 0002 and 0003 applied. No Worker or file uploads deployed. R2 returns HTTP 403 asking to enable its subscription in the dashboard; do not activate R2 or billing automatically.

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

## P15.4: guarded account foundation (no real login enabled)

The account code is in `src/auth.mjs` and `migrations/0002_auth.sql`; tests in `tests/auth.test.mjs`. This is a backend implementation and a **local frontend demo editor**, not a running OAuth installation. The account UI never sends data while in demo mode.

### Authentication model
- GitHub OAuth web authorization code flow with **PKCE S256**, one-time 10-minute state stored as a hash, and a separate HttpOnly OAuth binding cookie.
- Minimal requested `read:user` scope; immutable GitHub numeric subject is HMAC-hashed before storing as account identity. No GitHub tokens or email are stored.
- Random 256-bit session identifiers; only SHA-256 session hashes stored in D1; `__Host-` Secure HttpOnly SameSite=Lax cookies. Session expiry 7 days and explicit server revocation.
- Sensitive profile writes require both an exact `Origin` match and a derived CSRF token, plus body size, input type and field-length checks.
- Eight sign-in starts maximum per HMAC-hashed IP per 15-minute window. The rate table requires cleanup before wider scale.
- **Private beta allowlist:** `AUTH_BETA_GITHUB_IDS` is required to contain explicitly approved GitHub numeric user IDs; without it, a new user is rejected. Never commit the list if it could expose private testers. Public signup remains disabled unless separately approved.
- Only `/v1/auth/profile` (PATCH) and `/v1/auth/logout` (POST) can change account information, and only once every activation gate and valid session are satisfied. ZIP uploads, moderation and private downloads remain forbidden.
- A logged-in user can change display name, handle and text bio; original media upload (avatar/banner) remains blocked until P15.5 media safety and private storage review.

### Deployment blockers — do NOT bypass
1. Create/register a GitHub OAuth App and review its privacy/data handling and callback. The OAuth App client secret must be stored only as a Cloudflare encrypted Worker secret, **never in GitHub or the JavaScript frontend**.
2. Choose a genuine same-site HTTPS topology for website + API (e.g. `https://bas.example.com` + `https://api.example.com`). Current `github.io` + `workers.dev` is cross-site, and Lax session cookies will not work for the static site's API fetch; auth guards deliberately reject this topology.
3. Create a staging D1 binding with migrations 0001 and 0002, then set secret `GITHUB_CLIENT_ID` (non-secret ID may also be a regular var), `GITHUB_CLIENT_SECRET`, `AUTH_PEPPER`, `AUTH_SESSION_SECRET`, and private beta list `AUTH_BETA_GITHUB_IDS`.
4. Set `AUTH_API_ORIGIN`, `AUTH_SITE_ORIGIN` and the two **independent** flags `AUTH_ENABLED=true` and `AUTH_DEPLOYMENT_APPROVED=true` only after operator approval and external audits. Until then the routes respond HTTP 503.
5. OAuth must be tested with a registered *staging* callback and consent before accepting real users. Do not use fake OAuth credentials to imply a real account was created.

The UI at http://127.0.0.1:8088/ has a separate **My Profile · Demo** editor with synthetic avatar and banner presets. Fields are kept in JS memory only, not browser storage or Cloudflare, and reset when the page reloads.

### Tests

Run `node --test tests/*.test.mjs` and `PYTHONDONTWRITEBYTECODE=1 python -m unittest discover -s tests -p test_schema.py` from `community-api`. The OAuth tests simulate GitHub responses and never contact the real provider.

## P15.5: private upload readiness, not yet receiving uploaded ZIPs

This milestone adds src/zip-preflight.mjs (Node-only offline ZIP verifier) plus migrations/0003_upload_reservations.sql to enforce atomic budget reservations in D1/SQLite.
Tests: tests/zip-preflight.test.mjs and tests/test_upload_policy.py cover safety policies, CRC integrity, over-compression and quota enforcement.

- Admissible archives: at most 20 MiB ZIP, up to 800 entries/750 frames, only desc.txt and partN/ images, no symlinks, traversal, duplicate filenames, ZIP64, encryption, descriptors or unindexed bytes.
- Data is decompressed with bounded Node zlib and checked for CRC, declared size and file signatures. Basic desc.txt dimensions, FPS and part references are validated. This is NOT complete malicious media scanning.
- This staging library is NOT imported into the Cloudflare Worker and does NOT expose uploads. A production pipeline still requires image decoding, safe previews, compatibility tests and moderation.
- D1 triggers enforce global 8 GiB budget, max 3 outstanding reservations per user and max 8 requests per day. Atomic status changes release or commit reserved bytes. Deleting files from R2 must have an audited reconciliation flow not present yet.
- No R2 bucket, paid service, payment method, Cloudflare deployment or remote data was created.
- Local profile photo and banner choices accept JPG/PNG/WebP. They are cropped and resized in the browser to image object URLs only (not persisted or transmitted), with source EXIF omitted on canvas export.

Run from community-api: node --test tests/*.test.mjs
Run database tests: PYTHONDONTWRITEBYTECODE=1 python -m unittest discover -s tests -p 'test_*.py'

## Cloudflare D1 staging created (2026-11-04)

The real Cloudflare database named **bas-community-staging** now exists on the account's D1 free allocation. Three schema migrations were applied via the Cloudflare D1 REST API and verified remotely: **11 tables, 10 triggers, 27 indices, zero users and zero reserved/used storage bytes**. This database is private and has **no deployed Worker or public endpoint**. It is not the local SQLite database.

On the user's Moto G75, an ignored `community-api/wrangler.jsonc` file contains the actual D1 staging UUID; it has permissions 0600 and is not committed to GitHub. The public `wrangler.example.jsonc` retains an invalid placeholder UUID. Keep this separation: no real user data, secrets or working deployment config in the public repository.

**Migration ledger warning:** the Cloudflare schema was applied directly via REST, not through `wrangler d1 migrations apply --remote`. Do not assume Wrangler's migration tracking is synchronized or blindly rerun migrations. Inspect remote schema and reconcile migration ledger before making further schema changes.

**R2 is NOT enabled.** Cloudflare's official onboarding requires an R2 subscription checkout, even though Standard storage includes a free monthly allowance. Usage above the allowance can be billed. Before enabling, the owner must independently review the checkout and explicitly approve any payment method or recurring/usage-based costs. No paid plan, bucket or billing settings were changed.

**P15.5 local image crop refinement:** after choosing profile/banner JPG, PNG or WebP, users can reposition the original image by dragging, adjust zoom from 100% to 350%, recenter, cancel, and only then save a bounded WebP preview on a local canvas. Avatar output is 512×512; banner 1280×480. The source object URL is revoked after confirmation/cancel; source images stay in the browser and are not uploaded. This is not persistent profile storage or a production media-processing service.

## P15.6 — Private publishing flow (tested offline; NOT DEPLOYED)

The new files are src/publishing.mjs, src/worker-zip.mjs, migrations/0004_publishing.sql, tests/publishing.test.mjs and tests/test_publishing_schema.py.
The real Cloudflare D1 staging database has migration 0004 applied via REST and now contains 14 tables, 13 triggers, 36 indices and ZERO users/uploads/reserved bytes.
The actual R2 bucket remains private and EMPTY (no upload has been performed during these tests).

### Fail-closed publishing gates

The publishing API returns HTTP 503 unless ALL are explicitly enabled: PUBLISH_ENABLED=true, PUBLISH_STAGING_APPROVED=true, STORAGE_ENABLED=true, UPLOAD_ENABLED=true, and PUBLIC_CATALOG_ENABLED is not true.
Additionally it requires a complete real AUTH_ENABLED + AUTH_DEPLOYMENT_APPROVED OAuth configuration, verified session, exact Origin, CSRF proof, D1 0001-0004 and a private R2 bucket with PRIVATE_UPLOADS binding.
Every flag in the public example and the private Termux configuration remains FALSE. Do not enable before an operator-approved private staging acceptance test.

### Endpoint contract (future private beta)

- POST /v1/publishing/drafts : authenticated JSON for title, description, source, license, filename, exact byte count, rights confirmation and Idempotency-Key. Creates a D1 draft and 15-minute byte reservation transactionally.
- PUT /v1/publishing/drafts/:id/zip : same author + session + CSRF; receives application/zip bytes and validates ZIP before private R2 quarantine write. Creates an unapproved version and moderation event. Does not publish.
- POST /v1/publishing/drafts/:id/cancel : cancels an untouched draft and releases its quota.
- GET /v1/publishing/drafts : lists safe metadata belonging to the authenticated author only. Never returns private R2 keys.
- Editor export and existing ZIP share the same backend validation. Companion is blocked until real authenticated device pairing and explicit user permission exist; a checkbox is not proof of pairing.

### ZIP validation and cost controls

Archive admission: <=20 MiB ZIP, <=4 MiB per entry, <=64 MiB expanded total, <=480 entries/450 frames, max 80:1 entry compression ratio. Rejects traversal, duplicate names, symlinks, special files, ZIP64, encryption, data descriptors, unsupported extra fields and hidden data. Server uses bounded deflate-raw, CRC32, SHA256, image signatures and desc.txt structure.
Admission is NOT malware scanning or a complete image decoder. No ZIP or image can become public until moderation and safe media processing are reviewed.
Database quota reservations use the 8 GiB global ceiling plus per-user limits, and the app has a 10,000-operations/month R2 Class A counter. These limits DO NOT track the entire Cloudflare account and cannot guarantee zero charges. Before real traffic: cleanup of expired reservations, orphaned object reconciliation, image decoding, cost review and abuse controls.

### Accounts and front end

The GitHub OAuth implementation now permits a single exact HTTPS origin for site+API, avoiding a domain purchase solely for cookies. Cross-site GitHub Pages + workers.dev remains rejected. A real GitHub OAuth App, secure secrets, registered callback, consent/privacy and reviewed staging deployment are still required.
The gallery's three-path publishing selector and title/license/rights editor are LOCAL UI previews only; the browser still makes zero network requests. Profile photo/banner storage remains a preview and must be connected to secure authenticated server media processing later in P15.6.

Tests: cd community-api && node --test tests/*.test.mjs && PYTHONDONTWRITEBYTECODE=1 python -m unittest discover -s tests -p 'test_*.py'; also node --test tests/community-preview.test.cjs from the repository root.
These tests use real local SQLite but a FAKE in-memory R2 adapter and fake OAuth identities; no real R2 put, remote OAuth call or public Worker deploy has occurred.

## P15.6 continuation — authenticated profile images in private R2 (NOT ACTIVATED)

Cloudflare Images Free includes up to 5,000 unique transformations/month before returning an error rather than billing automatically; however R2 Standard has separate metered usage. Our implementation adds an app cap of 200 attempted image transforms/month, 8 images per creator per 24h, a fixed 512 KiB reservation and the existing 8 GiB global private storage limit. These are APPLICATION quotas and do not guarantee zero Cloudflare overage from other applications, buckets or manual requests.

- Server files: `src/profile-media.mjs` (only owner+Origin+CSRF); `src/reconcile-media.mjs` (operator-only maintenance, NEVER an HTTP endpoint), schema `migrations/0005_creator_media.sql`, tests `tests/profile-media.test.mjs` and `tests/test_creator_media.py`.
- Protected `PUT /v1/profile-media/avatar` and `/banner` receives <=2/4 MiB JPG/PNG/WebP; Cloudflare Images binding DECODES and RESIZES to WebP (512x512 or 1280x480), discarding original EXIF. Max transformed output 512 KiB, stored under PRIVATE R2 key. Browser canvas image is never trusted as the authoritative decoder.
- Protected `GET /v1/profile-media/avatar` or `/banner` returns only the logged-in user's own WebP, requires same Origin+CSRF and session, never returns private bucket URLs or object keys. A future public profile image route needs moderation/publicity rules; none is exposed here.
- SQLite/D1 triggers reserve global storage budget atomically on upload start, track the real transformed size on completion and refuse unsafe transitions. Replacing a photo updates the active pointer before attempting to delete the previous private object. R2 deletion success is required before the old bytes are removed from the storage ledger.
- If deletion or transaction fails, a `processing`/`delete_pending` record retains the private object key for recovery. `reconcileCreatorMedia(env, {limit,olderThanSeconds})` requires `MEDIA_MAINTENANCE_APPROVED=true`; it is NOT routed to HTTP and cannot be invoked by ordinary visitors. It accounts for R2 operations before deletes.
- **NO LIVE ENABLEMENT:** requires `MEDIA_ENABLED=true`, `MEDIA_STAGING_APPROVED=true`, `STORAGE_ENABLED=true`, real `AUTH_ENABLED=true` OAuth session, D1 schema 0005, `PRIVATE_UPLOADS` bucket and Images `IMAGES` binding. All feature flags remain false in the real Termux preview. No actual images were uploaded to Cloudflare.
- Cloudflare D1 migration `0005_creator_media.sql` was applied via REST, not Wrangler migration history. Staging database now has **17 tables, 20 triggers, 43 indices, 0 users/creator media, and 0 used/reserved bytes**. Reconcile Wrangler migration ledger before using `migrations apply` remotely.
- Tests performed on Termux with fake R2 and fake Cloudflare Images binding: **61 Node backend, 33 Python D1/SQLite, 17 frontend = 111 tests**. The actual provider's production image transformation and private R2 write still require approved live staging acceptance testing.
