## CANONICAL LOCAL BAS + API-ONLY ARCHITECTURE (2026-11-05)

**This supersedes historical P15.6/P15.7 beta portal descriptions below.**
The existing Boot Animation Studio is the sole user interface. It runs
on-device at http://127.0.0.1:8088/ and uses its native Community overlay.
Cloudflare Worker serves HTTP /v1 APIs only: no HTML portal, beta website,
license guide, or /studio static app. Root and /beta routes respond 404.

The GitHub OAuth backend callback issues a one-time, PKCE-verifier-bound
redirect to an allowlisted BAS origin. The BAS exchanges the grant for an
opaque, revocable session, then uses Authorization: Bearer and a server
CSRF proof for private writes. D1 migration 0008_local_bas_auth.sql
must run **before** deployment. Staging flags:
BAS_LOCAL_CLIENT_ENABLED=true and BAS_LOCAL_ORIGINS allowlist only for the
trusted local BAS site. BETA_PORTAL_ENABLED remains false. Do not activate
public signup, public catalog or Discord text webhooks.

Native site code: js/community-online.js (API), js/community-live.js
(existing Community UI integration), js/community-preview.js (minimal
hooks to reuse BAS interface). No new BAS layout was introduced.

Live E2E (Android Chrome, OAuth, profile media, ZIP publishing, Companion)
must be approved by the owner. The original BAS GitHub Pages/main stays
unchanged until the final release.

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


## P15.6A — deployment confirmado em staging (2026-11-04)

- Foi enviada via API Cloudflare uma nova versao MODULAR do Worker, mantendo por keep_bindings os tipos de bindings plain_text, secret_text, d1, r2_bucket e images. O endpoint de upload de versao nao ativou publicamente a comunidade.
- Nova versao implantada no Worker de staging a 100%: d16c9c34-fe74-413b-b4f0-a62fc4a89a8a.
- Versao anterior para rollback: 634c6460-f357-4aec-b392-7fcf752aa5a0.
- Subdominio workers.dev de staging ativado; URLs de preview de versoes continuam desativadas. Isso disponibiliza a pagina de TESTE mas NAO habilita cadastro publico.
- Auditoria confirmou 23 bindings na nova versao, incluindo os quatro secrets, e todas as flags de cadastro publico/upload/storage/publishing/media/catalog OFF. Auth e beta portal ON apenas na instancia de staging.
- Smoke tests reais da origem HTTPS: / HTTP 200 com link de login; /beta/app.js HTTP 200; /v1/health HTTP 200 no modo accounts_enabled; /v1/auth/me HTTP 401 sem sessao; /v1/catalog HTTP 503 (bloqueado).
- /v1/auth/github/start HTTP 302 redirecionando ao GitHub com callback da origem correta, PKCE S256, state e cookie HttpOnly Secure SameSite=Lax verificados.
- PENDENTE: proprietaria entrar com GitHub real na beta; verificar configuracao do callback na OAuth App, sessao, edicao e logout reais. Nao marcar como autenticacao validada fim-a-fim ainda.
- URL de beta: https://bas-community-staging.caiolive1000.workers.dev/
- Callback GitHub: https://bas-community-staging.caiolive1000.workers.dev/v1/auth/github/callback
- Cloudflare Worker nao recebe upload/media/publicacao ate testes posteriores aprovados. Nao liberar publicamente a Community na P15.6.


## P15.6A — correcao diagnostica OAuth (2026-11-04)

- Teste real do GitHub retornou erro generico oauth_provider_unavailable; fluxo nao criou conta nem sessao no D1. Ainda nao sabemos se foi falha de rede, token ou identidade.
- GitHub suporta PKCE S256; esta protecao NAO foi removida.
- Backend agora classifica apenas CODIGOS FIXOS seguros: credenciais do cliente incorretas, callback divergente, codigo expirado, e-mail nao verificado, token rejeitado, JSON invalido, rede inacessivel, identidade negada ou rate limited. Nenhum token, segredo, URL de autorizacao ou resposta arbitraria do GitHub aparece no erro.
- Testes com provedores simulados exercitam varios erros; nenhum segredo real foi usado.
- PENDENTE: novo login REAL pela conta allowlisted para identificar a causa. Nao declarar OAuth finalizado ate confirmar perfil salvo e logout em staging.


## P15.6A — correcao CONFIRMADA: redirect:'error' nao e suportado nos Workers (2026-11-04)

