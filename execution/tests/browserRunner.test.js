import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

// The Docker integration mounts only this file; the runner lives at XFACTOR_BROWSER_RUNNER inside the image.
const RUNNER_MODULE = process.env.XFACTOR_BROWSER_RUNNER || '../browserRunner.cjs';

function mockUiElement(tagName, text, attrs = {}) {
  return { tagName, childNodes: text ? [{ nodeType: 3, textContent: text }] : [], getAttribute: key => attrs[key] || null,
    getClientRects: () => [1], closest: selector => Object.keys(attrs).some(key => selector.includes(`[${key}`)) ? {} : null };
}
function withUiDocument(elements, run, style = () => ({ visibility: 'visible', display: 'block', content: 'none' })) {
  const originalDocument = globalThis.document, originalStyle = globalThis.getComputedStyle;
  globalThis.document = { querySelectorAll: () => elements, getElementById: () => null };
  globalThis.getComputedStyle = style;
  try { return run(); } finally { globalThis.document = originalDocument; globalThis.getComputedStyle = originalStyle; }
}

test('UI evidence captures opened menu and error states without changing action proof (mock)', async () => {
  const { runBrowserJourney } = await import(RUNNER_MODULE);
  let opened = false;
  const control = { waitFor: async () => {}, evaluate: async fn => String(fn).includes('activeElement') ? true : 'Menüyü aç', press: async () => { opened = true; } };
  const page = {
    goto: async () => {}, locator: () => control, keyboard: { press: async () => {} },
    getByText: () => ({ last: () => ({ waitFor: async () => {}, innerText: async () => 'Tamam' }) }),
    evaluate: async fn => fn.name === 'collectVisibleUiText' ? { entries: (opened ? ['Settings', 'An error occurred'] : ['Menüyü aç']).map(text => ({ kind: 'text', text })), truncated: false, redacted: false } : { width: 375, horizontalOverflow: false },
    url: () => 'http://localhost/menu?token=SECRET'
  };
  const chromium = { launch: async () => ({ close: async () => {}, newContext: async () => ({ setDefaultTimeout() {}, route: async () => {}, newPage: async () => page }) }) };
  const result = await runBrowserJourney({ url: 'http://localhost/menu', role: 'admin', authState: 'anonymous', uiLanguageEvidence: { enabled: true, routeTemplates: ['/menu'] }, steps: [{ action: 'click', selector: 'button' }], expectedOutcome: { kind: 'success', text: 'Tamam' } }, { chromium, containerized: false });
  assert.equal(result.actions.length, 1);
  assert.equal(result.actions[0].completed, true);
  assert.deepEqual(result.uiLanguageEvidence.snapshots.map(s => s.state), ['initial', 'before:0', 'after:0', 'outcome']);
  assert.ok(result.uiLanguageEvidence.snapshots.some(s => s.entries.some(e => e.text === 'Settings')));
  assert.ok(result.uiLanguageEvidence.snapshots.some(s => s.entries.some(e => e.text === 'An error occurred')));
  assert.ok(result.uiLanguageEvidence.snapshots.every(s => s.route === '/menu' && s.role === 'anonymous'));
  assert.ok(!JSON.stringify(result.uiLanguageEvidence).includes('SECRET'));
});

test('UI collector includes visible aria-hidden/inert English labels and button input values only', async () => {
  const { collectVisibleUiText } = await import(RUNNER_MODULE);
  const option = { textContent: 'English option' };
  const elements = [mockUiElement('DIV', 'Login', { 'aria-hidden': 'true' }), mockUiElement('DIV', 'Settings', { inert: '' }),
    Object.assign(mockUiElement('SELECT'), { selectedOptions: [option], options: [option] }),
    ...['submit', 'button', 'reset'].map(type => Object.assign(mockUiElement('INPUT', null, { type }), { type, value: `English ${type}` })),
    ...['text', 'password'].map(type => {
      const el = Object.assign(mockUiElement('INPUT', null, { type }), { type });
      Object.defineProperty(el, 'value', { get() { throw new Error('secret read'); } }); return el;
    })];
  const result = withUiDocument(elements, () => collectVisibleUiText({ maxEntries: 100, maxTextLength: 500, maxElements: 100, secrets: [], shadowCoverageVerified: true }));
  for (const text of ['Login', 'Settings', 'English submit', 'English button', 'English reset', 'English option']) assert.ok(result.entries.some(e => e.text === text), text);
  assert.equal(result.truncated, false);
});

