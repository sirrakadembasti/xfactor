import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import { isIP } from 'node:net';
import dns from 'node:dns/promises';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, stat, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';

const REGISTRY_HOSTS = new Set(['registry.npmjs.org', 'binaries.prisma.sh']);
const CACHE_MAX_BYTES = 2 * 1024 ** 3;
const CACHE_MAX_ENTRY_BYTES = 512 * 1024 ** 2;
const CACHE_STALE_TEMP_MS = 60 * 60 * 1000;
const CACHED_HEADERS = ['content-type', 'content-length', 'content-encoding', 'etag'];

// Only immutable artifacts are cached: npm tarballs and Prisma engine builds addressed by commit.
// Package metadata changes over time and is never cached. npm still verifies every tarball against
// the lockfile integrity, so a cache entry cannot widen what a project is allowed to install.
export function isCacheableRequest(req, host, url) {
  if (req.method !== 'GET' || req.headers.range) return false;
  if (host === 'binaries.prisma.sh') return url.pathname.startsWith('/all_commits/');
  return url.pathname.endsWith('.tgz');
}

// Every cache failure is swallowed: the cache can only make a request faster, never fail it.
function createCache({ directory, maxBytes = CACHE_MAX_BYTES }) {
  const keyOf = (host, url) => createHash('sha256').update(`${host}${url.pathname}${url.search}`).digest('hex');
  const filesOf = key => ({ data: path.join(directory, `${key}.bin`), meta: path.join(directory, `${key}.json`) });

  async function discard(key) {
    const files = filesOf(key);
    await Promise.all([rm(files.meta, { force: true }), rm(files.data, { force: true })]).catch(() => {});
  }

  async function evict() {
    try {
      const names = await readdir(directory);
      const entries = [];
      let total = 0;
      for (const name of names) {
        const file = path.join(directory, name);
        if (name.startsWith('.tmp-')) {
          const info = await stat(file).catch(() => null);
          if (info && Date.now() - info.mtimeMs > CACHE_STALE_TEMP_MS) await rm(file, { force: true });
        } else if (name.endsWith('.json')) {
          const info = await stat(file).catch(() => null);
          const meta = info && JSON.parse(await readFile(file, 'utf8').catch(() => 'null'));
          if (meta && Number.isSafeInteger(meta.size)) { entries.push({ key: name.slice(0, -5), size: meta.size, time: info.mtimeMs }); total += meta.size; }
        }
      }
      entries.sort((a, b) => a.time - b.time);
      while (total > maxBytes && entries.length) { const oldest = entries.shift(); total -= oldest.size; await discard(oldest.key); }
    } catch {}
  }

  async function readEntry(key) {
    const files = filesOf(key);
    const meta = JSON.parse(await readFile(files.meta, 'utf8'));
    if (!meta || !Number.isSafeInteger(meta.size) || typeof meta.sha256 !== 'string' || !meta.headers) throw new Error('Invalid cache metadata');
    if ((await stat(files.data)).size !== meta.size) throw new Error('Cache size mismatch');
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(files.data)) hash.update(chunk);
    if (hash.digest('hex') !== meta.sha256) throw new Error('Cache digest mismatch');
    return { files, meta };
  }

  return {
    keyOf,
    // Resolves to the number of bytes served, or 0 when the caller must go upstream.
    async serve(key, res, onHit) {
      let entry;
      try { entry = await readEntry(key); }
      catch (error) { if (error?.code !== 'ENOENT') await discard(key); return 0; }
      if (res.destroyed || res.writableEnded) return 0;
      const now = new Date();
      utimes(entry.files.meta, now, now).catch(() => {});
      onHit(entry.meta.size);
      res.writeHead(200, entry.meta.headers);
      await new Promise(resolve => {
        const source = createReadStream(entry.files.data);
        source.once('error', () => { res.destroy(); resolve(); });
        res.once('close', resolve);
        source.pipe(res);
      });
      return entry.meta.size;
    },
    // Returns a sink that tees an upstream 200 response to disk, or null when it must not be cached.
    async prepare() { try { await mkdir(directory, { recursive: true }); return true; } catch { return false; } },
    begin(key, headers) {
      const size = Number(headers['content-length']);
      if (!Number.isSafeInteger(size) || size <= 0 || size > CACHE_MAX_ENTRY_BYTES || size > maxBytes) return null;
      const temporary = path.join(directory, `.tmp-${randomUUID()}`);
      const hash = createHash('sha256');
      let bytes = 0, failed = false, closed = false;
      const stream = createWriteStream(temporary, { flags: 'wx', mode: 0o600 });
      stream.on('error', () => { failed = true; });
      const abort = async () => { failed = true; if (!closed) { closed = true; stream.destroy(); } await rm(temporary, { force: true }).catch(() => {}); };
      return {
        write(chunk) { if (failed || closed) return; bytes += chunk.length; hash.update(chunk); stream.write(chunk); },
        abort,
        async commit() {
          if (failed || closed) return abort();
          closed = true;
          await new Promise(resolve => stream.end(resolve));
          if (failed || bytes !== size) { closed = true; return abort(); }
          const files = filesOf(key);
          const stored = {};
          for (const name of CACHED_HEADERS) if (headers[name] !== undefined) stored[name] = headers[name];
          try {
            const metaTemporary = path.join(directory, `.tmp-${randomUUID()}`);
            await rename(temporary, files.data);
            await writeFile(metaTemporary, JSON.stringify({ size, sha256: hash.digest('hex'), headers: stored }), { flag: 'wx', mode: 0o600 });
            await rename(metaTemporary, files.meta);
          } catch { await discard(key); await rm(temporary, { force: true }).catch(() => {}); return; }
          await evict();
        },
      };
    },
  };
}

