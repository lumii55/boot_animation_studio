# BAS Community — social posts, creator follows and licensed remixes

This document describes the private-staging implementation following P15.7, not a public launch. Source of truth: `dev/p15-community-foundation`. The existing BAS front-end remains the only UI; Cloudflare supplies API data only.

## User experience

- Clicking an animation from Explore/search/creator profile/owned posts opens a designed social detail view containing the approved archive preview, metadata, creator panel, owner actions or report button, likes, share, comments and engagement statistics.
- Creator profile includes a persistent Follow/Following control. Its state and follower count are the same as on the post detail.
- Signed-out visitors may browse approved works and public text comments; likes, follows, posting and reporting require an authenticated BAS account. A user cannot follow themself, report their own comment or inflate likes by repeatedly pressing the same action.
- Comments contain only short text and Unicode emoji (1–600 code points). No image, video or file attachment endpoint or HTML execution. All untrusted content is escaped in the UI. Posting is rate-limited; comment likes and reports are persisted, with moderator hide/dismiss actions in the private admin queue.
- The Share button uses Web Share API or Clipboard, currently linking to the local BAS origin; these links are only useful on the same device during private testing and will require public routing after launch.
- Remix is conditional on the approved current license. The existing `abrirZipNoEditor` handler imports the exact approved `bootanimation.zip` into the existing BAS Studio after an explicit confirmation, without building a parallel editor. When exporting/publishing the imported project, BAS attaches `remix_of` and prepopulates credits.
- Server revalidates that the original animation is published and approved, that remix is permitted, and that ShareAlike obligations are met. For CC BY and CC BY-SA the new publication must explicitly credit the original `@handle`, including on later owner revisions. CC0 permits adaptation without those attribution requirements. Remix source/version/license are recorded in `animation_remixes`. Metadata edits and replacement ZIPs still go through author-ownership and administrator approval; an approved original remains public until a revision is approved.

## API additions

- `GET /v1/social/animations/{id}` with bounded comment pagination; only approved animations; optional signed-in like/follow states.
- `PUT|DELETE /v1/social/animations/{id}/like`.
- `GET /v1/social/creators/{handle}`, `PUT|DELETE /v1/social/creators/{handle}/follow`.
- `POST /v1/social/animations/{id}/comments`, `PUT|DELETE /v1/social/comments/{id}/like`, `POST /v1/social/comments/{id}/reports`.
- Existing `/v1/beta/animations/{id}` includes immutable remix-source disclosure when relevant.
- Existing moderator queue now includes `comment_reports`. `POST /v1/beta/moderation/comments/{reportId}` accepts `hide` or `dismiss` for the private administrator (separate login/session scope).
- Existing authenticated new-publication flow now optionally accepts `remix_of`, editor-sourced only, with source license + credit verified on the server. Owner revisions cannot remove attribution/ShareAlike compliance.

## Storage and safety

`community-api/migrations/0011_social.sql` adds only new tables, indexes and triggers: `animation_likes`, `creator_follows`, `community_comments`, `comment_likes`, `comment_reports`, and `animation_remixes`. No existing account, publication, ZIP object or moderation history is deleted. The migration must be applied to D1 before deploying the new Worker. The private R2 ZIP objects remain guarded by the existing download endpoint, with no new public object endpoints.

## Tests and known follow-ups

- Run `node --test tests/*.cjs`, `node --test community-api/tests/*.mjs` and `python -m unittest discover -s community-api/tests -p 'test_*.py'` from repository root. Do not count these as proof of an end-to-end browser round trip.
- Follow up: manual Vivaldi acceptance with real accounts, two users, comments/report hide, sharing link on the same device, actual approved ZIP import/remix and posting + moderation approval. Admin panel is private under `~/bas-admin-private` and MUST NOT be copied into the public repository. Prior Cloudflare 1010 on Python HTTP clients was a browser-signature Cloudflare restriction, not conclusive Worker health.
- Current beta previews download the entire approved ZIP once; implement compact approved previews and improve catalog pagination before public traffic. Keep public sign-up, production catalog, Discord bot/webhook and `main` merge disabled until specifically approved. P15.7 Discord interactive moderator bot with GIF/buttons remains pending.