test('UI collector blocks unsupported CSS text, closed custom elements and display contents text', async () => {
  const { collectVisibleUiText } = await import(RUNNER_MODULE);
  const variants = [
    [mockUiElement('DIV'), (_el, pseudo) => ({ visibility: 'visible', display: 'block', content: pseudo ? '"Login"' : 'none' })],
    [Object.assign(mockUiElement('X-MENU'), { shadowRoot: null }), () => ({ visibility: 'visible', display: 'block', content: 'none' })],
    [Object.assign(mockUiElement('DIV', 'Login'), { getClientRects: () => [] }), () => ({ visibility: 'visible', display: 'contents', content: 'none' })]
  ];
  for (const [element, style] of variants) {
    const result = withUiDocument([element], () => collectVisibleUiText({ maxEntries: 100, maxTextLength: 500, maxElements: 100, secrets: [] }), style);
    assert.equal(result.truncated, true);
  }
});

test('UI collector blocks native file labels and unobserved native select option surfaces', async () => {
  const { collectVisibleUiText } = await import(RUNNER_MODULE);
  const selected = { textContent: 'Yönetici' };
  const cases = [
    Object.assign(mockUiElement('INPUT', null, { type: 'file' }), { type: 'file' }),
    Object.assign(mockUiElement('SELECT'), { selectedOptions: [selected], options: [selected, { textContent: 'Settings' }] })
  ];
  for (const element of cases) {
    const result = withUiDocument([element], () => collectVisibleUiText({ maxEntries: 100, maxTextLength: 500, maxElements: 100, secrets: [] }));
    assert.equal(result.truncated, true);
  }
});

test('UI evidence route templates never serialize unmatched or encoded secret pathnames', async () => {
  const { sanitizeEvidenceRoute } = await import(RUNNER_MODULE);
  assert.equal(sanitizeEvidenceRoute('http://localhost/users/42?token=secret', ['/users/:id'], ['secret']), '/users/:id');
  for (const [url, templates] of [
    ['http://localhost/reset/secret', ['/reset/:token']],
    ['http://localhost/reset/%73ecret', ['/reset/:token']],
    ['http://localhost/reset/%2573ecret', ['/reset/:token']],
    ['http://localhost/unknown', ['/login']],
    ['http://localhost/login', undefined]
  ]) assert.equal(sanitizeEvidenceRoute(url, templates, ['secret']), null);
});

test('UI evidence blocks unknown routes without exposing URL values or changing action proof', async () => {
  const { runBrowserJourney } = await import(RUNNER_MODULE);
  const page = { goto: async () => {}, url: () => 'http://localhost/reset/%73ecret?access_token=secret',
    getByText: () => ({ last: () => ({ waitFor: async () => {}, innerText: async () => 'Tamam' }) }),
    evaluate: async fn => fn.name === 'collectVisibleUiText' ? { entries: [], truncated: false, redacted: false } : { width: 375, horizontalOverflow: false } };
  const chromium = { launch: async () => ({ close: async () => {}, newContext: async () => ({ setDefaultTimeout() {}, route: async () => {}, newPage: async () => page }) }) };
  const result = await runBrowserJourney({ url: 'http://localhost/login', authState: 'anonymous', role: 'admin',
    login: { url: 'http://localhost/api/login', password: 'secret' }, uiLanguageEvidence: { enabled: true, routeTemplates: ['/reset/:token'] }, expectedOutcome: { kind: 'success', text: 'Tamam' } }, { chromium, containerized: false });
  assert.equal(result.passed, true);
  assert.equal(result.uiLanguageEvidence.truncated, true);
  assert.ok(result.uiLanguageEvidence.snapshots.every(s => s.route === '<unavailable>' && s.error === 'route_unavailable' && s.role === 'anonymous'));
  const serialized = JSON.stringify(result.uiLanguageEvidence);
  for (const forbidden of ['secret', '%73ecret', '/reset', 'access_token']) assert.ok(!serialized.includes(forbidden));
});

