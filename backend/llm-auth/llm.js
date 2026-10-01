import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import { providerFetch } from './providerTransport.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const PROVIDERS = Object.freeze([
  { id: 'openai', name: 'OpenAI', region: 'ABD', transport: 'openai', baseURL: 'https://api.openai.com/v1' },
  { id: 'anthropic', name: 'Anthropic', region: 'ABD', transport: 'anthropic', baseURL: 'https://api.anthropic.com/v1' },
  { id: 'google', name: 'Google Gemini', region: 'ABD', transport: 'google', baseURL: 'https://generativelanguage.googleapis.com/v1beta' },
  { id: 'xai', name: 'xAI', region: 'ABD', transport: 'openai', baseURL: 'https://api.x.ai/v1' },
  { id: 'openrouter', name: 'OpenRouter', region: 'ABD', transport: 'openai', baseURL: 'https://openrouter.ai/api/v1' },
  { id: 'perplexity', name: 'Perplexity', region: 'ABD', transport: 'openai', baseURL: 'https://api.perplexity.ai' },
  { id: 'groq', name: 'Groq', region: 'ABD', transport: 'openai', baseURL: 'https://api.groq.com/openai/v1' },
  { id: 'together', name: 'Together AI', region: 'ABD', transport: 'openai', baseURL: 'https://api.together.xyz/v1' },
  { id: 'fireworks', name: 'Fireworks AI', region: 'ABD', transport: 'openai', baseURL: 'https://api.fireworks.ai/inference/v1' },
  { id: 'cohere', name: 'Cohere', region: 'Kanada', transport: 'openai', baseURL: 'https://api.cohere.ai/compatibility/v1' },
  { id: 'deepseek', name: 'DeepSeek', region: 'Çin', transport: 'openai', baseURL: 'https://api.deepseek.com' },
  { id: 'qwen', name: 'Alibaba Qwen', region: 'Çin', transport: 'openai', baseURL: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1' },
  { id: 'kimi', name: 'Moonshot Kimi', region: 'Çin', transport: 'openai', baseURL: 'https://api.moonshot.ai/v1' },
  { id: 'minimax', name: 'MiniMax', region: 'Çin', transport: 'openai', baseURL: 'https://api.minimax.io/v1' },
  { id: 'zhipu', name: 'Zhipu GLM', region: 'Çin', transport: 'openai', baseURL: 'https://open.bigmodel.cn/api/paas/v4' },
  { id: 'siliconflow', name: 'SiliconFlow', region: 'Çin', transport: 'openai', baseURL: 'https://api.siliconflow.cn/v1' },
  { id: 'baidu', name: 'Baidu Qianfan', region: 'Çin', transport: 'openai', baseURL: 'https://qianfan.baidubce.com/v2' },
  { id: 'doubao', name: 'ByteDance Doubao', region: 'Çin', transport: 'openai', baseURL: 'https://ark.cn-beijing.volces.com/api/v3' },
  { id: 'hunyuan', name: 'Tencent Hunyuan', region: 'Çin', transport: 'openai', baseURL: 'https://api.hunyuan.cloud.tencent.com/v1' },
  { id: 'xiaomi_mimo', name: 'Xiaomi MiMo Token Plan (Singapur)', region: 'Çin', transport: 'openai', baseURL: 'https://token-plan-sgp.xiaomimimo.com/v1', models: ['mimo-v2.6-pro', 'mimo-v2.6-flash', 'mimo-v2.5-pro', 'mimo-v2.5'] },
  { id: 'custom', name: 'Özel OpenAI uyumlu', region: 'Özel', transport: 'openai', baseURL: '' }
]);

