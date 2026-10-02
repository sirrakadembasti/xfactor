import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../');
const html = fs.readFileSync(path.join(root, 'llm-yonetimi/public/llm.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'llm-yonetimi/public/llm-ui.js'), 'utf8');
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

describe('LLM yönetimi formu', () => {
  it('başarılı bağlantı sonucunu başarısız sohbet sonucunun yanında korur', async () => {
    const dom = new JSDOM(html, { url: 'http://localhost/llm', runScripts: 'outside-only' });
    const profile = { id: 'mimo', name: 'MiMo', provider: 'xiaomi_mimo', model: 'mimo', baseURL: 'https://example.com', lastTest: { status: 'failed', mode: 'conversation' }, lastTests: {
      quick: { status: 'passed', mode: 'quick', durationMs: 1200, at: '2026-10-01T10:00:00Z' },
      conversation: { status: 'failed', mode: 'conversation', durationMs: 31500, at: '2026-10-01T10:01:00Z', code: 'LLM_TIMEOUT' }
    } };
    dom.window.fetch = async url => ({ ok: true, json: async () => url.endsWith('/catalog') ? { providers: [] } : { profiles: [profile], activeId: profile.id } });
    try {
      dom.window.eval(script); await tick();
      const card = dom.window.document.querySelector('.card').textContent;
      expect(card).toContain('Bağlantı testi: Başarılı');
      expect(card).toContain('1.2 sn');
      expect(card).toContain('Sohbet testi: Başarısız');
      expect(card).toContain('31.5 sn');
      expect(card).toContain('LLM_TIMEOUT');
    } finally { dom.window.close(); }
  });
  it('yeniden kullanılabilir adresleri, sohbet testini ve geçmiş hata ayrıntılarını gösterir', async () => {
    const dom = new JSDOM(html, { url: 'http://localhost/admin/', runScripts: 'outside-only' });
    dom.window.document.body.dataset.apiBase = '/custom/llm/';
    dom.window.document.body.dataset.homeUrl = '/workspace';
    const requests = [];
    const profile = { id: 'mimo', name: 'MiMo', provider: 'xiaomi_mimo', model: 'mimo-test', baseURL: 'https://example.com', hasApiKey: true, timeoutMs: 300000, lastTest: { status: 'failed', mode: 'conversation', durationMs: 12500, code: 'PROVIDER_TIMEOUT', at: '2026-09-29T10:00:00.000Z' } };
    dom.window.fetch = async (url, options = {}) => {
      requests.push({ url, options });
      return { ok: true, json: async () => url.endsWith('/catalog') ? { providers: [] } : url.endsWith('/profiles') ? { profiles: [profile], activeId: 'mimo' } : { message: 'Tamamlandı' } };
    };
    try {
      dom.window.eval(script); await tick();
      const doc = dom.window.document;
      expect(doc.getElementById('home-link').getAttribute('href')).toBe('/workspace');
      expect(doc.querySelector('.card').textContent).toContain('12.5 sn');
      expect(doc.querySelector('.card').textContent).toContain('PROVIDER_TIMEOUT');
      expect(doc.querySelector('.card').textContent).toContain('güncel sağlık durumu değildir');
      [...doc.querySelectorAll('.card button')].find(button => button.textContent === 'Sohbeti sına').click(); await tick();
      const probe = requests.find(item => item.url.endsWith('/test'));
      expect(probe.url).toBe('/custom/llm/profiles/mimo/test');
      expect(JSON.parse(probe.options.body)).toEqual({ mode: 'conversation' });
    } finally { dom.window.close(); }
  });

  it('JSON olmayan 401 hatasında formu ve ayarları korur ve yeniden denemeye açar', async () => {
    const dom = new JSDOM(html, { url: 'http://localhost/llm', runScripts: 'outside-only' });
    dom.window.fetch = async (url, options = {}) => options.method === 'POST'
      ? { ok: false, status: 401, headers: { get: () => 'support-123' }, json: async () => { throw new Error('html'); } }
      : { ok: true, json: async () => url.endsWith('/catalog') ? { providers: [{ id: 'google', name: 'Google', models: ['model'], baseURL: 'https://example.com' }] } : { profiles: [], activeId: null } };
    try {
      dom.window.eval(script); await tick();
      const doc = dom.window.document;
      doc.getElementById('name').value = 'Kaybolmamalı';
      doc.getElementById('timeout-ms').value = '200000';
      doc.getElementById('profile-form').dispatchEvent(new dom.window.Event('submit', { cancelable: true })); await tick();
      expect(doc.getElementById('message').textContent).toContain('Yeniden giriş');
      expect(doc.getElementById('message').textContent).toContain('support-123');
      expect(doc.getElementById('name').value).toBe('Kaybolmamalı');
      expect(doc.getElementById('timeout-ms').value).toBe('200000');
      expect(doc.querySelector('button[type="submit"]').disabled).toBe(false);
    } finally { dom.window.close(); }
  });

  it('yanıtsız sağlayıcı isteğini profil sınırından sonra bitirir ve kontrolleri açar', async () => {
    const dom = new JSDOM(html, { url: 'http://localhost/llm', runScripts: 'outside-only' });
    const profile = { id: 'slow', name: 'Slow', provider: 'google', model: 'model', baseURL: 'https://example.com', timeoutMs: 5000 };
    dom.window.fetch = async url => url.endsWith('/test') ? new Promise(() => {}) : { ok: true, json: async () => url.endsWith('/catalog') ? { providers: [] } : { profiles: [profile], activeId: null } };
    try {
      dom.window.eval(script); await tick();
      vi.useFakeTimers();
      dom.window.setTimeout = setTimeout; dom.window.clearTimeout = clearTimeout;
      dom.window.setInterval = setInterval; dom.window.clearInterval = clearInterval;
      [...dom.window.document.querySelectorAll('.card button')].find(button => button.textContent === 'Bağlantıyı sına').click();
      await vi.advanceTimersByTimeAsync(35001);
      expect(dom.window.document.getElementById('message').textContent).toContain('zaman aşımına');
      expect(dom.window.document.getElementById('clear-form').disabled).toBe(false);
    } finally { vi.useRealTimers(); dom.window.close(); }
  });
  it('bekleyen kayıt sırasında ikinci gönderimi ve eşzamanlı profil değişikliğini engeller', async () => {
    const dom = new JSDOM(html, { url: 'http://localhost/llm', runScripts: 'outside-only' });
    const writes = [];
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    dom.window.fetch = async (url, options = {}) => {
      if (options.method === 'POST') { writes.push(url); await pending; }
      return { ok: true, json: async () => url.endsWith('/catalog') ? { providers: [{ id: 'google', name: 'Google', region: 'ABD', models: ['model'], baseURL: 'https://example.com' }] } : { profiles: [], activeId: null } };
    };
    try {
      dom.window.eval(script); await tick();
      const form = dom.window.document.getElementById('profile-form');
      form.dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
      form.dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
      expect(writes).toHaveLength(1);
      expect(form.querySelector('button[type="submit"]').disabled).toBe(true);
      expect(dom.window.document.getElementById('clear-form').disabled).toBe(true);
    } finally { release(); await tick(); dom.window.close(); }
  });

  it('düzenlerken profil ayarlarını ve sağlayıcı modellerini doldurur; boş anahtarı korur', async () => {
    const dom = new JSDOM(html, { url: 'http://localhost/llm', runScripts: 'outside-only' });
    const profile = { id: 'mimo', name: 'MiMo', provider: 'xiaomi_mimo', model: 'custom-model', baseURL: 'https://example.com/v1', timeoutMs: 180000, maxOutputTokens: 16000, thinking: 'enabled', hasApiKey: true, revision: 7 };
    const writes = [];
    dom.window.scrollTo = () => {};
    dom.window.fetch = async (url, options = {}) => {
      if (options.method === 'PUT') writes.push(JSON.parse(options.body));
      return { ok: true, json: async () => url.endsWith('/catalog') ? { providers: [{ id: 'google', name: 'Google', models: ['google-model'] }, { id: 'xiaomi_mimo', name: 'MiMo', models: ['mimo-model'] }] } : { profiles: [profile], activeId: 'mimo' } };
    };
    try {
      dom.window.eval(script); await tick();
      const doc = dom.window.document;
      doc.querySelector('.card button').click(); await tick();
      expect(doc.getElementById('known-models').textContent).toBe('');
      expect([...doc.querySelectorAll('#known-models option')].map(option => option.value)).toContain('mimo-model');
      expect(doc.getElementById('timeout-ms').value).toBe('180000');
      expect(doc.getElementById('max-output-tokens').value).toBe('16000');
      expect(doc.getElementById('thinking').value).toBe('enabled');
      doc.getElementById('profile-form').dispatchEvent(new dom.window.Event('submit', { cancelable: true })); await tick();
      expect(writes[0]).toMatchObject({ timeoutMs: 180000, maxOutputTokens: 16000, thinking: 'enabled', revision: 7 });
      expect(writes[0]).not.toHaveProperty('apiKey');
    } finally { dom.window.close(); }
  });
  it('etkin profili ve son test durumunu gösterir; yalnız pasif profili etkinleştirmeye izin verir', async () => {
    const dom = new JSDOM(html, { url: 'http://127.0.0.1:5173/llm', runScripts: 'outside-only' });
    const profiles = [
      { id: 'google-1', name: 'Google', provider: 'google', model: 'gemini-test', baseURL: 'https://generativelanguage.googleapis.com/v1beta', hasApiKey: true, lastTest: { status: 'passed', at: '2026-09-29T10:00:00.000Z' } },
      { id: 'mimo-1', name: 'MiMo', provider: 'xiaomi_mimo', model: 'mimo-v2.6-pro', baseURL: 'https://token-plan-sgp.xiaomimimo.com/v1', hasApiKey: true, lastTest: null }
    ];
    let activeId = 'google-1';
    dom.window.fetch = async (url, options = {}) => {
      if (url.endsWith('/activate')) activeId = 'mimo-1';
      if (url.endsWith('/test')) profiles[1].lastTest = { status: 'passed', at: '2026-09-29T11:00:00.000Z' };
      const body = url.endsWith('/catalog') ? { providers: [] }
        : url.endsWith('/profiles') ? { profiles, activeId }
          : { message: 'Bağlantı doğrulandı.' };
      return { ok: true, json: async () => body };
    };
    try {
      dom.window.eval(script);
      await tick();
      const document = dom.window.document;
      expect(document.getElementById('active-summary').textContent).toContain('Google');
      const cards = [...document.querySelectorAll('#profiles .card')];
      expect(cards[0].textContent).toContain('Bağlantı testi: Başarılı');
      expect(cards[0].textContent).toContain('Sohbet testi: Yapılmadı');
      expect(cards[1].textContent).toContain('Bağlantı testi: Yapılmadı');
      expect(cards[1].textContent).toContain('Sohbet testi: Yapılmadı');
      expect([...cards[0].querySelectorAll('button')].find(button => button.textContent === 'Etkin').disabled).toBe(true);
      const activate = [...cards[1].querySelectorAll('button')].find(button => button.textContent === 'Etkinleştir');
      expect(activate.disabled).toBe(false);
      activate.click();
      await tick();
      expect(document.getElementById('active-summary').textContent).toContain('MiMo');
      const updated = [...document.querySelectorAll('#profiles .card')];
      expect([...updated[1].querySelectorAll('button')].find(button => button.textContent === 'Etkin').disabled).toBe(true);
      [...updated[1].querySelectorAll('button')].find(button => button.textContent === 'Bağlantıyı sına').click();
      await tick();
      expect(document.querySelectorAll('#profiles .card')[1].textContent).toContain('Bağlantı testi: Başarılı');
    } finally { dom.window.close(); }
  });

  it('düzenleme ve bağlantı testi için CSRF başlığı gönderir; adres ve modeli elle kabul eder', async () => {
    const dom = new JSDOM(html, { url: 'http://127.0.0.1:5173/llm', runScripts: 'outside-only' });
    const requests = [];
    const profile = { id: 'google-1', name: 'Google', provider: 'google', baseURL: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-test', hasApiKey: true };
    dom.window.scrollTo = () => {};
    dom.window.fetch = async (url, options = {}) => {
      requests.push({ url, options });
      const body = url.endsWith('/catalog')
        ? { providers: [{ id: 'google', name: 'Google', region: 'ABD', baseURL: profile.baseURL, models: ['gemini-test'] }, { id: 'xiaomi_mimo', name: 'Xiaomi MiMo', region: 'Çin', baseURL: 'https://token-plan-sgp.xiaomimimo.com/v1', models: ['mimo-v2.6-flash'] }] }
        : url.endsWith('/profiles') ? { profiles: [profile], activeId: profile.id }
          : { message: 'Bağlantı doğrulandı.' };
      return { ok: true, json: async () => body };
    };
    try {
      dom.window.eval(script);
      await tick();
      const document = dom.window.document;
      document.querySelector('.card button').click();
      document.getElementById('provider').value = 'xiaomi_mimo';
      document.getElementById('provider').dispatchEvent(new dom.window.Event('change'));
      expect(document.getElementById('base-url').value).toBe('https://token-plan-sgp.xiaomimimo.com/v1');
      expect(document.getElementById('model').value).toBe('mimo-v2.6-flash');
      document.getElementById('base-url').value = 'https://example.com/custom/v1';
      document.getElementById('model').value = 'manually-added-model';
      document.getElementById('api-key').value = 'replacement-key';
      document.getElementById('profile-form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
      await tick();
      const save = requests.find(item => item.options.method === 'PUT');
      expect(save.options.headers['X-XFactor-CSRF']).toBe('1');
      expect(JSON.parse(save.options.body)).toMatchObject({ baseURL: 'https://example.com/custom/v1', model: 'manually-added-model', apiKey: 'replacement-key' });
      const testButton = [...document.querySelectorAll('.card button')].find(item => item.textContent === 'Bağlantıyı sına');
      testButton.click();
      await tick();
      const probe = requests.find(item => item.url.endsWith('/test'));
      expect(probe.options.headers['X-XFactor-CSRF']).toBe('1');
    } finally {
      dom.window.close();
    }
  });
});
