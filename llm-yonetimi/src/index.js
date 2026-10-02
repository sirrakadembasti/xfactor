import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateProfileResponse, classifyLLMError } from './runtime.js';
export { generateProfileResponse, classifyLLMError } from './runtime.js';
import { providerFetch } from './providerTransport.js';
import { PROVIDERS, validateProviderUrl } from './providers.js';
import { createLLMProfileStore } from './profileStore.js';
export { PROVIDERS, validateProviderUrl, createLLMProfileStore };
const here=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
function providerEndpoint(profile, suffix) {
  const base = validateProviderUrl(profile.baseURL, { allowLocalHttp: process.env.LLM_ALLOW_LOCAL_HTTP === 'true' }).replace(/\/+$/, '');
  return `${base.replace(/\/(chat\/completions|messages|models)$/, '')}/${suffix}`;
}

export function mountLLMManagement(app, { store = createLLMProfileStore(), requireAuth, generate, apiPath = '/api/llm', pagePath = '/llm', requireCsrf = true } = {}) {
  if (typeof requireAuth !== 'function') throw new Error('LLM yönetimi için requireAuth zorunludur.');
  if (![apiPath, pagePath].every(value => /^\/[a-zA-Z0-9/_-]+$/.test(value))) throw new Error('Geçersiz eklenti mount yolu.');
  const pendingTests = new Set();
  const admin = (req, res, next) => req.user?.isAdmin === true ? next() : res.status(403).json({ error: 'Yönetici yetkisi gerekli.' });
  const protect = [requireAuth, admin];
  app.get(pagePath, ...protect, (_req, res) => {
    let html = fs.readFileSync(path.join(here, 'llm.html'), 'utf8');
    html = html.replace(/data-api-base="[^"]*"/, 'data-api-base="'+apiPath+'"');
    if (!html.includes('data-api-base=')) html = html.replace('<body', '<body data-api-base="'+apiPath+'"');
    html = html.replace(/src="(?:\.\/|\/llm\/)llm-ui\.js"/, 'src="'+pagePath+'/llm-ui.js"');
    res.type('html').send(html);
  });
  app.get(pagePath+'/llm-ui.js', ...protect, (_req, res) => res.type('text/javascript').sendFile(path.join(here, 'llm-ui.js')));
  const router = Router();
  router.use(...protect);
  router.use((req, res, next) => {
    if (requireCsrf && !['GET','HEAD','OPTIONS'].includes(req.method) && req.get('X-XFactor-CSRF') !== '1') return res.status(403).json({ error:'İstek doğrulama başlığı eksik.', code:'CSRF_REQUIRED' });
    next();
  });
  router.get('/catalog', (_req, res) => res.json({ providers: PROVIDERS }));
  router.get('/profiles', (_req, res) => res.json(store.list()));
  const respondError = (res, error) => res.status(error.code === 'PROFILE_CONFLICT' ? 409 : 400).json({ error: error.message, code: error.code || 'PROFILE_INVALID' });
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
    const mode = req.body?.mode || 'quick';
    if (!['quick', 'conversation'].includes(mode)) return res.status(400).json({error:'Geçersiz test türü.',code:'TEST_MODE_INVALID'});
    if (pendingTests.has(req.params.id)) return res.status(409).json({error:'Bu profil için test devam ediyor.',code:'TEST_IN_PROGRESS'});
    pendingTests.add(req.params.id);
    const start = Date.now();
    let profile;
    try {
      profile = store.get(req.params.id);
      if (!profile) return res.sendStatus(404);
      const messages = mode === 'quick' ? [{role:'user',content:'Yalnızca OK yaz.'}] : [
        {role:'system',content:'Bir yazılım projesinin Manager ajanısın. Türkçe yanıt ver; yapılmamış işlemi yapılmış gibi gösterme.'},
        {role:'user',content:'Otel yönetimi uygulaması için oda, rezervasyon, kullanıcı rolleri ve veri güvenliğini kapsayan kısa bir mimari plan öner.'}
      ];
      const options = {...profile, purpose:'manager', timeoutMs:profile.timeoutMs,
        maxOutputTokens: mode === 'quick' ? 512 : profile.maxOutputTokens, useManagedProfile:false, allowMockFallback:false};
      const reply = generate ? await generate(messages, options) : await generateProfileResponse(messages, profile, options);
      if (!reply) { const error=new Error('Model kullanılabilir cevap üretmedi.'); error.code='LLM_EMPTY_RESPONSE'; throw error; }
      const durationMs = Date.now()-start;
      if (store.recordTest(profile.id, 'passed', profile.revision, {mode,durationMs}) === null) return res.status(409).json({error:'Profil test sırasında değişti; yeniden sınayın.',code:'PROFILE_CONFLICT'});
      res.json({ok:true, mode, durationMs, message: mode === 'quick' ? 'Kısa bağlantı ve model yanıtı doğrulandı.' : 'Sohbet tarzı model yanıtı doğrulandı. Bu test üretim kabul testi değildir.'});
    } catch(error) {
      const classified = classifyLLMError(error);
      if (profile) { try { store.recordTest(profile.id,'failed',profile.revision,{mode,durationMs:Date.now()-start,code:classified.code}); } catch {} }
      res.status(classified.status).json({...classified,mode,durationMs:Date.now()-start});
    } finally { pendingTests.delete(req.params.id); }
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
  app.use(apiPath, router);
  return router;
}
