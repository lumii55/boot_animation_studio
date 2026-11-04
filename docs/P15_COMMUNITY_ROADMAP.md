# P15 — BAS Community

Development status: **P15.3 backend scaffold prepared**, not deployed. P15.1 Developer Lab preview and P15.2 interactive gallery/creator profiles are implemented as local demos. There are still no live accounts, uploads, public releases, paid services or Discord integrations.

## Non-negotiable project rules

- All community features are free for users. Core editor, browsing, downloading and applying never require a community account.
- Publishing and commenting require an account. Follow/likes/favorites/ratings are tied to authenticated identity when syncing between devices.
- Until owner approval for launch, Community is hidden by default. The Developer Lab's **Tools & Logs** checkbox controls a per-browser display preference. The site also requires Developer Lab to be active in that session. This local state is *not* access control.
- All privileged API functions will fail closed server-side until authorized in staging. Production release requires deliberate enablement.
- Keep existing BAS editor and v1.4 Companion compatible. Do not change module code unless compatibility testing proves it necessary.
- Default to **US$0/month** while prototyping. Do not enable paid Cloudflare plans/products without explicit permission. Server-enforced uploads/space limits, telemetry and safe automatic upload suspension are required before any public operations. Billing alerts alone are not a hard spending cap.
- Minimize revisions: build, test and review a complete stage before committing, rather than scattering tiny unrelated fixes.

## Planned work, in order, all within P15

### A — Foundation
- Developer Lab toggle, isolated Community UI shell, localization and accessibility.
- Initial regression coverage ensuring disabled-by-default and no effect on editor, Companion, or public v1.4.
- Later: design D1 schemas, API contracts, staging-only infrastructure and authentication provider after reviewing options/costs with owner.

### B — Gallery and publishing
- Explore/search/category, rich previews, metadata, public creator profiles and free downloads.
- Three publishing entry points: immediately after editor export; choose an existing bootanimation.zip; pull the currently installed animation from an authorized connected Companion, with preview and affirmative upload confirmation.
- Optional editable project uploads with author permissions; original credit/license metadata.
- Quarantine ZIPs; enforce file/entry count, decompression ratio, mime/format, structure and path checks; review generated previews safely.
- Every new or revised ZIP enters moderation; a new revision never silently overwrites a publicly approved release.
- Explicit consent before apply/install; old module remains supported.

### C — Community governance
- Account-only plaintext comments; no HTML/images/GIFs/attachments/clickable links. Sanitized display, posting limits, abuse detection and reports.
- Moderation dashboard: latest uploads, pending and rejected, reported content, appeals/history, author and audit records.
- Discord bot: DM new queue entries/reports with description, preview, metadata and actions to approve/reject/hide/keep; link to a **moderator-authenticated download route**, not a permanent public ZIP URL. Verify Discord interaction signatures and allowlist moderator Discord IDs. All decisions transactionally idempotent in backend. Provide fallback dashboard if DM delivery fails.
- Reports, abuse prevention, takedown processes and retention/privacy policy.

### D — Social extras (still P15)
- Likes, synced favorites, ratings, rankings, follow creators, social notifications and spam protections.
- Build after the main gallery is stable; do not defer to a new numbered phase.

### E — Release validation
- Browser/mobile/PWA smoke testing, ZIP safety and permission/security checks, staging restore/backup tests, no inadvertent billing, analytics/privacy review.
- Confirm compatibility with public v1.4 and current development Companion.
- P14 two-device HTTPS acceptance remains a separate postponed verification (do not force a Quest test during headache).
- Owner explicitly authorizes Community's public release; only then expose navigation to all.

## How to try the first shell on this branch

Enable the existing Developer Lab (7 taps on the BAS title). Open **Tools & Logs**; check **Show the Community preview**; click **Open gallery preview**. The new header Community button is visible only while Developer Lab is active and the local preference is enabled. Leaving Developer Lab disabled hides it even if an old opt-in is saved.

No upload, authentication, moderation, Discord or payment actions exist in this first shell. Do not mistake the mock gallery for an operating public platform.

## Test

Run `node --test tests/community-preview.test.cjs`; then test the manual toggle, close/Escape, Portuguese localization, mobile layout and editor regression in a browser before merge.

## P15.B preview UI update (2026-11-04)

- Upgraded the former empty gallery shell to a responsive, accessible interactive mock gallery with eight clearly labeled **fictional** CSS-art animations.
- Live local-only search, genre filters, sort order, creator directory, detail view, sample plaintext comments, session-only likes and favorites, and three publishing-path previews.
- Choosing an existing ZIP displays filename and size locally only; no ZIP contents are transferred, no server requests or accounts are created. Download and apply actions are visibly disabled until an authorized backend exists.
- The Developer Lab opt-in remains mandatory; ordinary site visitors see no Community navigation.
- Regression tests cover experimental gating, gallery interaction, upload chooser, and non-communication with external services.
- **Still pending:** real accounts, uploads, downloads, ZIP validation, moderation, Discord bot, persistence and social backend.