const disallowedHost = /(^|\.)(localhost|local|internal)$/i;
export function validateProviderUrl(value, { allowLocalHttp = false } = {}) {
  let url;
  try { url = new URL(String(value || '')); } catch { throw new Error('Geçerli bir API adresi girin.'); }
  if (url.username || url.password) throw new Error('API adresinde kimlik bilgisi bulunamaz.');
  if (url.search || url.hash) throw new Error('API adresinde sorgu veya parça bulunamaz.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const local = disallowedHost.test(host) || host === '127.0.0.1' || host === '::1';
  const ip = net.isIP(host);
  if (local && !(allowLocalHttp && url.protocol === 'http:')) throw new Error('Yerel API adresi kapalıdır.');
  if (ip && !allowLocalHttp) throw new Error('IP adresine doğrudan bağlantı kapalıdır.');
  if (url.protocol !== 'https:' && !(allowLocalHttp && local && url.protocol === 'http:')) throw new Error('API adresi HTTPS kullanmalıdır.');
  return url.toString().replace(/\/$/, '');
}

function keyBytes(value) {
  const raw = String(value || '').trim();
  const bytes = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (bytes.length !== 32) throw new Error('LLM_CONFIG_ENCRYPTION_KEY 32 baytlık hex veya base64 anahtar olmalıdır.');
  return bytes;
}

function encrypt(secret, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map(part => part.toString('base64')).join('.');
}

function decrypt(payload, key) {
  const [iv, tag, data] = String(payload).split('.').map(part => Buffer.from(part, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

const publicProfile = profile => ({ id: profile.id, name: profile.name, provider: profile.provider, model: profile.model, baseURL: profile.baseURL, hasApiKey: Boolean(profile.secret), lastTest: profile.lastTest || null });

export function createLLMProfileStore({ filePath = process.env.LLM_CONFIG_PATH || path.resolve(here, '../data/llm-profiles.json'), encryptionKey = process.env.LLM_CONFIG_ENCRYPTION_KEY, allowLocalHttp = process.env.LLM_ALLOW_LOCAL_HTTP === 'true' } = {}) {
  const read = () => fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : { profiles: [], activeId: null };
  const write = value => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const temporary = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(value), { mode: 0o600, flag: 'wx' });
    try { fs.renameSync(temporary, filePath); } catch (error) { fs.rmSync(temporary, { force: true }); throw error; }
  };
  return {
    list() { const data = read(); return { activeId: data.activeId, profiles: data.profiles.map(publicProfile) }; },
    getActive() {
      const data = read();
      const profile = data.profiles.find(item => item.id === data.activeId);
      if (!profile) return null;
      return { ...publicProfile(profile), apiKey: decrypt(profile.secret, keyBytes(encryptionKey)), transport: PROVIDERS.find(item => item.id === profile.provider)?.transport || 'openai', revision: profile.revision || null };
    },
    get(id) {
      const profile = read().profiles.find(item => item.id === id);
      if (!profile) return null;
      return { ...publicProfile(profile), apiKey: decrypt(profile.secret, keyBytes(encryptionKey)), transport: PROVIDERS.find(item => item.id === profile.provider)?.transport || 'openai', revision: profile.revision || null };
    },
    save(input) {
      const name = String(input?.name || '').trim().slice(0, 80);
      const provider = String(input?.provider || '').trim();
      const model = String(input?.model || '').trim().slice(0, 160);
      if (!name || !model || !PROVIDERS.some(item => item.id === provider)) throw new Error('Sağlayıcı, profil adı ve model zorunludur.');
      const baseURL = validateProviderUrl(input.baseURL, { allowLocalHttp });
      const data = read();
      const existing = data.profiles.find(item => item.id === input.id);
      if (existing && existing.provider !== provider && !String(input.apiKey || '').trim()) throw new Error('Sağlayıcı değişince yeni API anahtarı girin.');
      const secret = String(input.apiKey || '').trim() ? encrypt(String(input.apiKey).trim(), keyBytes(encryptionKey)) : existing?.secret;
      if (!secret) throw new Error('API anahtarı zorunludur.');
      const profile = { id: existing?.id || crypto.randomUUID(), name, provider, model, baseURL, secret, revision: crypto.randomUUID(), lastTest: null };
      data.profiles = existing ? data.profiles.map(item => item.id === existing.id ? profile : item) : [...data.profiles, profile];
      write(data);
      return publicProfile(profile);
    },
    activate(id) {
      const data = read();
      if (!data.profiles.some(item => item.id === id)) throw new Error('Profil bulunamadı.');
      data.activeId = id;
      write(data);
      return this.list();
    },
    recordTest(id, status, expectedRevision) {
      if (!['passed', 'failed'].includes(status)) throw new Error('Geçersiz bağlantı testi sonucu.');
      const data = read();
      const profile = data.profiles.find(item => item.id === id);
      if (!profile) throw new Error('Profil bulunamadı.');
      if (expectedRevision !== undefined && (profile.revision || null) !== expectedRevision) return null;
      profile.lastTest = { status, at: new Date().toISOString() };
      write(data);
      return publicProfile(profile);
    },
    remove(id) {
      const data = read();
      if (!data.profiles.some(item => item.id === id)) throw new Error('Profil bulunamadı.');
      data.profiles = data.profiles.filter(item => item.id !== id);
      if (data.activeId === id) data.activeId = null;
      write(data);
      return this.list();
    }
  };
}

function providerEndpoint(profile, suffix) {
  const base = validateProviderUrl(profile.baseURL, { allowLocalHttp: process.env.LLM_ALLOW_LOCAL_HTTP === 'true' }).replace(/\/+$/, '');
  return `${base.replace(/\/(chat\/completions|messages|models)$/, '')}/${suffix}`;
}

async function probeProfile(profile) {
  const maxOutputTokens = 512;
  let url;
  let headers;
  let body;
  if (profile.transport === 'google') {
    url = providerEndpoint(profile, `models/${encodeURIComponent(profile.model)}:generateContent`);
    headers = { 'content-type': 'application/json', 'x-goog-api-key': profile.apiKey };
    body = { contents: [{ role: 'user', parts: [{ text: 'OK yaz.' }] }], generationConfig: { maxOutputTokens } };
  } else if (profile.transport === 'anthropic') {
    url = providerEndpoint(profile, 'messages');
    headers = { 'content-type': 'application/json', 'x-api-key': profile.apiKey, 'anthropic-version': '2023-06-01' };
    body = { model: profile.model, max_tokens: maxOutputTokens, messages: [{ role: 'user', content: 'OK yaz.' }] };
  } else {
    url = providerEndpoint(profile, 'chat/completions');
    headers = { 'content-type': 'application/json', Authorization: `Bearer ${profile.apiKey}` };
    body = { model: profile.model, ...(profile.provider === 'openai' ? { max_completion_tokens: maxOutputTokens } : { max_tokens: maxOutputTokens }), messages: [{ role: 'user', content: 'OK yaz.' }] };
  }
  const response = await providerFetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(45000) });
  if (!response.ok) throw new Error(`Sağlayıcı HTTP ${response.status} döndürdü.`);
  const payload = await response.json();
  const content = profile.transport === 'google'
    ? payload.candidates?.[0]?.content?.parts?.find(part => part.text)?.text
    : profile.transport === 'anthropic'
      ? payload.content?.find(part => part.type === 'text')?.text
      : payload.choices?.[0]?.message?.content;
  if (!content) {
    const finishReason = payload.choices?.[0]?.finish_reason || payload.candidates?.[0]?.finishReason;
    throw new Error(finishReason === 'length' || finishReason === 'MAX_TOKENS'
      ? 'Model yanıtı token sınırına takıldı; daha kısa istem veya farklı model deneyin.'
      : 'Sağlayıcıdan model yanıtı alınamadı.');
  }
  return content;
}

