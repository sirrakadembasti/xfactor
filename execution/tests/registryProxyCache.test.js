import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { PassThrough } from 'node:stream';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createProxy } from '../registryProxy.js';

const TARBALL = '/left-pad/-/left-pad-1.3.0.tgz';

function get(proxy, requestPath, headers = {}) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: proxy.address().port, path: requestPath, headers }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.once('error', reject);
      res.once('aborted', () => reject(new Error('aborted')));
      res.once('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    }).once('error', reject);
  });
}

// Upstream double: counts connections and answers with a fixed body.
function upstreamDouble(body, { status = 200, headers = {} } = {}) {
  const state = { calls: 0, paths: [] };
  const connector = (options, callback) => {
    state.calls++;
    state.paths.push(options.path);
    const upstream = new PassThrough();
    upstream.setTimeout = () => upstream;
    queueMicrotask(() => {
      const response = new PassThrough();
      response.statusCode = status;
      response.headers = { 'content-type': 'application/octet-stream', 'content-length': String(body.length), ...headers };
      callback(response);
      response.end(body);
    });
    return upstream;
  };
  return { state, connector };
}

async function withProxy(options, run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'xfactor-registry-cache-'));
  const proxy = await createProxy({ resolver: { resolve: async () => ['104.16.26.34'] }, cacheDirectory: directory, ...options });
  try { await run({ proxy, directory }); }
  finally { await new Promise(resolve => proxy.close(resolve)); await rm(directory, { recursive: true, force: true }); }
}

const settle = () => new Promise(resolve => setTimeout(resolve, 100));

test('a completed npm tarball is served from the cache without a second upstream request', async () => {
  const body = Buffer.from('tarball-bytes'.repeat(1000));
  const upstream = upstreamDouble(body);
  await withProxy({ connector: upstream.connector }, async ({ proxy }) => {
    const first = await get(proxy, TARBALL);
    assert.equal(first.status, 200);
    assert.deepEqual(first.body, body);
    await settle();
    const second = await get(proxy, TARBALL);
    assert.equal(second.status, 200);
    assert.deepEqual(second.body, body);
    assert.equal(second.headers['content-length'], String(body.length));
    assert.equal(second.headers['content-type'], 'application/octet-stream');
    assert.equal(upstream.state.calls, 1);
  });
});

test('a cache hit is reported in the observation without leaking the request path', async () => {
  const upstream = upstreamDouble(Buffer.from('payload'));
  const observations = [];
  await withProxy({ connector: upstream.connector, onObservation: event => observations.push(event) }, async ({ proxy }) => {
    await get(proxy, TARBALL);
    await settle();
    await get(proxy, TARBALL);
    await settle();
    const finished = observations.filter(event => event.state === 'finished');
    assert.equal(finished.length, 2);
    assert.equal(finished[0].cacheHit, undefined);
    assert.equal(finished[1].cacheHit, true);
    assert.equal(finished[1].responseComplete, true);
    assert.ok(!JSON.stringify(observations).includes('left-pad'));
  });
});

test('package metadata (not a tarball) is never cached', async () => {
  const upstream = upstreamDouble(Buffer.from('{"name":"left-pad"}'));
  await withProxy({ connector: upstream.connector }, async ({ proxy, directory }) => {
    await get(proxy, '/left-pad');
    await settle();
    await get(proxy, '/left-pad');
    assert.equal(upstream.state.calls, 2);
    assert.deepEqual((await readdir(directory)).filter(name => !name.startsWith('.')), []);
  });
});

test('range requests bypass the cache in both directions', async () => {
  const upstream = upstreamDouble(Buffer.from('payload'));
  await withProxy({ connector: upstream.connector }, async ({ proxy }) => {
    await get(proxy, TARBALL, { range: 'bytes=0-3' });
    await settle();
    await get(proxy, TARBALL);
    await settle();
    await get(proxy, TARBALL, { range: 'bytes=0-3' });
    assert.equal(upstream.state.calls, 3);
  });
});

test('non-200 upstream answers are not cached', async () => {
  const upstream = upstreamDouble(Buffer.from('missing'), { status: 404 });
  await withProxy({ connector: upstream.connector }, async ({ proxy }) => {
    assert.equal((await get(proxy, TARBALL)).status, 404);
    await settle();
    assert.equal((await get(proxy, TARBALL)).status, 404);
    assert.equal(upstream.state.calls, 2);
  });
});