- Root cause identificado a partir do erro real oauth_github_token_network_error. A documentacao oficial Cloudflare Workers Request (atualizada em 2026-11-02) diz que o modo redirect:'error' lanca TypeError na construcao da Request ANTES de fazer a requisicao, sendo aceitos somente 'follow' ou 'manual'.
- O codigo anterior usava redirect:'error' no POST /login/oauth/access_token e GET /user do GitHub; logo, esse fluxo falhava antes de chamar os endpoints reais.
- Corrigido para redirect:'manual' nas duas requisicoes; o codigo agora bloqueia explicitamente status HTTP 300-399 e resposta opaqueredirect, sem seguir endereco Location e sem exibir tokens, headers ou erros crus.
- Novos testes cobrem o modo suportado e recusam redirects maliciosos em ambos endpoints. Login verdadeiro precisa ser repetido apos deploy (codigo OAuth anterior expirou).
- Fonte: https://developers.cloudflare.com/workers/runtime-apis/request/ (Request.redirect).


## P15.6B — perfil BAS real e personalizacao privada (2026-11-04)

- O beta recebeu um PERFIL BAS de verdade como tela principal apos o login: banner, avatar, nome, @identificador, bio, data de ingresso e area de criações (placeholder ate P15.6C). O botao Editar perfil abre o formulario separado; SALVAR persiste nome, handle e bio no D1 e volta automaticamente ao perfil com dados novos. Cancelar volta ao perfil sem escrever.
- Estrutura de staging: beta-profile-page.mjs (HTML), beta-profile-styles.mjs (visual), beta-profile-client.mjs (sessao, navegacao e recorte) e beta-portal.mjs (rotas CSP). Os assets da UI ainda so sao servidos quando BETA_PORTAL_ENABLED e login beta configurado.
- Personalizacao: trocar avatar e banner abre seletor JPEG/PNG/WebP, recorte arrastavel e zoom, exporta WebP via canvas sem EXIF, envia por PUT autenticado ao backend ja criado na P15.6; o backend valida/recodifica com Images e armazena exclusivamente no R2 privado. Fotos sao carregadas por GET apenas para o dono com cookie de sessao (GET same-origin do navegador nao envia Origin). Alteracoes exigem Origin+CSRF e sessoes validas.
- CSP permite somente img-src self e blob; nenhum script inline, iframe, URL publica de R2 ou HTML gerado por usuarios.
- Cotas ativas no esquema 0005: 8 atualizacoes de imagem por conta/24h, 200 transformacoes por mes, 512 KiB por imagem transformada, reserva/budget R2 e limite global. Free Images 5000 transformacoes gratuitas; free excessos causam erro, nao cobranca, conforme documentacao 2026. R2 pode ter custos fora de franquia, por isso manter gate beta allowlist e limites.
- SEGURANCA: habilitar somente MEDIA_ENABLED, MEDIA_STAGING_APPROVED e STORAGE_ENABLED no Worker bas-community-staging, apos validar todos os bindings. Manter PUBLISH_ENABLED, UPLOAD_ENABLED, PUBLIC_CATALOG_ENABLED, AUTH_PUBLIC_SIGNUP_APPROVED e MEDIA_MAINTENANCE_APPROVED desativados.
- A experiencia visual/navegacao foi testada com conta simulada; fotos reais em Cloudflare ainda exigem teste manual pela usuaria antes de declarar P15.6B completa. P15.6C continua pendente.


## P15.6B — staging privado implantado e verificacao de acesso (2026-11-04)

- Nova versao implantada no Worker bas-community-staging: 5827baa2-885f-4500-ae74-3150c7d65d6b.
- Versao anterior para rollback: 096ce9fe-b21f-4a89-8acf-8990354ba017.
- URL unica de teste: https://bas-community-staging.caiolive1000.workers.dev/
- 23 bindings preservados, incluindo quatro secrets. Somente MEDIA_ENABLED, MEDIA_STAGING_APPROVED e STORAGE_ENABLED habilitados a mais para fotos no STAGING. Cadastro publico, catalogo, publicacao, uploads de animacoes e manutencao de orfaos permanecem OFF.
- Smoke tests reais: pagina do perfil, JS e CSS HTTP 200; API health 200 com uploads/catalgo OFF; /v1/auth/me sem cookie HTTP 401; avatar/banner privados sem cookie HTTP 403; catalogo 503 e endpoint geral de uploads 403.
- Testes cumulativos locais: 17 frontend + 70 backend JS + 33 SQLite = 120/120 aprovados. Teste com navegador simulado confirmou salvar e voltar automaticamente ao perfil. GET privado de imagem exige sessao valida, mas nao Origin/CSRF porque browsers podem nao enviar Origin em GET; PUT continua protegido com Origin e CSRF.
- Ainda precisa de validacao REAL pela proprietaria: recarregar sessao, alterar e salvar nome/bio, selecionar imagem e banner, recortar, enviar e recarregar para confirmar persistencia no R2. Nao declarar P15.6B completamente finalizada ate esses testes passarem.
- Esta e uma interface de perfis beta no Worker, NAO a liberacao publica da galeria; a integracao futura com o app BAS e publicacoes segue P15.6C-E.