test('UI evidence observes asynchronous opened menu only after its explicit readiness assertion', async () => {
  const { runBrowserJourney } = await import(RUNNER_MODULE);
  let ready = false;
  const control = { waitFor: async () => {}, evaluate: async fn => String(fn).includes('activeElement') ? true : 'Aç', press: async () => {} };
  const page = { goto: async () => {}, locator: () => control, keyboard: { press: async () => {} }, url: () => 'http://localhost/menu',
    getByText: text => ({ last: () => ({ waitFor: async () => { if (text === 'Settings') ready = true; }, innerText: async () => 'Tamam' }) }),
    evaluate: async fn => fn.name === 'collectVisibleUiText' ? { entries: [{ kind: 'text', text: ready ? 'Settings' : 'Aç' }], truncated: false, redacted: false } : { width: 375, horizontalOverflow: false } };
  const chromium = { launch: async () => ({ close: async () => {}, newContext: async () => ({ setDefaultTimeout() {}, route: async () => {}, newPage: async () => page }) }) };
  const result = await runBrowserJourney({ url: 'http://localhost/menu', authState: 'anonymous', uiLanguageEvidence: { enabled: true, routeTemplates: ['/menu'] }, steps: [{ action: 'click', selector: 'button' }, { action: 'assert_text', expectedText: 'Settings' }], expectedOutcome: { kind: 'success', text: 'Tamam' } }, { chromium, containerized: false });
  assert.equal(result.uiLanguageEvidence.snapshots.find(s => s.state === 'after:0').entries[0].text, 'Aç');
  assert.equal(result.uiLanguageEvidence.snapshots.find(s => s.state === 'after:1').entries[0].text, 'Settings');
  assert.equal(result.actions.length, 1);
});

test('UI evidence total UTF-8 budget stays below 256 KiB and retains action proof', async () => {
  const { runBrowserJourney } = await import(RUNNER_MODULE);
  const entries = Array.from({ length: 1000 }, (_, index) => ({ kind: 'text', text: `${index}${'Ş'.repeat(1000)}` }));
  const control = { waitFor: async () => {}, evaluate: async fn => String(fn).includes('activeElement') ? true : 'Aç', press: async () => {} };
  const page = { goto: async () => {}, locator: () => control, keyboard: { press: async () => {} }, url: () => 'http://localhost/menu',
    getByText: () => ({ last: () => ({ waitFor: async () => {}, innerText: async () => 'Tamam' }) }),
    evaluate: async fn => fn.name === 'collectVisibleUiText' ? { entries, truncated: false, redacted: false } : { width: 375, horizontalOverflow: false } };
  const chromium = { launch: async () => ({ close: async () => {}, newContext: async () => ({ setDefaultTimeout() {}, route: async () => {}, newPage: async () => page }) }) };
  const result = await runBrowserJourney({ url: 'http://localhost/menu', authState: 'anonymous', role: 'admin', uiLanguageEvidence: { enabled: true, maxTotalBytes: 10000000, routeTemplates: ['/menu'] }, steps: [{ action: 'click', selector: 'button' }], expectedOutcome: { kind: 'success', text: 'Tamam' } }, { chromium, containerized: false });
  assert.equal(result.passed, true);
  assert.equal(result.actions.length, 1);
  assert.equal(result.uiLanguageEvidence.truncated, true);
  assert.ok(Buffer.byteLength(JSON.stringify(result.uiLanguageEvidence), 'utf8') <= 256 * 1024);
});

test('UI collector never reads form values and records truncation (mock DOM)', async () => {
  const { collectVisibleUiText } = await import(RUNNER_MODULE);
  const make = (tagName, text, attrs = {}) => ({ tagName, childNodes: text ? [{ nodeType: 3, textContent: text }] : [], getAttribute: key => attrs[key] || null, getClientRects: () => [1], closest: () => null });
  const input = make('INPUT', null, { placeholder: 'Şifre' });
  Object.defineProperty(input, 'value', { get() { throw new Error('secret value accessed'); } });
  const originalDocument = globalThis.document, originalStyle = globalThis.getComputedStyle;
  globalThis.document = { querySelectorAll: () => [input, make('TEXTAREA', 'SECRET'), make('BUTTON', 'Kaydet'), make('DIV', 'Yönetici')], getElementById: () => null };
  globalThis.getComputedStyle = () => ({ visibility: 'visible', display: 'block' });
  try {
    const result = collectVisibleUiText({ maxEntries: 2, maxTextLength: 100, maxElements: 100, secrets: [] });
    assert.equal(result.truncated, true);
    assert.ok(!JSON.stringify(result).includes('SECRET'));
    assert.ok(result.entries.some(e => e.text === 'Şifre'));
  } finally { globalThis.document = originalDocument; globalThis.getComputedStyle = originalStyle; }
});

