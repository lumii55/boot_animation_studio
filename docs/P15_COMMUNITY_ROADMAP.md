# P15 — BAS Community

Development status: **P15.A experimental foundation**. This branch intentionally contains only the hidden gallery preview, the Developer Lab switch, and regression tests. It has no active backend, accounts, publication, billing, or Discord integration.

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