export function mountLLMManagement(app, { store = createLLMProfileStore(), requireAuth, generate } = {}) {
  if (typeof requireAuth !== 'function') throw new Error('LLM yönetimi için requireAuth zorunludur.');
  const admin = (req, res, next) => req.user?.isAdmin === true ? next() : res.status(403).json({ error: 'Yönetici yetkisi gerekli.' });
  const protect = [requireAuth, admin];
  app.get('/llm', ...protect, (_req, res) => res.sendFile(path.join(here, 'llm.html')));
  app.get('/llm/llm-ui.js', ...protect, (_req, res) => res.type('text/javascript').sendFile(path.join(here, 'llm-ui.js')));
  const router = Router();
  router.use(...protect);
  router.get('/catalog', (_req, res) => res.json({ providers: PROVIDERS }));
  router.get('/profiles', (_req, res) => res.json(store.list()));
  const respondError = (res, error) => res.status(400).json({ error: error.message });
  router.post('/profiles', (req, res) => {
    try { res.status(201).json(store.save(req.body)); } catch (error) { respondError(res, error); }
  });
  router.put('/profiles/:id', (req, res) => {
    try {
      if (!store.list().profiles.some(item => item.id === req.params.id)) return res.sendStatus(404);
      res.json(store.save({ ...req.body, id: req.params.id }));
    } catch (error) { respondError(res, error); }
  });
  router.delete('/profiles/:id', (req, res) => {
    try { res.json(store.remove(req.params.id)); } catch (error) { respondError(res, error); }
  });
  router.post('/profiles/:id/activate', (req, res) => {
    try { res.json(store.activate(req.params.id)); } catch (error) { respondError(res, error); }
  });
  router.post('/profiles/:id/test', async (req, res) => {
    let profile;
    try {
      profile = store.get(req.params.id);
      if (!profile) return res.sendStatus(404);
      const reply = generate
        ? await generate([{ role: 'user', content: 'Yalnızca OK yaz.' }], { provider: profile.provider, transport: profile.transport, model: profile.model, baseURL: profile.baseURL, apiKey: profile.apiKey, timeoutMs: 15000, allowMockFallback: false })
        : await probeProfile(profile);
      if (!reply) throw new Error('Sağlayıcıdan model yanıtı alınamadı.');
      if (store.recordTest?.(profile.id, 'passed', profile.revision) === null) throw new Error('Profil test sırasında değişti; yeniden sınayın.');
      res.json({ ok: true, message: 'Bağlantı ve model yanıtı doğrulandı.' });
    } catch (error) {
      if (profile) {
        try { store.recordTest?.(profile.id, 'failed', profile.revision); } catch {}
      }
      let knownKey = '';
      try { knownKey = store.get(req.params.id)?.apiKey || ''; } catch {}
      const safeMessage = (knownKey ? String(error.message).replaceAll(knownKey, '[gizli]') : String(error.message)).replace(/Bearer\s+\S+/gi, 'Bearer [gizli]').slice(0, 240);
      res.status(502).json({ error: `Bağlantı testi başarısız: ${safeMessage}` });
    }
  });
  router.get('/profiles/:id/models', async (req, res) => {
    try {
      const profile = store.get(req.params.id);
      if (!profile) return res.sendStatus(404);
      const suffix = profile.transport === 'google' ? 'models' : 'models';
      const headers = profile.transport === 'anthropic'
        ? { 'x-api-key': profile.apiKey, 'anthropic-version': '2023-06-01' }
        : profile.transport === 'google'
          ? { 'x-goog-api-key': profile.apiKey }
          : { Authorization: `Bearer ${profile.apiKey}` };
      const url = providerEndpoint(profile, suffix);
      const response = await providerFetch(url, { headers, signal: AbortSignal.timeout(10000) });
      if (!response.ok) return res.status(502).json({ error: `Model listesi alınamadı (HTTP ${response.status}). Model kimliğini elle girebilirsiniz.` });
      const body = await response.json();
      const models = (body.data || body.models || []).map(item => item.id || item.name).filter(Boolean)
        .map(id => profile.transport === 'google' ? String(id).replace(/^models\//, '') : String(id)).slice(0, 500);
      res.json({ models });
    } catch {
      res.status(502).json({ error: 'Model listesi alınamadı. Model kimliğini elle girebilirsiniz.' });
    }
  });
  app.use('/api/llm', router);
  return router;
}
