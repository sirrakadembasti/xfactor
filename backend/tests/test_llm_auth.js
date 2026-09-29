import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { createLLMProfileStore, mountLLMManagement, PROVIDERS, validateProviderUrl } from '../llm-auth/llm.js';
import { generateLLMResponse, getCurrentLLMProvider } from '../llm.js';
import { ensureLLMEncryptionKey } from '../llm-auth/setup.js';

test('first launch writes one installation-specific encryption key and reuses it', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xfactor-llm-setup-'));
  try {
    const envPath = path.join(root, '.env');
    const examplePath = path.join(root, '.env.example');
    fs.writeFileSync(examplePath, 'PORT=8000\n# LLM_CONFIG_ENCRYPTION_KEY=\n');
    const environment = {};
    const first = ensureLLMEncryptionKey({ envPath, examplePath, profilePath: path.join(root, 'profiles.json'), environment });
    assert.match(first, /^[0-9a-f]{64}$/);
    assert.equal(environment.LLM_CONFIG_ENCRYPTION_KEY, first);
    assert.match(fs.readFileSync(envPath, 'utf8'), new RegExp(`^LLM_CONFIG_ENCRYPTION_KEY=${first}$`, 'm'));
    assert.equal(ensureLLMEncryptionKey({ envPath, examplePath, profilePath: path.join(root, 'profiles.json'), environment: {} }), first);
    assert.equal((fs.readFileSync(envPath, 'utf8').match(/^LLM_CONFIG_ENCRYPTION_KEY=/gm) || []).length, 1);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('missing key with existing encrypted profiles stops instead of replacing the key', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xfactor-llm-recovery-'));
  try {
    const envPath = path.join(root, '.env');
    const profilePath = path.join(root, 'profiles.json');
    fs.writeFileSync(envPath, 'PORT=8000\n');
    fs.writeFileSync(profilePath, JSON.stringify({ profiles: [{ id: 'existing', secret: 'encrypted' }], activeId: 'existing' }));
    assert.throws(() => ensureLLMEncryptionKey({ envPath, profilePath, environment: {} }), /şifreleme anahtarı.*kurtar/i);
    assert.equal(fs.readFileSync(envPath, 'utf8'), 'PORT=8000\n');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('provider profiles persist encrypted and never expose the API key', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xfactor-llm-auth-'));
  try {
    const filePath = path.join(root, 'profiles.json');
    const options = { filePath, encryptionKey: 'ab'.repeat(32) };
    const store = createLLMProfileStore(options);
    const profile = store.save({ name: 'OpenAI', provider: 'openai', model: 'gpt-test', baseURL: 'https://api.openai.com/v1', apiKey: 'secret-example' });
    assert.equal(profile.hasApiKey, true);
    assert.equal(Object.hasOwn(profile, 'apiKey'), false);
    assert.equal(fs.readFileSync(filePath, 'utf8').includes('secret-example'), false);
    store.activate(profile.id);
    const reloaded = createLLMProfileStore(options);
    assert.equal(reloaded.getActive().apiKey, 'secret-example');
    assert.equal(reloaded.list().activeId, profile.id);
    assert.equal(JSON.stringify(reloaded.list()).includes('secret-example'), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('only one profile is active and last connection result survives reload but expires on edit', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xfactor-llm-status-'));
  const options = { filePath: path.join(root, 'profiles.json'), encryptionKey: 'bc'.repeat(32) };
  try {
    const store = createLLMProfileStore(options);
    const google = store.save({ name: 'Google', provider: 'google', model: 'gemini-test', baseURL: 'https://generativelanguage.googleapis.com/v1beta', apiKey: 'google-secret' });
    const xiaomi = store.save({ name: 'MiMo', provider: 'xiaomi_mimo', model: 'mimo-v2.6-pro', baseURL: 'https://token-plan-sgp.xiaomimimo.com/v1', apiKey: 'mimo-secret' });
    store.activate(google.id);
    store.activate(xiaomi.id);
    assert.equal(store.list().activeId, xiaomi.id);
    store.recordTest(xiaomi.id, 'passed');
    const reloaded = createLLMProfileStore(options);
    const tested = reloaded.list().profiles.find(item => item.id === xiaomi.id);
    assert.equal(tested.lastTest.status, 'passed');
    assert.ok(Date.parse(tested.lastTest.at));
    assert.equal(Object.hasOwn(tested, 'apiKey'), false);
    reloaded.save({ id: xiaomi.id, name: 'MiMo', provider: 'xiaomi_mimo', model: 'mimo-v2.6-flash', baseURL: 'https://token-plan-sgp.xiaomimimo.com/v1' });
    assert.equal(reloaded.list().profiles.find(item => item.id === xiaomi.id).lastTest, null);
    assert.equal(reloaded.list().activeId, xiaomi.id);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('connection endpoint records success and failure for the selected profile', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xfactor-llm-test-state-'));
  const store = createLLMProfileStore({ filePath: path.join(root, 'profiles.json'), encryptionKey: 'ce'.repeat(32) });
  const profile = store.save({ name: 'MiMo', provider: 'xiaomi_mimo', model: 'mimo-v2.6-pro', baseURL: 'https://token-plan-sgp.xiaomimimo.com/v1', apiKey: 'test-key' });
  let shouldFail = false;
  const app = express();
  app.use(express.json());
  mountLLMManagement(app, { store, requireAuth: (req, _res, next) => { req.user = { isAdmin: true }; next(); }, generate: async () => {
    if (shouldFail) throw new Error('Temporary provider failure');
    return 'OK';
  } });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const testURL = `http://127.0.0.1:${server.address().port}/api/llm/profiles/${profile.id}/test`;
  try {
    assert.equal((await fetch(testURL, { method: 'POST' })).status, 200);
    assert.equal(store.list().profiles[0].lastTest.status, 'passed');
    shouldFail = true;
    assert.equal((await fetch(testURL, { method: 'POST' })).status, 502);
    assert.equal(store.list().profiles[0].lastTest.status, 'failed');
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('provider URL validation rejects local and unsafe endpoints', () => {
  assert.throws(() => validateProviderUrl('http://127.0.0.1:8000/v1'), /HTTPS|yerel/i);
  assert.throws(() => validateProviderUrl('https://localhost/v1'), /yerel/i);
  assert.throws(() => validateProviderUrl('https://user:pass@example.com/v1'), /kimlik/i);
  assert.equal(validateProviderUrl('https://api.example.com/v1'), 'https://api.example.com/v1');
});

test('Xiaomi MiMo Singapore catalog offers the supplied endpoint and four models', () => {
  const xiaomi = PROVIDERS.find(item => item.id === 'xiaomi_mimo');
  assert.equal(xiaomi?.baseURL, 'https://token-plan-sgp.xiaomimimo.com/v1');
  assert.equal(xiaomi?.transport, 'openai');
  assert.deepEqual(xiaomi?.models, ['mimo-v2.6-pro', 'mimo-v2.6-flash', 'mimo-v2.5-pro', 'mimo-v2.5']);
});

test('every catalog provider accepts a manually entered address and model for a connection probe', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xfactor-llm-catalog-'));
  const store = createLLMProfileStore({ filePath: path.join(root, 'profiles.json'), encryptionKey: 'de'.repeat(32) });
  const generated = [];
  const app = express();
  app.use(express.json());
  mountLLMManagement(app, {
    store,
    requireAuth: (req, _res, next) => { req.user = { isAdmin: true }; next(); },
    generate: async (_messages, options) => { generated.push(options); return 'OK'; }
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const provider of PROVIDERS) {
      const manualURL = provider.id === 'custom' ? 'https://custom.example/v2' : `${provider.baseURL}/alternate`;
      const saved = store.save({ name: provider.name, provider: provider.id, baseURL: manualURL, model: 'manual-model-id', apiKey: 'example-secret' });
      const response = await fetch(`${base}/api/llm/profiles/${saved.id}/test`, { method: 'POST' });
      assert.equal(response.status, 200, `${provider.id} probe failed`);
      const options = generated.at(-1);
      assert.equal(options.provider, provider.id);
      assert.equal(options.transport, provider.transport);
      assert.equal(options.baseURL, manualURL);
      assert.equal(options.model, 'manual-model-id');
      assert.equal(options.apiKey, 'example-secret');
      assert.equal(Object.hasOwn(saved, 'apiKey'), false);
    }
    assert.equal(generated.length, PROVIDERS.length);
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Xiaomi MiMo env fallback uses its key, model and Singapore endpoint', async () => {
  const names = ['AI_PROVIDER', 'AI_MODEL', 'XIAOMI_MIMO_API_KEY', 'XIAOMI_MIMO_BASE_URL', 'XIAOMI_MIMO_MODEL'];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  let request;
  try {
    process.env.AI_PROVIDER = 'xiaomi_mimo';
    delete process.env.AI_MODEL;
    process.env.XIAOMI_MIMO_API_KEY = 'test-xiaomi-key';
    process.env.XIAOMI_MIMO_BASE_URL = 'https://token-plan-sgp.xiaomimimo.com/v1';
    process.env.XIAOMI_MIMO_MODEL = 'mimo-v2.6-pro';
    globalThis.fetch = async (url, options) => { request = { url, options }; return new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }), { status: 200 }); };
    assert.equal(await generateLLMResponse([{ role: 'user', content: 'Merhaba' }], { useManagedProfile: false }), 'OK');
    assert.equal(request.url, 'https://token-plan-sgp.xiaomimimo.com/v1/chat/completions');
    assert.equal(request.options.headers.Authorization, 'Bearer test-xiaomi-key');
    assert.equal(JSON.parse(request.options.body).model, 'mimo-v2.6-pro');
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of names) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; }
  }
});

test('management page and API require an administrator and redact secrets', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xfactor-llm-http-'));
  const store = createLLMProfileStore({ filePath: path.join(root, 'profiles.json'), encryptionKey: 'cd'.repeat(32) });
  const app = express();
  app.use(express.json());
  mountLLMManagement(app, { store, generate: async () => { throw new Error('provider echoed http-test-secret'); }, requireAuth: (req, res, next) => {
    const role = req.headers['x-test-role'];
    if (!role) return res.sendStatus(401);
    req.user = { isAdmin: role === 'admin' };
    next();
  } });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/llm`)).status, 401);
    assert.equal((await fetch(`${base}/llm`, { headers: { 'x-test-role': 'viewer' } })).status, 403);
    assert.equal((await fetch(`${base}/api/llm/profiles`, { headers: { 'x-test-role': 'viewer' } })).status, 403);
    const page = await fetch(`${base}/llm`, { headers: { 'x-test-role': 'admin' } });
    assert.equal(page.status, 200);
    assert.match(await page.text(), /LLM Yönetimi/);
    const saved = await fetch(`${base}/api/llm/profiles`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-test-role': 'admin' }, body: JSON.stringify({ name: 'Deneme', provider: 'openai', baseURL: 'https://api.openai.com/v1', model: 'test-model', apiKey: 'http-test-secret' }) });
    assert.equal(saved.status, 201);
    const savedBody = await saved.json();
    assert.equal(JSON.stringify(savedBody).includes('http-test-secret'), false);
    const list = await fetch(`${base}/api/llm/profiles`, { headers: { 'x-test-role': 'admin' } });
    assert.equal((await list.text()).includes('http-test-secret'), false);
    const updated = await fetch(`${base}/api/llm/profiles/${savedBody.id}`, { method: 'PUT', headers: { 'content-type': 'application/json', 'x-test-role': 'admin' }, body: JSON.stringify({ ...savedBody, name: 'Yeni ad' }) });
    assert.equal(updated.status, 200);
    assert.equal((await updated.json()).name, 'Yeni ad');
    const activated = await fetch(`${base}/api/llm/profiles/${savedBody.id}/activate`, { method: 'POST', headers: { 'x-test-role': 'admin' } });
    assert.equal((await activated.json()).activeId, savedBody.id);
    const tested = await fetch(`${base}/api/llm/profiles/${savedBody.id}/test`, { method: 'POST', headers: { 'x-test-role': 'admin' } });
    assert.equal(tested.status, 502);
    assert.equal((await tested.text()).includes('http-test-secret'), false);
    const removed = await fetch(`${base}/api/llm/profiles/${savedBody.id}`, { method: 'DELETE', headers: { 'x-test-role': 'admin' } });
    assert.equal((await removed.json()).activeId, null);
  } finally { await new Promise(resolve => server.close(resolve)); fs.rmSync(root, { recursive: true, force: true }); }
});

test('portable management plugin tests a profile without the XFactor adapter', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xfactor-llm-portable-'));
  const originalFetch = globalThis.fetch;
  const store = createLLMProfileStore({ filePath: path.join(root, 'profiles.json'), encryptionKey: '12'.repeat(32) });
  const profile = store.save({ name: 'Bağımsız', provider: 'custom', model: 'custom-model', baseURL: 'https://llm.example.com/v1', apiKey: 'portable-key' });
  const app = express();
  app.use(express.json());
  mountLLMManagement(app, { store, requireAuth: (req, _res, next) => { req.user = { isAdmin: true }; next(); } });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const expectedUrl = `http://127.0.0.1:${server.address().port}/api/llm/profiles/${profile.id}/test`;
  let outbound;
  try {
    globalThis.fetch = async (url, options) => {
      if (String(url) === expectedUrl) return originalFetch(url, options);
      outbound = { url, options };
      if (String(url).endsWith('/models')) return new Response(JSON.stringify(String(url).includes('googleapis.com') ? { models: [{ name: 'models/gemini-test' }] } : { data: [{ id: 'model-a' }] }), { status: 200 });
      return new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }), { status: 200 });
    };
    const catalogResponse = await originalFetch(`http://127.0.0.1:${server.address().port}/api/llm/catalog`);
    assert.equal((await catalogResponse.json()).providers.some(item => item.id === 'custom'), true);
    const response = await originalFetch(expectedUrl, { method: 'POST' });
    assert.equal(response.status, 200);
    assert.equal(outbound.url, 'https://llm.example.com/v1/chat/completions');
    assert.equal(outbound.options.headers.Authorization, 'Bearer portable-key');
    assert.equal(JSON.parse(outbound.options.body).max_tokens, 512);
    const modelsResponse = await originalFetch(`http://127.0.0.1:${server.address().port}/api/llm/profiles/${profile.id}/models`);
    assert.deepEqual((await modelsResponse.json()).models, ['model-a']);
    const google = store.save({ name: 'Gemini', provider: 'google', model: 'gemini-test', baseURL: 'https://generativelanguage.googleapis.com/v1beta', apiKey: 'google-key' });
    const googleModels = await originalFetch(`http://127.0.0.1:${server.address().port}/api/llm/profiles/${google.id}/models`);
    assert.deepEqual((await googleModels.json()).models, ['gemini-test']);
    assert.equal(outbound.options.headers['x-goog-api-key'], 'google-key');
    assert.equal(Object.hasOwn(outbound.options.headers, 'Authorization'), false);
    const openai = store.save({ name: 'Reasoning', provider: 'openai', model: 'o3', baseURL: 'https://api.openai.com/v1', apiKey: 'openai-key' });
    const openaiTest = await originalFetch(`http://127.0.0.1:${server.address().port}/api/llm/profiles/${openai.id}/test`, { method: 'POST' });
    assert.equal(openaiTest.status, 200);
    assert.equal(JSON.parse(outbound.options.body).max_completion_tokens, 512);
  } finally { globalThis.fetch = originalFetch; await new Promise(resolve => server.close(resolve)); fs.rmSync(root, { recursive: true, force: true }); }
});

test('Xiaomi Pro connection probe leaves enough output tokens after reasoning', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xfactor-llm-reasoning-'));
  const originalFetch = globalThis.fetch;
  const store = createLLMProfileStore({ filePath: path.join(root, 'profiles.json'), encryptionKey: '34'.repeat(32) });
  const profile = store.save({ name: 'MiMo Pro', provider: 'xiaomi_mimo', model: 'mimo-v2.6-pro', baseURL: 'https://token-plan-sgp.xiaomimimo.com/v1', apiKey: 'test-key' });
  const app = express();
  app.use(express.json());
  mountLLMManagement(app, { store, requireAuth: (req, _res, next) => { req.user = { isAdmin: true }; next(); } });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const testURL = `http://127.0.0.1:${server.address().port}/api/llm/profiles/${profile.id}/test`;
  let tokenLimit;
  try {
    globalThis.fetch = async (url, options) => {
      if (String(url) === testURL) return originalFetch(url, options);
      tokenLimit = JSON.parse(options.body).max_tokens;
      return new Response(JSON.stringify({ choices: [{ finish_reason: tokenLimit < 256 ? 'length' : 'stop', message: { content: tokenLimit < 256 ? '' : 'OK', reasoning_content: 'reasoning' } }] }), { status: 200 });
    };
    const response = await originalFetch(testURL, { method: 'POST' });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).ok, true);
    assert.ok(tokenLimit >= 256);
  } finally {
    globalThis.fetch = originalFetch;
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Manager and agents use the selected profile instead of the old env provider', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xfactor-llm-switch-'));
  const original = { path: process.env.LLM_CONFIG_PATH, key: process.env.LLM_CONFIG_ENCRYPTION_KEY, provider: process.env.AI_PROVIDER, fetch: globalThis.fetch };
  try {
    process.env.LLM_CONFIG_PATH = path.join(root, 'profiles.json');
    process.env.LLM_CONFIG_ENCRYPTION_KEY = 'ef'.repeat(32);
    process.env.AI_PROVIDER = 'google';
    const store = createLLMProfileStore({ filePath: process.env.LLM_CONFIG_PATH, encryptionKey: process.env.LLM_CONFIG_ENCRYPTION_KEY });
    const profile = store.save({ name: 'Alternatif', provider: 'xai', model: 'model-test', baseURL: 'https://api.x.ai/v1', apiKey: 'new-provider-key' });
    store.activate(profile.id);
    assert.equal(getCurrentLLMProvider(), 'xai');
    let request;
    globalThis.fetch = async (url, options) => { request = { url, options }; return new Response(JSON.stringify({ choices: [{ message: { content: 'aktif sağlayıcı' } }] }), { status: 200, headers: { 'content-type': 'application/json' } }); };
    const reply = await generateLLMResponse([{ role: 'user', content: 'Merhaba' }], { allowMockFallback: false });
    assert.equal(reply, 'aktif sağlayıcı');
    assert.equal(request.url, 'https://api.x.ai/v1/chat/completions');
    assert.equal(request.options.headers.Authorization, 'Bearer new-provider-key');
    assert.equal(JSON.parse(request.options.body).model, 'model-test');
  } finally {
    globalThis.fetch = original.fetch;
    for (const [name, value] of [['LLM_CONFIG_PATH', original.path], ['LLM_CONFIG_ENCRYPTION_KEY', original.key], ['AI_PROVIDER', original.provider]]) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Google profile uses its configured base URL and keeps the key out of the URL', async () => {
  const original = globalThis.fetch;
  let request;
  try {
    globalThis.fetch = async (url, options) => { request = { url, options }; return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'google ok' }] } }] }), { status: 200 }); };
    const result = await generateLLMResponse([{ role: 'user', content: 'Hi' }], { provider: 'google', model: 'gemini-test', baseURL: 'https://generativelanguage.googleapis.com/v1beta', apiKey: 'google-secret' });
    assert.equal(result, 'google ok');
    assert.equal(request.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent');
    assert.equal(request.options.headers['x-goog-api-key'], 'google-secret');
    assert.equal(request.url.includes('google-secret'), false);
  } finally { globalThis.fetch = original; }
});

