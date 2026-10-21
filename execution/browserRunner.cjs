// Runs inside the operator-owned image, independently of generated dependencies.
const { randomBytes } = require('node:crypto');

function resolveFillValue(value, { now = new Date(), nonce } = {}) {
  if (typeof value !== 'string') throw new Error('Browser fill requires an explicit string value.');
  if (value === '{nonce}') {
    if (!/^[a-f0-9]{8}$/.test(nonce || '')) throw new Error('Browser journey nonce is unavailable.');
    return nonce;
  }
  const date = /^\{date:([+-])(\d{1,4})d\}$/.exec(value);
  if (date) {
    const days = Number(date[2]);
    if (days > 3650) throw new Error('Browser relative date exceeds the allowed range.');
    const result = new Date(now);
    if (!Number.isFinite(result.getTime())) throw new Error('Browser date reference is invalid.');
    result.setUTCDate(result.getUTCDate() + (date[1] === '+' ? days : -days));
    return result.toISOString().slice(0, 10);
  }
  if (/[{}]/.test(value)) throw new Error('Unsupported browser fill template.');
  return value;
}

function selectChoice(step) {
  const label = Object.prototype.hasOwnProperty.call(step, 'optionLabel');
  const index = Object.prototype.hasOwnProperty.call(step, 'optionIndex');
  if (label === index) throw new Error('Browser select requires one label or index.');
  if (label && typeof step.optionLabel === 'string' && step.optionLabel.trim()) return { label: step.optionLabel };
  if (index && Number.isInteger(step.optionIndex) && step.optionIndex >= 0 && step.optionIndex <= 1000) return { index: step.optionIndex };
  throw new Error('Browser select option is invalid.');
}

async function runBrowserJourney(request, { chromium, launchOptions = {}, containerized = process.platform === 'linux', interactionTimeout = 5000, navigationTimeout = interactionTimeout } = {}) {
  let workerPhase = 'launch', workerStep;
  try {
  const origin = new URL(request.url).origin;
  const loginOrigin = request.login ? new URL(request.login.url).origin : origin;
  const allowedOrigins = new Set([origin, loginOrigin]);
  for (const value of allowedOrigins) {
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(value).hostname)) throw new Error('Browser requires an isolated loopback application.');
  }
  const fillValues = { now: new Date(), nonce: randomBytes(4).toString('hex') };
  if (request.steps !== undefined && !Array.isArray(request.steps)) throw new Error('Browser steps must be an array.');
  const steps = (request.steps || []).map((step, index) => {
    workerPhase = 'control_visible'; workerStep = index;
    if (!step || !['click', 'fill', 'submit', 'select', 'navigate', 'reload', 'assert_text', 'assert_element'].includes(step.action)) throw new Error('Unsupported browser action.');
    if (step.action === 'fill') return { ...step, value: resolveFillValue(step.value ?? step.text, fillValues) };
    if (step.action === 'select') selectChoice(step);
    return step;
  });
  workerPhase = 'launch'; workerStep = undefined;
  const browser = await chromium.launch({ headless: true,
    ...(containerized ? { env: { ...process.env, HOME: '/tmp', XDG_CONFIG_HOME: '/tmp', XDG_CACHE_HOME: '/tmp' } } : {}),
    ...launchOptions,
    args: [...(launchOptions.args || []), ...(containerized ? ['--disable-gpu', '--disable-software-rasterizer', '--renderer-process-limit=1', '--no-zygote', '--single-process'] : [])] });
  const timeout = setTimeout(() => { browser.close().catch(() => {}); }, 90000);
  try {
    workerPhase = 'context';
    const context = await browser.newContext({ viewport: { width: request.viewportWidth || 375, height: 812 }, serviceWorkers: 'block' });
    context.setDefaultTimeout(interactionTimeout);
    if (typeof context.setDefaultNavigationTimeout === 'function') context.setDefaultNavigationTimeout(navigationTimeout);
    await context.route('**/*', route => {
      const target = new URL(route.request().url());
      return allowedOrigins.has(target.origin) ? route.continue() : route.abort();
    });
    let session = { anonymous: true, authenticatedRole: null };
    if (request.authState !== 'anonymous') {
      workerPhase = 'login';
      const login = request.login;
      if (!login) throw new Error('Browser role login is required.');
      const response = await context.request.post(login.url, {
        data: { [login.identityField]: login.username, [login.passwordField]: login.password },
        maxRedirects: 0, timeout: 10000
      });
      if (!response.ok()) throw new Error('Browser role login failed.');
      const payload = await response.json();
      const token = payload[login.tokenField];
      let tokenRole;
      if (typeof token === 'string' && token.split('.').length === 3) {
        try { const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url')); tokenRole = claims.role || claims.user?.role; } catch {}
      }
      const observedRole = payload.user?.role || payload.role || tokenRole;
      if (observedRole !== request.role) throw new Error('Browser login did not prove the requested role.');
      if (!token && !(await context.cookies()).length) throw new Error('Browser login has no session proof.');
      if (token) {
        await context.setExtraHTTPHeaders({ authorization: `Bearer ${token}` });
        await context.addInitScript(({ field, value }) => localStorage.setItem(field, value), { field: login.tokenField, value: token });
      }
      session = { anonymous: false, authenticatedRole: observedRole };
    }
    workerPhase = 'new_page';
    const page = await context.newPage();
    workerPhase = 'navigate';
    await page.goto(request.url, { waitUntil: 'domcontentloaded' });
    const actions = [];
    for (const [stepIndex, step] of steps.entries()) {
      workerStep = stepIndex;
      workerPhase = 'control_visible';
      if (step.action === 'navigate' || step.action === 'reload') {
        workerPhase = 'navigate';
        const url = new URL(step.url || request.url, request.url);
        if (url.origin !== origin) throw new Error('Browser navigation escapes application origin.');
        await page.goto(url.href, { waitUntil: 'domcontentloaded' });
        continue;
      }
      let locator = step.selector ? page.locator(step.selector) : page.getByText(step.target || '', { exact: true });
      if (step.action === 'assert_text') { await page.getByText(step.expectedText, { exact: false }).last().waitFor({ state: 'visible' }); continue; }
      if (step.action === 'assert_element') { await locator.waitFor({ state: 'visible' }); continue; }
      if (!['click', 'fill', 'submit', 'select'].includes(step.action)) throw new Error('Unsupported browser action.');
      if (step.action === 'submit') {
        workerPhase = 'control_name';
        if (await locator.evaluate(el => el.tagName === 'FORM')) locator = locator.locator('button[type="submit"], input[type="submit"], button:not([type])').first();
      }
      workerPhase = 'control_visible';
      await locator.waitFor({ state: 'visible' });
      workerPhase = 'control_name';
      const accessibleName = await locator.evaluate(el => {
        const named = el.getAttribute('aria-labelledby');
        return (el.getAttribute('aria-label') || (named && named.split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' '))
          || (el.labels && Array.from(el.labels).map(label => label.textContent).join(' ')) || (el.tagName !== 'SELECT' && el.innerText) || el.getAttribute('alt') || el.getAttribute('title') || (el.type === 'submit' ? el.value : '') || '').trim();
      });
      let keyboardReachable = false;
      workerPhase = 'control_focus';
      for (let attempt = 0; attempt < 100; attempt++) {
        await page.keyboard.press('Tab');
        if (await locator.evaluate(el => document.activeElement === el)) { keyboardReachable = true; break; }
      }
      if (!accessibleName || !keyboardReachable) throw new Error('Browser control lacks accessible name or keyboard reachability.');
      workerPhase = 'action';
      if (step.action === 'fill') await locator.fill(step.value);
      else if (step.action === 'select') {
        if (!await locator.evaluate(el => el.tagName === 'SELECT')) throw new Error('Browser select requires a native select control.');
        const selected = await locator.selectOption(selectChoice(step));
        if (!Array.isArray(selected) || selected.length !== 1) throw new Error('Browser select did not observe one selected option.');
      }
      else await locator.press('Enter');
      actions.push({ index: actions.length, action: step.action, target: step.selector || step.target, completed: true, accessibleName, keyboardReachable });
    }
    workerPhase = 'outcome';
    const expected = request.expectedOutcome;
    if (!expected?.text || !['success', 'denied'].includes(expected.kind)) throw new Error('Visible browser outcome is required.');
    const outcome = page.getByText(expected.text, { exact: false }).last();
    await outcome.waitFor({ state: 'visible' });
    workerPhase = 'viewport';
    const viewport = await page.evaluate(() => ({ width: innerWidth, horizontalOverflow: document.documentElement.scrollWidth > innerWidth }));
    workerPhase = 'outcome';
    return { passed: !viewport.horizontalOverflow, session, actions,
      outcome: { kind: expected.kind, visible: true, text: await outcome.innerText() }, viewport };
  } finally { clearTimeout(timeout); await browser.close(); }
  } catch (error) {
    // Attach only operator-owned fixed metadata; diagnostics never serialize error text.
    if (error && typeof error === 'object') { error.workerPhase = workerPhase; if (workerStep !== undefined) error.workerStep = workerStep; }
    throw error;
  }
}

