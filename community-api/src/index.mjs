import {serveBetaPortal} from './beta-portal.mjs';
import {handleBetaCatalog,betaCatalogReady} from './beta-catalog.mjs';
import { handleProfileMedia } from './profile-media.mjs';
import { handlePublishing, publishingReady } from './publishing.mjs';
import { handleAuth, authConfigured } from './auth.mjs';
/* BAS Community P15.3: read-only Worker API.
 * Default-deny by design. No upload, auth, administration or file delivery routes exist.
 * Never return R2 object keys, tokens, internal author IDs or pending submissions.
 */
const API_VERSION = 'p15.7';
const MAX_PAGE_SIZE = 24;
const MAX_OFFSET = 5000;
const SORTS = Object.freeze({
  newest: 'a.published_at DESC, a.id DESC',
  popular: 'a.download_count DESC, a.published_at DESC, a.id DESC',
  liked: 'a.like_count DESC, a.published_at DESC, a.id DESC'
});
const PUBLIC_FIELDS = Object.freeze([
  'id', 'title', 'summary', 'category', 'published_at', 'download_count',
  'like_count', 'size_bytes', 'width', 'height', 'fps', 'handle', 'display_name'
]);
const SELECT_PUBLIC = [
  'SELECT a.id, a.title, a.summary, a.category, a.published_at,',
  'a.download_count, a.like_count, v.size_bytes, v.width, v.height,',
  'v.fps, u.handle, u.display_name',
  'FROM animations AS a',
  'JOIN community_users AS u ON u.id = a.owner_id',
  'JOIN animation_versions AS v ON v.id = a.published_version_id',
  "WHERE a.status = 'published' AND v.status = 'approved' AND u.status = 'active'"
].join(' ');
const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store, private',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'none'",
  'Vary': 'Origin'
};

