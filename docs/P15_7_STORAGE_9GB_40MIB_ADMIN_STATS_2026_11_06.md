# BAS P15.7 - internal storage allowance and private monitoring
Date: 2026-11-06.

Approved: 9,000,000,000 bytes internal cap (9 GB decimal), ZIP upload max 40 MiB (41,943,040 bytes), authenticated admin dashboard showing used/reserved/available/cap.
No changes to Google Drive; that is only a future architecture proposal.

R2 Standard Free includes 10 GB-month plus separate operations quotas, shared across account. The 9 GB BAS application budget is NOT a provider-wide spend guarantee, and records retained for moderation still consume space until audited deletion.

The D1 migration 0014_storage_9gb_zip40mib.sql reconstructs storage_budget and owner_revisions, widens archive size columns in-place for three referenced tables, and restores all triggers and indices. Apply atomically in staging after taking a D1 Time Travel bookmark. D1 foreign key deferral is on during migration, then cleared.

The admin stats route is GET /v1/beta/moderation/storage. It enforces the same moderator identity, admin origin and client kind as the rest of the administrative API. This endpoint reports the BAS accounting ledger, not all Cloudflare R2 objects. The Termux-only admin UI uses the endpoint after login and refresh.

40 MiB remains subject to the ZIP parser's other protections and Worker platform request limits. Discord's file attachment API limit is separate from the BAS ZIP cap; large ZIP files may need to be downloaded from the private administrator panel.
No public registration, CDN, migration of personal Google files, or delete operation is performed.

Tests: node --test tests/*.cjs ; node --test community-api/tests/*.mjs ; python -m unittest discover -s community-api/tests -p test_*.py .