// Resolve and validate before connecting. IPv4-mapped IPv6 values are
// canonicalized so ::ffff:127.0.0.1 cannot bypass the IPv4 checks.

function ipv6Value(input) {
  const [address, zone] = input.split('%');
  if (zone || !address.includes(':')) return null;
  const pieces = address.split('::');
  if (pieces.length > 2) return null;
  const parse = (parts) => {
    const words = [];
    for (const piece of parts) {
      if (piece.includes('.')) {
        const octets = piece.split('.').map(Number);
        if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
        words.push((octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]);
      } else {
        if (!/^[0-9a-f]{1,4}$/i.test(piece)) return null;
        words.push(parseInt(piece, 16));
      }
    }
    return words;
  };
  const left = parse(pieces[0] ? pieces[0].split(':') : []);
  const right = parse(pieces.length === 2 && pieces[1] ? pieces[1].split(':') : []);
  if (!left || !right || (pieces.length === 1 && left.length !== 8) ||
      (pieces.length === 2 && left.length + right.length >= 8)) return null;
  const words = pieces.length === 2
    ? [...left, ...Array(8 - left.length - right.length).fill(0), ...right]
    : left;
  return words.reduce((value, word) => (value << 16n) | BigInt(word), 0n);
}


export function isSafeIP(input) {
  if (!isIP(input)) return false;
  if (isIP(input) === 4) {
    const [a, b, c] = input.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && ((b === 0 && (c === 0 || c === 2)) || b === 168)) return false;
    if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false;
    if (a === 203 && b === 0 && c === 113) return false;
    return true;
  }
  const value = ipv6Value(input.toLowerCase());
  if (value === null) return false;
  const mapped = (value >> 32n) === 0xffffn;
  if (mapped) {
    const n = Number(value & 0xffffffffn);
    return isSafeIP(`${n >>> 24}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`);
  }
  if (value === 0n || value === 1n || (value >> 118n) === 0x3fn || (value >> 120n) === 0xffn) return false;
  for (const [prefix, bits] of [
    [0xfe800000000000000000000000000000n, 10], [0xfc000000000000000000000000000000n, 7],
    [0x20010db8000000000000000000000000n, 32], [0x2001000000000000000000000000000000n, 23],
    [0x20010020000000000000000000000000n, 28], [0x20010030000000000000000000000000n, 28],
    [0x3ffe000000000000000000000000000000n, 16],
  ]) if ((value >> BigInt(128 - bits)) === (prefix >> BigInt(128 - bits))) return false;
  return true;
}

