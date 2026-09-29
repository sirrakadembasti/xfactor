import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../');
const html = fs.readFileSync(path.join(root, 'backend/llm-auth/llm.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'backend/llm-auth/llm-ui.js'), 'utf8');
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

describe('LLM yönetimi formu', () => {
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
      expect(cards[0].textContent).toContain('Son test: Başarılı');
      expect(cards[1].textContent).toContain('Son test: Yapılmadı');
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
      expect(document.querySelectorAll('#profiles .card')[1].textContent).toContain('Son test: Başarılı');
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
