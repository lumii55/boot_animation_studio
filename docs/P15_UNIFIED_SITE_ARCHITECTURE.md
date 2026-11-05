# BAS Community P15.7 — local-first canonical architecture (2026-11-05)

**This decision supersedes the old proposal to serve BAS under /studio/
using Cloudflare Workers Static Assets.** The user explicitly rejected
hosting any BAS site on Cloudflare. The original BAS keeps its existing
layout and runs entirely as a local/browser/PWA application.

## Which component does what?

### Boot Animation Studio — original user-facing application

- Runs locally from Termux at http://127.0.0.1:8088/ or as the existing
  GitHub Pages/PWA distribution when eventually merged to main.
- The EXISTING Community overlay, grid, profile and editor design is reused;
  no new standalone "Community website" or iframe.
- js/community-online.js connects to the cloud as a pure API client.
- js/community-live.js populates the original Community UI with actual
  account, approved gallery, draft statuses, profile photos, publishing and
  moderation data while preserving the original BAS shell and editor.
- All editor rendering, GIF/ZIP generation, PWA, local media and Companion
  communication remain client-side. No raw editor project is sent to the
  backend without explicit publication authorization.

### Cloudflare — backend/data only

- Worker exposes /v1/auth, /v1/profile-media, /v1/publishing and
  /v1/beta endpoints, backed by D1 and R2. /v1/health is diagnostic only.
- Root /, /beta/*, /studio/* and all page routes respond 404. The old
  beta-profile-page, beta-portal, beta-community-client, and unused
  Workers Static Assets proposal were deleted from the deployed code.
- GitHub OAuth still needs a backend callback: /v1/auth/github/start
  redirects to github.com, and /v1/auth/github/callback redirects to the
  ALLOWLISTED original BAS URL after verification. No HTML is served.
- Original same-site HttpOnly-cookie sessions can coexist during migration,
  but the native BAS uses one-time OAuth grants with client-side PKCE
  S256, then short opaque sessions in an authorized cross-origin API.
- GET, PATCH, PUT and POST honor a strict server-configured local BAS
  Origin allowlist. Browser requests carry a Bearer token and CSRF proof;
  /v1/auth/local/exchange consumes grant atomically. Never send GitHub
  provider access tokens or secret credentials to the browser.
- The BAS browser retains its opaque token in IndexedDB when available,
  with sessionStorage fallback. A content injection on the BAS origin
  would still be a risk; sanitize rendered strings and keep dependencies
  and served content trustworthy.
- Public signup, public catalog, non-owner registrations and the old
  Discord webhook stay disabled during beta.

## Deployment and limitations

- On-device Termux is the approved local BAS preview. The GitHub Pages
  release remains untouched until the owner's explicit release approval.
- The staging API can be deployed without its old UI; API-only does not
  mean the endpoints are physically unreachable in a browser. They are
  HTTP API routes protected by auth and CORS, not visual pages.
- The owner must test GitHub login on actual Android Chrome, session
  restoration, custom avatar/banner, ZIP upload, read and download,
  and real Companion handoff. Offline/unit tests cannot replace E2E.
- Interactive Discord admin bot and a real validated GIF preview are
  separately specified in docs/P15_DISCORD_ADMIN_BOT.md; not activated.
- Work stays in one consolidated P15.7 branch; main is unchanged.

## Staging API-only — 2026-11-05

- API-only Cloudflare Worker bas-community-staging running version
  7e4c043c-974c-47af-8b52-2ea4b005f3e5, rollback
  1b723004-f4ed-487a-ae24-600c7c6518d1.
- All HTML routes return HTTP 404. Private D1/R2 API remains accessible
  to approved clients; public signup and public catalog stay disabled.
- D1 migration 0008_local_bas_auth.sql applied without losing the
  existing one account and one animation.
- Verified CORS using Termux curl: trusted local Origin receives
  Access-Control-Allow-Origin, unapproved Origin does not. OPTIONS
  preflight allows Authorization, Content-Type, X-CSRF-Token.
- The original BAS site at http://127.0.0.1:8088/ serves new local
  JavaScript files community-online.js and community-live.js. The
  original BAS Community layout renders real account, gallery,
  profile, approved ZIP posts, publishing and moderation data.
- Original same-site GitHub cookie login remains backwards-compatible
  within API during migration; native BAS uses one-time PKCE grants,
  opaque bearer session, CSRF and server-side revocation.
- **Human E2E of actual Chrome OAuth, profile photos and ZIP upload
  remains pending**. Do not claim that all user flows were tested.
- main remains unchanged, Companion Android app unchanged,
  public catalog blocked and Discord admin bot not yet activated.