test('isolated browser observes role, actions and mobile outcome', async () => {
  const { runBrowserJourney } = await import(RUNNER_MODULE);
  const { chromium } = await import('playwright-core');
  const server = http.createServer(async (req, res) => {
    if (req.url === '/login') {
      const chunks = []; for await (const c of req) chunks.push(c);
      const body = JSON.parse(Buffer.concat(chunks));
      if (body.password !== 'fixture') { res.writeHead(401).end(); return; }
      res.setHeader('set-cookie', 'session=manager; HttpOnly; SameSite=Lax; Path=/');
      res.end(JSON.stringify({ user: { role: body.username === 'wrong-role' ? 'viewer' : 'manager' } })); return;
    }
    const loggedIn = req.headers.cookie?.includes('session=manager');
    res.setHeader('content-type', 'text/html');
    res.end(`<main><label for="name">Name</label><input id="name"><button id="save" onclick="document.querySelector('#result').textContent='${loggedIn ? 'Saved' : 'Denied'}'">Save</button><p id="result"></p>
      <form id="role-login" onsubmit="event.preventDefault(); fetch('/login', {method:'POST', body:JSON.stringify({username:this.elements.username.value,password:this.elements.password.value})}).then(response => {document.querySelector('#result').textContent=response.ok?'Signed in through form':'Login rejected';})">
        <label for="username">Username</label><input id="username" name="username">
        <label for="password">Password</label><input id="password" name="password" type="password">
        <button type="submit">Sign in</button>
      </form></main>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const frontend = http.createServer(server.listeners('request')[0]);
  await new Promise(resolve => frontend.listen(0, '127.0.0.1', resolve));
  const frontendUrl = `http://127.0.0.1:${frontend.address().port}`;
  const launchOptions = { ...(process.env.XFACTOR_TEST_CHROMIUM ? { executablePath: process.env.XFACTOR_TEST_CHROMIUM } : {}), headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'] };
  const request = { url: frontendUrl, role: 'manager', authState: 'authenticated', viewportWidth: 375,
    login: { url: `${url}/login`, username: 'manager', password: 'fixture', identityField: 'username', passwordField: 'password', tokenField: 'token' },
    steps: [{ action: 'fill', selector: '#name', value: 'Example' }, { action: 'click', selector: '#save' }],
    expectedOutcome: { kind: 'success', text: 'Saved' } };
  try {
    const result = await runBrowserJourney(request, { chromium, launchOptions });
    assert.equal(result.passed, true);
    assert.equal(result.session.authenticatedRole, 'manager');
    assert.equal(result.actions.length, 2);
    assert.ok(result.actions.every(a => a.completed && a.accessibleName && a.keyboardReachable));
    assert.equal(result.viewport.horizontalOverflow, false);
    assert.equal(result.outcome.text, 'Saved');
    const formLogin = await runBrowserJourney({ ...request, steps: [
      { action: 'fill', selector: '#username', value: 'manager' },
      { action: 'fill', selector: '#password', value: 'approved-example-password' },
      { action: 'submit', selector: '#role-login' }
    ], expectedOutcome: { kind: 'success', text: 'Signed in through form' } }, { chromium, launchOptions });
    assert.equal(formLogin.passed, true);
    const anonymous = await runBrowserJourney({ ...request, login: undefined, authState: 'anonymous', expectedOutcome: { kind: 'denied', text: 'Denied' } }, { chromium, launchOptions });
    assert.equal(anonymous.session.anonymous, true);
    assert.equal(anonymous.passed, true);
    await assert.rejects(() => runBrowserJourney({ ...request, login: { ...request.login, username: 'wrong-role' } }, { chromium, launchOptions }), /role/i);
    await assert.rejects(() => runBrowserJourney({ ...request, expectedOutcome: { kind: 'success', text: 'Missing' } }, { chromium, launchOptions }), /Timeout|visible/i);
  } finally {
    server.closeAllConnections(); frontend.closeAllConnections();
    await Promise.all([new Promise(resolve => server.close(resolve)), new Promise(resolve => frontend.close(resolve))]);
  }
});