test('a transfer that is cut short is not cached', async () => {
  let calls = 0;
  const connector = (_options, callback) => {
    calls++;
    const upstream = new PassThrough();
    upstream.setTimeout = () => upstream;
    queueMicrotask(() => {
      const response = new PassThrough();
      response.statusCode = 200;
      response.headers = { 'content-length': '1000' };
      callback(response);
      response.write('only a part');
      setImmediate(() => response.destroy(Object.assign(new Error('reset'), { code: 'ECONNRESET' })));
    });
    return upstream;
  };
  await withProxy({ connector }, async ({ proxy, directory }) => {
    await assert.rejects(get(proxy, TARBALL), /aborted|socket|reset/i);
    await settle();
    await assert.rejects(get(proxy, TARBALL), /aborted|socket|reset/i);
    assert.equal(calls, 2);
    assert.deepEqual((await readdir(directory)).filter(name => !name.startsWith('.')), []);
  });
});

test('a response shorter than its declared length is not cached', async () => {
  const upstream = upstreamDouble(Buffer.from('short'), { headers: { 'content-length': '500' } });
  await withProxy({ connector: upstream.connector }, async ({ proxy, directory }) => {
    await get(proxy, TARBALL).catch(() => {});
    await settle();
    assert.deepEqual((await readdir(directory)).filter(name => !name.startsWith('.')), []);
  });
});

test('a corrupted cache entry is discarded and refetched instead of served', async () => {
  const body = Buffer.from('genuine-tarball'.repeat(100));
  const upstream = upstreamDouble(body);
  await withProxy({ connector: upstream.connector }, async ({ proxy, directory }) => {
    await get(proxy, TARBALL);
    await settle();
    const dataFile = (await readdir(directory)).find(name => name.endsWith('.bin'));
    assert.ok(dataFile, 'entry was stored');
    const original = await readFile(path.join(directory, dataFile));
    const tampered = Buffer.from(original);
    tampered[0] ^= 0xff;
    await writeFile(path.join(directory, dataFile), tampered);
    const again = await get(proxy, TARBALL);
    assert.deepEqual(again.body, body);
    assert.equal(upstream.state.calls, 2);
    await settle();
    assert.deepEqual(await readFile(path.join(directory, dataFile)), original);
  });
});

test('the oldest entries are evicted when the cache exceeds its size limit', async () => {
  const body = Buffer.alloc(600, 1);
  const upstream = upstreamDouble(body);
  await withProxy({ connector: upstream.connector, cacheMaxBytes: 1000 }, async ({ proxy, directory }) => {
    await get(proxy, '/a/-/a-1.0.0.tgz');
    await settle();
    await get(proxy, '/b/-/b-1.0.0.tgz');
    await settle();
    assert.equal((await readdir(directory)).filter(name => name.endsWith('.bin')).length, 1);
    await get(proxy, '/b/-/b-1.0.0.tgz');
    assert.equal(upstream.state.calls, 2, 'the newer entry survived');
  });
});

test('an unusable cache directory never breaks proxying', async () => {
  const body = Buffer.from('payload');
  const upstream = upstreamDouble(body);
  const blocker = await mkdtemp(path.join(os.tmpdir(), 'xfactor-registry-cache-blocker-'));
  const file = path.join(blocker, 'file');
  await writeFile(file, 'not a directory');
  const proxy = await createProxy({ resolver: { resolve: async () => ['104.16.26.34'] }, connector: upstream.connector, cacheDirectory: path.join(file, 'cache') });
  try {
    const first = await get(proxy, TARBALL);
    assert.deepEqual(first.body, body);
    await settle();
    const second = await get(proxy, TARBALL);
    assert.deepEqual(second.body, body);
    assert.equal(upstream.state.calls, 2);
  } finally { await new Promise(resolve => proxy.close(resolve)); await rm(blocker, { recursive: true, force: true }); }
});

test('only immutable Prisma engine paths are cached', async () => {
  const upstream = upstreamDouble(Buffer.from('engine'));
  await withProxy({ connector: upstream.connector }, async ({ proxy }) => {
    await get(proxy, '/prisma-binaries/all_commits/abc123/debian-openssl-3.0.x/query-engine.gz');
    await settle();
    await get(proxy, '/prisma-binaries/all_commits/abc123/debian-openssl-3.0.x/query-engine.gz');
    assert.equal(upstream.state.calls, 1);
    await get(proxy, '/prisma-binaries/mutable/latest.json');
    await settle();
    await get(proxy, '/prisma-binaries/mutable/latest.json');
    assert.equal(upstream.state.calls, 3);
  });
});

test('the allowlist still rejects other hosts when the cache is enabled', async () => {
  const upstream = upstreamDouble(Buffer.from('x'));
  await withProxy({ connector: upstream.connector }, async ({ proxy }) => {
    assert.equal((await get(proxy, 'https://evil.example/pkg/-/pkg-1.0.0.tgz')).status, 403);
    assert.equal((await get(proxy, '//evil.example/pkg/-/pkg-1.0.0.tgz')).status, 403);
    assert.equal(upstream.state.calls, 0);
  });
});