test('Anthropic profile sends native Messages request', async () => {
  const original = globalThis.fetch;
  let request;
  try {
    globalThis.fetch = async (url, options) => { request = { url, options }; return new Response(JSON.stringify({ content: [{ type: 'text', text: 'anthropic ok' }] }), { status: 200 }); };
    const result = await generateLLMResponse([{ role: 'system', content: 'System' }, { role: 'user', content: 'Hi' }], { provider: 'anthropic', model: 'claude-test', baseURL: 'https://api.anthropic.com/v1', apiKey: 'anthropic-secret' });
    assert.equal(result, 'anthropic ok');
    assert.equal(request.url, 'https://api.anthropic.com/v1/messages');
    assert.equal(request.options.headers['x-api-key'], 'anthropic-secret');
    assert.equal(JSON.parse(request.options.body).system, 'System');
  } finally { globalThis.fetch = original; }
});

test('OpenAI chat calls use the current completion token field', async () => {
  const original = globalThis.fetch;
  let body;
  try {
    globalThis.fetch = async (_url, options) => { body = JSON.parse(options.body); return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 }); };
    await generateLLMResponse([{ role: 'user', content: 'Hi' }], { provider: 'openai', model: 'o3', baseURL: 'https://api.openai.com/v1', apiKey: 'test-key' });
    assert.equal(body.max_completion_tokens, 8192);
    assert.equal(Object.hasOwn(body, 'max_tokens'), false);
  } finally { globalThis.fetch = original; }
});