## P15.6 — Integracao do beta privado (2026-11-04)

- Perfil real com OAuth/PKCE e personalizacao avatar/banner. Portal beta / mostra formulario para enviar ZIP e lista privada de envios.
- O backend recebe ZIP/editor/Companion pela mesma validacao de arquivo e fila pending_review, com direito/autoria/licenca, CSRF, idempotencia, cotas e R2 privado. Nunca publica sem moderacao.
- O BAS local e o editor mantem tudo no navegador; o ZIP gerado e repassado pelo postMessage ao staging somente por clique. O Companion continua com pareamento Android preexistente; o BAS pode ler a copia instalada pelo endpoint local /pull com autorizacao explicita da usuaria e nova confirmacao no portal. O servidor nao pode ler o dispositivo e a indicacao de procedencia nao e prova de hardware.
- Mecanismo de recuperacao reconcile-publishing.mjs nao tem endpoint HTTP; PUBLISH_MAINTENANCE_APPROVED precisa ser true somente durante manutencao expressamente autorizada.
- D1 staging com cap global reduzido a 64 MiB. O Worker beta possui PUBLISH_ENABLED, PUBLISH_STAGING_APPROVED e UPLOAD_ENABLED verdadeiros somente no staging com uma conta allowlisted; catalogo e cadastro publico seguem OFF.
- Versao ativa do Worker 2dcf8a1f-d38b-493d-8144-fd0dee1c7ca9; anterior 5827baa2-885f-4500-ae74-3150c7d65d6b.
- Testes locais 126/126: frontend 17, backend 76, SQLite 33. Smoke HTTPS: scripts 200, API sem login 403, catalogo 503.
- ACEITE FINAL PENDENTE de testes reais no Chrome/Companion: ZIP existente ate status pending_review, recarregar lista privada, transferencia do editor e copia do Companion com consentimento. A main e o Companion publicado permanecem inalterados.

## P15.7 — Community moderada no beta privado (2026-11-04)