const BROWSER_PHASES = new Set(['launch', 'context', 'login', 'new_page', 'navigate', 'control_visible', 'control_name', 'control_focus', 'action', 'outcome', 'viewport']);
function browserFailureDiagnostic(error) {
  const base = error?.name === 'TimeoutError'
    ? 'Isolated browser journey timed out.'
    : 'Isolated browser journey failed.';
  if (!BROWSER_PHASES.has(error?.workerPhase)) return base;
  const step = Number.isSafeInteger(error.workerStep) && error.workerStep >= 0 && error.workerStep <= 999999 ? ` step=${error.workerStep}` : '';
  return `${base} [phase=${error.workerPhase}${step}]`;
}
function localBrowserFailureDiagnostic(stderr) {
  const match = /^Isolated browser journey (timed out|failed)\.(?: \[phase=(launch|context|login|new_page|navigate|control_visible|control_name|control_focus|action|outcome|viewport)(?: step=(0|[1-9]\d{0,5}))?\])?$/.exec(String(stderr || '').trim());
  if (!match) return 'Local browser journey failed.';
  return `Local browser journey ${match[1]}.${match[2] ? ` [phase=${match[2]}${match[3] !== undefined ? ` step=${match[3]}` : ''}]` : ''}`;
}

module.exports = { runBrowserJourney, resolveFillValue, browserFailureDiagnostic, localBrowserFailureDiagnostic };
if (require.main === module) {
  const fs = require('node:fs');
  const { chromium } = require('/opt/browser/node_modules/playwright-core');
  runBrowserJourney(JSON.parse(fs.readFileSync(0, 'utf8')), {
    chromium, launchOptions: { executablePath: '/usr/bin/chromium-browser', args: ['--no-sandbox', '--disable-dev-shm-usage'] }
  }).then(result => process.stdout.write(JSON.stringify(result))).catch(error => {
    // Credentials and application bodies must not enter worker diagnostics.
    process.stderr.write(browserFailureDiagnostic(error)); process.exitCode = 1;
  });
}