export function createProxy({ port = 0, host = '127.0.0.1', resolver = dns, connector = https.request, onObservation, cacheDirectory, cacheMaxBytes } = {}) {
  let sequence = 0;
  const cache = cacheDirectory ? createCache({ directory: cacheDirectory, maxBytes: cacheMaxBytes }) : null;
  const observe = event => { try { const result = onObservation?.(event); if (result && typeof result.then === 'function') result.catch(() => {}); } catch {} };
  const server = http.createServer(async (req, res) => {
    const started = Date.now();
    let upstream, timer, requestId, target, errorCode, phase = 'dns', responseBytes = 0, finished = false, cacheHit = false, sink = null;
    const complete = () => {
      if (finished) return;
      finished = true; clearTimeout(timer);
      if (requestId <= 2048) observe({ requestId, state: 'finished', target, phase, statusCode: res.statusCode,
        responseComplete: res.writableFinished,
        elapsedMs: Date.now() - started, responseBytes: Math.min(responseBytes, 2147483647), ...(cacheHit ? { cacheHit } : {}), ...(errorCode ? { errorCode } : {}) });
    };
    const fail = (status, code) => {
      if (res.writableEnded || res.destroyed) return;
      errorCode = ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'CLIENT_ABORTED'].includes(code) ? code : 'UPSTREAM_ERROR';
      sink?.abort();
      if (res.headersSent) res.destroy();
      else { res.writeHead(status); res.end('Registry request failed'); }
      upstream?.destroy();
    };
    res.once('finish', complete);
    res.once('close', () => { if (!res.writableFinished) { errorCode ||= 'CLIENT_ABORTED'; upstream?.destroy(); sink?.abort(); } complete(); });
    try {
      const rawTarget = String(req.url || '/');
      let targetUrl;
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(rawTarget)) {
        targetUrl = new URL(rawTarget);
        if (targetUrl.protocol !== 'https:' ||
            !REGISTRY_HOSTS.has(targetUrl.hostname.toLowerCase()) ||
            (targetUrl.port && targetUrl.port !== '443')) {
          res.writeHead(403);
          res.end('Host not allowlisted');
          return;
        }
      } else if (rawTarget.startsWith('/prisma-binaries/')) {
        targetUrl = new URL(rawTarget.slice('/prisma-binaries'.length), 'https://binaries.prisma.sh');
      } else {
        // Origin-form proxy requests use the npm registry endpoint.
        targetUrl = new URL(rawTarget, 'https://registry.npmjs.org');
      }
      const targetHost = targetUrl.hostname.toLowerCase();
      // Origin-form URLs may contain a network-path reference (//host/path).
      // Validate the resolved destination for every form, before DNS/connect.
      if (targetUrl.protocol !== 'https:' || !REGISTRY_HOSTS.has(targetHost) || (targetUrl.port && targetUrl.port !== '443')) {
        res.writeHead(403); res.end('Host not allowlisted'); return;
      }
      target = targetHost === 'binaries.prisma.sh' ? 'prisma' : 'npm';
      requestId = ++sequence;
      if (requestId <= 2048) observe({ requestId, state: 'started', target });
      const cacheKey = cache && isCacheableRequest(req, targetHost, targetUrl) ? cache.keyOf(targetHost, targetUrl) : null;
      let cacheReady = false;
      if (cacheKey) {
        const served = await cache.serve(cacheKey, res, size => { cacheHit = true; phase = 'cache'; responseBytes = size; });
        if (served) return;
        if (res.destroyed || res.writableEnded) return;
        cacheReady = await cache.prepare();
      }
      timer = setTimeout(() => fail(504, 'ETIMEDOUT'), 30000);
      const addresses = await resolver.resolve(targetHost);
      if (res.destroyed || res.writableEnded) return;
      const safeAddress = addresses.find(isSafeIP);
      if (!safeAddress) {
        res.writeHead(403);
        res.end('DNS resolved to unsafe IP');
        return;
      }
      phase = 'connect';
      const proxyReq = connector({
        hostname: safeAddress,
        port: 443,
        path: targetUrl.pathname + targetUrl.search,
        method: req.method,
        headers: { ...req.headers, host: targetHost },
        servername: targetHost,
        checkServerIdentity: (_address, certificate) =>
          tls.checkServerIdentity(targetHost, certificate),
      }, (proxyRes) => {
        if (res.destroyed || res.writableEnded) { proxyRes.destroy(); return; }
        clearTimeout(timer); phase = 'response';
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        const attach = candidate => {
          sink = candidate;
          proxyRes.on('data', chunk => sink?.write(chunk));
          proxyRes.once('end', () => { const done = sink; sink = null; done?.commit(); });
        };
        if (cacheReady && proxyRes.statusCode === 200) { const candidate = cache.begin(cacheKey, proxyRes.headers); if (candidate) attach(candidate); }
        proxyRes.on('data', chunk => { responseBytes += chunk.length; });
        proxyRes.once('error', error => fail(502, error?.code));
        proxyRes.pipe(res);
      });
      upstream = proxyReq;
      proxyReq.setTimeout?.(30000, () => fail(504, 'ETIMEDOUT'));
      proxyReq.on('error', error => fail(502, error?.code));
      req.pipe(proxyReq);
    } catch (error) {
      fail(502, error?.code);
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve(server));
  });
}