- Schemas D1 em migrations/0006_moderation_catalog_tags.sql: tags normalizadas por animacao, pesquisa, denuncias e fila de notificacoes Discord. Aplicar migracoes 0001..0006 em ordem. O dev-server local as aplica automaticamente.
- API privada GET /v1/beta/catalog?q= e /v1/beta/animations/:id, GET /v1/beta/downloads/:id, POST /v1/beta/reports, GET /v1/beta/moderation/queue, POST /v1/beta/moderation/decision/:id, POST /v1/beta/moderation/reports/:id, POST /v1/beta/moderation/discord/dispatch.
- Toda /v1/beta/* exige sessao OAuth valida; writes exigem Origin HTTPS exato e X-CSRF-Token. A fila/decisoes exigem MODERATION_STAGING_APPROVED=true e MODERATOR_USER_IDS contendo user_id validado. Busca/indexacao e downloads exigem BETA_CATALOG_ENABLED=true, PUBLIC_CATALOG_ENABLED=false, AUTH_PUBLIC_SIGNUP_APPROVED=false; downloads tambem requerem STAGING_DOWNLOADS_APPROVED=true e R2 privado. O catalogo publico /v1/catalog continua fechado.
- Pesquisa faz fold Unicode+case em title_fold e tags; suporta fragmentos em nomes ou tags, pagina de 1 a 24 itens, somente revisoes aprovadas. Tags 12 max, 32 caracteres e sem espacos dentro; tokens com virgula/espaco no frontend.
- Moderacao envia aprovados apenas para catalogo beta; aprovar publicamente requer autorizacao separada em P15.9. Acoes moderadoras e denuncias sao auditadas no banco.
- Discord: fila interna pronta; nenhuma mensagem sera enviada sem DISCORD_NOTIFICATIONS_APPROVED=true e webhook secreto oficial do Discord configurado. O Worker valida https://discord.com/api/webhooks/... antes de cada envio, sem embeds com links privados nem mentions. Envio real ainda NAO testado.
- UI: perfil beta inclui galeria, mod panel e guia /beta/licenses (nova aba). Editor local e Companion reutilizam popup HTTPS e confirmacoes explicitas. Nenhuma leitura local e acionada pelo Worker.
- P15.7 e uma unica entrega consolidada. Validações humanas em navegador/aparelho permanecem a cumprir; main e Companion Android publicado nao sao alterados.

## P15.7 — entrega consolidada de staging privado (2026-11-05)

**Implementado em codigo e implantado no beta privado; aceite humano em navegador/Companion ainda pendente.** Nao houve lancamento publico e a main ficou intocada.

- Cloudflare Worker bas-community-staging versao final 7ce6e9e0-36c7-4bd9-a4fc-8df79c3a22be (rollback c776e069-0fa3-4816-bde6-67301976c48e). 28 bindings preservados, quatro secrets intactos, lista privada com uma conta GitHub. Moderador vinculado ao ID de usuario ja autenticado, sem publicar sua identidade nos documentos.
- D1 migracao 0006_moderation_catalog_tags.sql aplicada no staging: animation_tags, animation_search, community_reports, discord_outbox. A conta e o envio do beta preexistentes foram preservados; limite global R2 segue 64 MiB. O dev-server aplica 0001 a 0006.
- Tags livres (12 por obra, 32 caracteres, deduplicadas, Unicode/acentos normalizados) com separacao por espaco, virgula ou Enter, chips removiveis. Mantem categoria legada interna abstract por compatibilidade, nao obriga categoria no formulario. Backend recusa dados invalidos e licencas contraditorias.
- Galeria REAL beta /v1/beta/catalog e detalhes/downloads autenticados, somente versoes published e approved de autores ativos. Busca parcial em titulo, handle ou tags, sem distincao de caixa/acentos para itens no novo pipeline. Paginacao, sem chaves R2. Catalogo publico /v1/catalog continua 503; cadastro publico OFF.
- Moderacao privada: fila, aprovar/rejeitar, ocultar/restaurar, denuncias autenticadas limitadas a cinco/dia e deduplicadas, justificativas, auditoria e dispensa de denuncia. Acesso do moderador separado por MODERATOR_USER_IDS e MODERATION_STAGING_APPROVED, nenhuma aprovacao automatica.
- Discord: fila no D1 e despacho opt-in implementados; DISCORD_NOTIFICATIONS_APPROVED=false, webhook nao conectado e envio real nao testado. Somente o titular podera autorizar e configurar webhook como segredo futuramente.
- Editor do BAS: Publicar na Community nos controles de exportacao E na tela de conclusao ao gerar ZIP. ZIP em memoria ate clique e confirmacao em HTTPS. Na tela comum nao exibir origem Editor; ZIP por padrao e Companion apenas com informacao da conexao autenticada via handoff local.
- Modulo/Companion: na interface conectada do BAS, botao Publicar animacao do dispositivo; modal escolhe copia da original do celular ou da aplicada (se detectada). Usa endpoint local pull com permissao e consentimento; nenhuma mudanca no APK/modulo publicado, nenhum flash/instalacao. Teste fisico nao realizado.
- Licencas: guia first-party /beta/licenses, link de ajuda em nova aba para preservar formulario, fontes Creative Commons, licencas CC0, CC BY, CC BY-SA e todos os direitos reservados explicados. Backend impede permitir-remix contraditorio.
- Regressoes locais: **139/139** = 17 UI, 89 JS API, 33 SQLite. Smoke HTTPS: pagina, assets, licencas 200; API beta sem login 403; /v1/catalog 503; /v1/auth/me 401. Teste real de publicacao, fluxo Companion e webhook Discord ainda pendentes.
- Proximos marcos: P15.8 unica entrega de recursos sociais e seguranca; P15.9 auditoria/launch com aprovacao expressa; main intocada.

## Correção P15.7: tags compostas, idioma e arquitetura BAS

- D1 migration 0007_multiword_tags.sql preserva as tags antigas,
  aceita espaços internos e continua limitando tamanho/quantidade.
- O formulário só insere tags pelo botão Adicionar (Enter é atalho);
  vírgulas separam, espaços não. Busca beta retorna arrays JSON de
  tags, sem cortar nomes compostos.
- Guia das licenças traduzido para as oito línguas do BAS,
  usando parâmetro lang fornecido pela página original, com
  Accept-Language como fallback.
- Webhook antigo de Discord não representa o bot solicitado e está
  desabilitado. Ver documentação do bot administrador no roadmap.
- Arquitetura opcional de Workers Static Assets sob /studio/
  preparada, mas não implantada no Worker atual. Não afirmar
  que o BAS original já está integrado/hospedado até completar
  o upload de assets e a migração da UI para o layout nativo.

## Revisão consolidada dos reportes da P15.7 (2026-11-05)

- Correções live no Worker privado bas-community-staging: versão
  1b723004-f4ed-487a-ae24-600c7c6518d1; rollback possível para
  7ce6e9e0-36c7-4bd9-a4fc-8df79c3a22be.
- Migracao 0007_multiword_tags.sql aplicada ao D1: 1 usuário e 1
  animação preservados; tags antigas intactas (0 tags neste beta).
- UI com + Adicionar: espaço permanece na tag, apenas vírgula
  divide; tags com múltiplas palavras retornam como array JSON
  na API sem serem quebradas; placeholder genérico.
- Licenças no idioma solicitado via lang ou Accept-Language, com
  oito idiomas do BAS; idioma da origem do editor é encaminhado
  ao beta quando abre o formulário.
- Discord: botão legado de despachar webhook removido, rota de texto
  bloqueada mesmo se configurada; bot administrativo solicitado
  não implementado. Ver documentação específica.
- Preparados build de static assets do BAS ORIGINAL, exemplo de
  configuração Cloudflare Assets e rota /studio/ protegida por sessão,
  mas ainda NÃO implantados na Cloudflare nem integrados visualmente
  com o BAS original. Staging /studio/ ainda retorna 404.
- Testes locais: **144/144** (17 site, 94 API JS, 33 SQLite).
  Teste HTTP live: campo/manual Add e scripts 200, oito guias
  com html.lang correto, /v1/auth/me 401 sem login,
  /v1/beta/catalog 403 sem login, /v1/catalog 503,
  /studio/ 404 (por segurança, até o deploy de assets).
- main e Companion publicado não alterados. Beta privado mantido.

## Live P15.7 local BAS staging checkpoint, 2026-11-05

- Active Worker 7e4c043c-974c-47af-8b52-2ea4b005f3e5.
- Workers now API-only: HTML paths 404, /v1 APIs protected by
  one-time local OAuth grant and bearer session with CSRF/Origin
  checks. D1 0008 applied preserving the existing account.
- BAS site and all Community UI run on-device, locally under
  http://127.0.0.1:8088/ (or original PWA once approved to main).
- No public catalog, public signup, separate Cloudflare website,
  or Discord text webhook. User Chrome E2E remains pending.

Local-first regression totals: **141/141** (22 BAS frontend, 86 Worker API, 33 SQLite).

## P15.7 — anonymous approved reads and separated owner administration

See docs/P15_7_GUEST_ACCOUNTS_PRIVATE_ADMIN.md for the current contract.
COMMUNITY_GUEST_READ_ENABLED separately allows anonymous GET of approved
beta catalog, metadata and ZIP only. Publishing and reports require a BAS
session. GitHub OAuth uses official prompt=select_account.
ADMIN_PANEL_SEPARATED, BAS_ADMIN_CLIENT_ENABLED, BAS_ADMIN_ORIGIN and a
client_kind=admin session isolate the moderation API to a private local
site. Migration 0009 must run before deployment. No admin HTML is
included in the public BAS repository.

### Atualização da implantação no beta privado

Versão Worker 9abba123-c5c0-4003-a657-292c62b5b0d1,
rollback 7e4c043c-974c-47af-8b52-2ea4b005f3e5,
migration 0009 aplicada. Foram confirmados 148 testes locais
(25 frontend, 90 API, 33 SQLite). GET catálogo privado de aprovados
agora aceita visitantes; houve 0 itens aprovados no smoke real.
A interface ADM fica em localhost 8090 fora do BAS; não hospedar
no Worker público nem no Git do BAS.