## P15.B creator profile layout (2026-11-04)

- Clicking a creator now opens a complete **fictional public profile** instead of only showing a username-filtered catalog: themed banner, illustrated profile image, display name, handle, editable-in-the-future bio fields, member-since label, sample follower/creation/like counts, a locally interactive Follow button, and the creator's animations below.
- Profile artwork and avatars are bundled vector/CSS demo assets generated locally; no photos are uploaded and no social data is transmitted. Creator directory thumbnails use the same fictional illustrated avatars.
- This is a **UI design only**. Future real profile photo and banner uploads must be consent-driven, authenticated, file size/type/EXIF-stripped and moderated or reportable; bios and image metadata need safe text handling. Authenticated follow relationships are not implemented yet.
- All other gallery layout and the original BAS editor remain unchanged.

## Official 14-milestone development contract (agreed 2026-11-04)

- **P15.1 — DONE**: Hidden Developer Lab feature flag and local Community UI foundation.
- **P15.2 — DONE as visual prototype**: Responsive gallery, search, mock animation details, illustrated creator profile pages with banner/avatar/bio, local demo favorites/following.
- **P15.3 — IN PROGRESS**: Worker API, D1 schema, private R2 readiness, fail-closed permissions, staging-only configuration, budget constraints and tests. No Cloudflare deployment yet; R2 activation requires separate approval.
- **P15.4 — NEXT**: Account provider decision, OAuth with PKCE/state, secure sessions, real creator profiles and privacy controls.
- **P15.5**: Private file staging, ZIP hardening, previews, atomic storage quotas, uploads.
- **P15.6**: Publishing from editor, existing ZIP and connected Companion; editable projects and author reuse rights.
- **P15.7**: Public approved-only gallery, downloads, revisions and editor integration.
- **P15.8**: Moderator dashboard, approval queue, authorization and audit trails.
- **P15.9**: Discord bot DM moderation, private authenticated ZIP download and signature-verified interaction handlers.
- **P15.10**: Text comments, reporting and abuse prevention.
- **P15.11**: Likes, synced favorites and ratings.
- **P15.12**: Following creators and notifications.
- **P15.13**: Rankings, curated discovery and recommendations.
- **P15.14**: Security, accessibility, compatibility, costs, backup/rollback, audit and owner's public release approval.

**Zero-spend rule:** no new paid Cloudflare subscription, R2 enablement, billing setting or live upload route without explicit user authorization. A free D1 allocation or staging-only resource is not an excuse to accidentally expose unfinished code. The repository is public; source code may be inspected regardless of the frontend flag.

P15.3 files live in the community-api directory. All mutating HTTP methods remain locked; public listing is also disabled by default. Localhost gallery at http://127.0.0.1:8088/ remains unchanged and has no API connection.

P15.3 loopback adapter: community-api/dev-server.mjs provides a Node.js localhost-only HTTP bridge to the identical Worker read-only handler and real local SQLite migration; tests/local-server.test.mjs exercises API over HTTP with private-key redaction. No remote services or paid features enabled.

## P15.4 login and profile editing — local development (2026-11-04)

- Guarded GitHub OAuth PKCE S256 backend with one-time state, cookie binding, test-only provider mocks, 7-day HttpOnly hashed sessions, CSRF/Origin-checked profile writes and logout, private beta allowlist and rate limiting.
- Added `0002_auth.sql` tables for OAuth transactions, sessions and hashed attempt buckets. Account identity is linked by GitHub immutable user ID, never guessed from a handle or display name.
- Community sign-in button is temporarily **My Profile · Demo**: a local-only account/profile editor for username, display name, bio and preset banner/avatar theme, with escaped text and no account creation or data transmission.
- **Explicitly pending and NOT complete:** real GitHub app credentials, real hosted D1, same-site HTTPS domain topology, tested registered redirect URI, privacy/consent checks, image uploads, server-to-frontend session integration. Until a deployment is authorized, all real sign-ins remain disabled.
- Existing public BAS editor, Companion and standard gallery experience are untouched apart from the demo profile entry point.

## P15.5 — guarded ZIP preflight and local customizable photos

- Local-only profile avatar and banner selection supports JPG/PNG/WebP; browser resizes and crops to temporary object URLs, no sending or persistence. Image URL revoked on replacement/pagehide.
- Node-only staging ZIP verifier checks compressed/uncompressed size, file names and paths, encrypted/ZIP64/symlink/malicious overlap, CRC, basic desc.txt, frame image signatures and ratio limits.
- Atomic SQLite/D1 upload reservation triggers budget guardrails. Still no public upload endpoint and R2 remains disabled.
- P15.5 is PREPARATORY: production uploading and storing user profile media require authorized R2 access, full image decode, stronger preview validation, authentication and moderation.
