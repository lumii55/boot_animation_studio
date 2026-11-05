/* BAS P15.3 — local-only API adapter for testing on Termux.
 * Not a production HTTP server. Never binds 0.0.0.0 and never exposes writes.
 * Cloudflare runtime uses src/index.mjs directly; this adapter is strictly development.
 */
import { createServer } from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import worker from './src/index.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const HOST = '127.0.0.1';
const DEFAULT_PORT = 8788;

export function databaseBinding(database) {
  return {
    prepare(sql) {
      const stmt = database.prepare(sql);
      return {
        bind(...params) {
          return {
            async all() { return { results: stmt.all(...params) }; },
            async first() { return stmt.get(...params) ?? null; },
            async run() { return stmt.run(...params); }
          };
        }
      };
    },
    async batch(statements) {
      database.exec('BEGIN IMMEDIATE');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        database.exec('COMMIT');
        return results;
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    }
  };
}

export function createLocalServer(options = {}) {
  const dataDir = resolve(options.dataDir || join(here, '.local'));
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const dbPath = options.memory ? ':memory:' : join(dataDir, 'community.sqlite');
  const database = new DatabaseSync(dbPath);
  database.exec('PRAGMA foreign_keys=ON;');
  database.exec(readFileSync(join(here, 'migrations', '0001_initial.sql'), 'utf8'));
  database.exec(readFileSync(join(here, 'migrations', '0002_auth.sql'), 'utf8'));
  database.exec(readFileSync(join(here, 'migrations', '0003_upload_reservations.sql'), 'utf8'));
  database.exec(readFileSync(join(here, 'migrations', '0004_publishing.sql'), 'utf8'));
  database.exec(readFileSync(join(here, 'migrations', '0005_creator_media.sql'), 'utf8'));
  database.exec(readFileSync(join(here, 'migrations', '0006_moderation_catalog_tags.sql'), 'utf8'));
  const env = {
    DB: databaseBinding(database),
    // Always disabled unless a developer deliberately opts in for local testing.
    PUBLIC_CATALOG_ENABLED: options.catalogEnabled === true ? 'true' : 'false',
    CORS_ALLOWED_ORIGINS: 'http://127.0.0.1:8088,http://localhost:8088'
  };
  const server = createServer(async (req, res) => {
    try {
      const path = req.url || '/';
      // HTTP proxy-style absolute URLs are forbidden; never fetch other hosts.
      if (!path.startsWith('/') || path.startsWith('//')) {
        res.writeHead(400, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end('{"error":"invalid_url"}');
        return;
      }
      const url = 'http://' + HOST + ':' + (server.address()?.port || DEFAULT_PORT) + path;
      const request = new Request(url, {
        method: req.method,
        headers: req.headers
      });
      const answer = await worker.fetch(request, env);
      const outbound = Object.fromEntries(answer.headers);
      const multipleCookies = answer.headers.getSetCookie?.();
      if (multipleCookies?.length) outbound['set-cookie'] = multipleCookies;
      res.writeHead(answer.status, outbound);
      res.end(Buffer.from(await answer.arrayBuffer()));
    } catch (_) {
      res.writeHead(500, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
      });
      res.end('{"error":"local_adapter_error"}');
    }
  });
  const stop = () => new Promise(resolveStop => server.close(() => {
    database.close();
    resolveStop();
  }));
  return { server, stop, database };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.BAS_LOCAL_API_PORT || DEFAULT_PORT);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    console.error('Invalid BAS_LOCAL_API_PORT; allowed 1024–65535.');
    process.exitCode = 1;
  } else {
    const instance = createLocalServer({ catalogEnabled: process.env.BAS_LOCAL_CATALOG_ENABLED === '1' });
    instance.server.listen(port, HOST, () => {
      console.log('[BAS Community] Local-only staging API on http://' + HOST + ':' + port);
      console.log('[BAS Community] Catalog ' + (process.env.BAS_LOCAL_CATALOG_ENABLED === '1' ? 'read-only enabled' : 'disabled by default'));
    });
    for (const signal of ['SIGINT', 'SIGTERM']) {
      process.on(signal, () => instance.stop().then(() => process.exit(0)));
    }
  }
}