function allowedOrigin(origin, env) {
  if (!origin || origin === 'null') return null;
  const configured = String(env?.CORS_ALLOWED_ORIGINS || '');
  const allowed = configured.split(',').map(v => v.trim()).filter(Boolean);
  if (!allowed.includes(origin)) return null;
  try {
    const parsed = new URL(origin);
    return parsed.origin === origin && ['https:', 'http:'].includes(parsed.protocol) ? origin : null;
  } catch (_) { return null; }
}
function headers(origin) {
  const h = new Headers(JSON_HEADERS);
  if (origin) {
    h.set('Access-Control-Allow-Origin', origin);
    h.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    h.set('Access-Control-Allow-Headers', 'Accept, Content-Type');
    h.set('Access-Control-Max-Age', '300');
  }
  return h;
}
function json(data, status, origin, head = false) {
  return new Response(head ? null : JSON.stringify(data), { status, headers: headers(origin) });
}
function error(code, status, origin, head = false) {
  return json({ error: code }, status, origin, head);
}
function parseInteger(value, fallback, min, max) {
  if (value === null || value === '') return fallback;
  if (!/^(0|[1-9][0-9]*)$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= min && n <= max ? n : null;
}
function publicRecord(row) {
  const clean = {};
  for (const field of PUBLIC_FIELDS) clean[field] = row?.[field] ?? null;
  return clean;
}
function validId(id) { return /^[a-zA-Z0-9_-]{1,64}$/.test(id); }
function catalogReady(env) {
  return env?.PUBLIC_CATALOG_ENABLED === 'true' && Boolean(env?.DB && typeof env.DB.prepare === 'function');
}
function cleanQuery(searchParams) {
  const size = parseInteger(searchParams.get('limit'), 12, 1, MAX_PAGE_SIZE);
  const offset = parseInteger(searchParams.get('offset'), 0, 0, MAX_OFFSET);
  const sort = searchParams.get('sort') || 'newest';
  const q = (searchParams.get('q') || '').trim();
  const category = (searchParams.get('category') || '').trim();
  if (size === null || offset === null || !Object.hasOwn(SORTS, sort)) return null;
  if (q.length > 80 || category.length > 32 || (category && !/^[a-z0-9-]+$/.test(category))) return null;
  return { size, offset, sort, q, category };
}
function buildCatalogQuery(query) {
  const conditions = [];
  const values = [];
  if (query.q) {
    conditions.push('(instr(lower(a.title), ?) > 0 OR instr(lower(u.handle), ?) > 0)');
    values.push(query.q.toLowerCase(), query.q.toLowerCase());
  }
  if (query.category) {
    conditions.push('a.category = ?');
    values.push(query.category);
  }
  return {
    sql: SELECT_PUBLIC + (conditions.length ? ' AND ' + conditions.join(' AND ') : '') +
      ' ORDER BY ' + SORTS[query.sort] + ' LIMIT ? OFFSET ?',
    values: [...values, query.size + 1, query.offset]
  };
}

async function listCatalog(url, env, origin, head) {
  const query = cleanQuery(url.searchParams);
  if (!query) return error('invalid_query', 400, origin, head);
  if (!catalogReady(env)) return error('catalog_unavailable', 503, origin, head);
  const prepared = buildCatalogQuery(query);
  try {
    const response = await env.DB.prepare(prepared.sql).bind(...prepared.values).all();
    const rows = Array.isArray(response?.results) ? response.results : [];
    const hasMore = rows.length > query.size;
    const items = rows.slice(0, query.size).map(publicRecord);
    return json({
      items, next_offset: hasMore && query.offset + query.size <= MAX_OFFSET ? query.offset + query.size : null
    }, 200, origin, head);
  } catch (_) {
    return error('catalog_unavailable', 503, origin, head);
  }
}
async function getAnimation(id, env, origin, head) {
  if (!validId(id)) return error('not_found', 404, origin, head);
  if (!catalogReady(env)) return error('catalog_unavailable', 503, origin, head);
  try {
    const row = await env.DB.prepare(SELECT_PUBLIC + ' AND a.id = ? LIMIT 1').bind(id).first();
    if (!row) return error('not_found', 404, origin, head);
    return json({ animation: publicRecord(row) }, 200, origin, head);
  } catch (_) {
    return error('catalog_unavailable', 503, origin, head);
  }
}

export default {
  async fetch(request, env) {
    const origin = allowedOrigin(request.headers.get('Origin'), env);
    const method = request.method.toUpperCase();
    const head = method === 'HEAD';
    let url;
    try { url = new URL(request.url); }
    catch (_) { return error('invalid_url', 400, origin, head); }
    const betaPage=serveBetaPortal(request,env,url);
    if(betaPage)return betaPage;
    // Auth is separately gated by AUTH_ENABLED + owner approval + complete secret config.
    // Even when enabled, upload, moderation and all other mutation routes remain locked.
    if (url.pathname.startsWith('/v1/auth/')) return handleAuth(request, env, url);
    if (url.pathname.startsWith('/v1/publishing')) return handlePublishing(request, env, url);
    if (url.pathname.startsWith('/v1/beta/')) return handleBetaCatalog(request,env,url);
    if (url.pathname.startsWith('/v1/profile-media/')) return handleProfileMedia(request, env, url);
    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: headers(origin) });
    }
    if (method !== 'GET' && !head) return error('mutations_locked', 403, origin);
    if (url.pathname === '/v1/health') {
      return json({ service: 'bas-community', version: API_VERSION,
        mode: authConfigured(env) ? 'accounts_enabled' : 'read_only', catalog_available: catalogReady(env),
        uploads_enabled: publishingReady(env), moderation_enabled: betaCatalogReady(env) && env.MODERATION_STAGING_APPROVED==='true' }, 200, origin, head);
    }
    if (url.pathname === '/v1/catalog') return listCatalog(url, env, origin, head);
    const animationPath = /^\/v1\/animations\/([^/]+)$/.exec(url.pathname);
    if (animationPath) return getAnimation(animationPath[1], env, origin, head);
    return error('not_found', 404, origin, head);
  }
};
