// Runs inside the operator-owned image, independently of generated dependencies.
const { randomBytes } = require('node:crypto');

// Serialized into the browser: form values are excluded except visible button labels.
function collectVisibleUiText({ maxEntries, maxTextLength, maxElements, maxBytes = 65536, secrets = [], shadowCoverageVerified = false }) {
  const entries = [], seen = new Set();
  // document.querySelectorAll cannot establish absence of closed shadow roots.
  // Only an operator-owned browser-level probe may attest that boundary; neither
  // page content nor a journey request can supply this flag through captureUi.
  let truncated = shadowCoverageVerified !== true, redacted = false, scanned = 0, bytes = 0;
  const utf8 = new TextEncoder();
  const anchorFor = el => {
    const parts = [];
    for (let current = el; current?.nodeType === 1; current = current.parentElement) {
      const siblings = current.parentElement ? Array.from(current.parentElement.children) : [current];
      parts.unshift(`${current.tagName.toLowerCase()}:nth-child(${siblings.indexOf(current) + 1})`);
      if (parts.length > 64) { truncated = true; return null; }
    }
    return parts.length ? parts.join('>') : null;
  };
  const add = (kind, raw, el) => {
    const text = String(raw || '').normalize('NFC').replace(/\s+/g, ' ').trim();
    if (!text) return;
    if (secrets.some(secret => secret && text.includes(secret)) || /\bBearer\s+\S+|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(text)) { redacted = true; return; }
    const anchor = anchorFor(el);
    const id = `${anchor || ''}\0${kind}\0${text}`;
    if (seen.has(id)) return;
    seen.add(id);
    if (text.length > maxTextLength || entries.length >= maxEntries) { truncated = true; return; }
    const entry = { kind, text, ...(anchor ? { anchor } : {}) }, size = utf8.encode(JSON.stringify(entry)).length + 1;
    if (bytes + size > maxBytes) { truncated = true; return; }
    bytes += size;
    entries.push(entry);
  };
  elements: for (const el of document.querySelectorAll('*')) {
    if (++scanned > maxElements) { truncated = true; break; }
    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'].includes(el.tagName)) continue;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.visibility === 'collapse' || style.display === 'none') continue;
    if (el.closest('[contenteditable]:not([contenteditable="false"])')) { truncated = true; continue; }
    // These rendering surfaces need a dedicated collector before completeness can pass.
    if (el.shadowRoot || el.tagName.includes('-') || el.getAttribute('is') || ['IFRAME', 'CANVAS', 'OBJECT', 'EMBED'].includes(el.tagName)) truncated = true;
    for (const pseudo of ['::before', '::after']) {
      const content = getComputedStyle(el, pseudo).content;
      if (content && !['none', 'normal', '""', "''"].includes(content)) truncated = true;
    }
    if (!el.getClientRects().length) {
      if (style.display === 'contents' && Array.from(el.childNodes).some(node => node.nodeType === 3 && node.textContent.trim())) truncated = true;
      continue;
    }
    for (const kind of ['aria-label', 'alt', 'title', 'placeholder']) add(kind, el.getAttribute(kind), el);
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) add('aria-labelledby', labelledBy.split(/\s+/).map(id => {
      const label = document.getElementById(id);
      if (!label) return '';
      if (['INPUT', 'TEXTAREA', 'SCRIPT', 'STYLE'].includes(label.tagName) || label.closest('[contenteditable]:not([contenteditable="false"])') || label.querySelector?.('input, textarea, script, style, [contenteditable]:not([contenteditable="false"])')) { redacted = true; return ''; }
      return label.textContent || '';
    }).join(' '), el);
    if (el.tagName === 'INPUT' && ['submit', 'button', 'reset'].includes(el.type)) add('button-value', el.value, el);
    // Browser/OS-owned labels and unopened native popups are outside DOM evidence.
    if (el.tagName === 'INPUT' && el.type === 'file') truncated = true;
    if (el.tagName === 'SELECT') {
      const selected = Array.from(el.selectedOptions);
      if (!el.options || Array.from(el.options).some(option => !selected.includes(option))) truncated = true;
      for (const option of selected) add('text', option.textContent, option);
    }
    if (['INPUT', 'TEXTAREA'].includes(el.tagName)) continue;
    for (const node of el.childNodes) {
      if (++scanned > maxElements) { truncated = true; break elements; }
      if (node.nodeType === 3) add('text', node.textContent, el);
    }
  }
  return { entries, truncated, redacted };
}

// CDP is controlled by the operator browser, outside the page's JavaScript world.
// Shadow content is unsupported; even an empty or user-agent shadow root blocks.
async function probeShadowCoverage(session, maxNodes = 10000) {
  if (!session) return false;
  try {
    const { root } = await session.send('DOM.getDocument', { depth: -1, pierce: true });
    if (!root || root.nodeType !== 9) return false;
    const queue = [root];
    let visited = 0;
    while (queue.length) {
      const node = queue.pop();
      if (++visited > maxNodes || node.shadowRootType || node.shadowRoots?.length || node.contentDocument) return false;
      if (node.children) queue.push(...node.children);
    }
    return true;
  } catch { return false; }
}

// Only operator-declared route templates may leave the worker. Actual path parameters,
// query strings and hashes are never serialized. Unknown/secret routes block evidence.
function sanitizeEvidenceRoute(url, routeTemplates, secrets = []) {
  const decode = value => {
    for (let attempt = 0; attempt < 4; attempt++) {
      let next;
      try { next = decodeURIComponent(value); } catch { return null; }
      if (next === value) return value;
      value = next;
    }
    return null;
  };
  const hasSecret = value => value === null || secrets.some(secret => typeof secret === 'string' && secret && value.includes(secret)) || /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(value);
  if (!Array.isArray(routeTemplates) || routeTemplates.length > 100) return null;
  let pathname;
  try { pathname = new URL(url).pathname; } catch { return null; }
  const decodedPath = decode(pathname);
  if (hasSecret(decodedPath)) return null;
  for (const template of routeTemplates) {
    if (typeof template !== 'string' || template.length > 300 || !/^\/[A-Za-z0-9_./:%~-]*$/.test(template) || hasSecret(decode(template))) continue;
    const expected = template.split('/'), actual = pathname.split('/');
    if (expected.length !== actual.length) continue;
    if (expected.every((segment, index) => /^:[A-Za-z][A-Za-z0-9_]*$/.test(segment) ? Boolean(actual[index]) : !segment.includes(':') && segment === actual[index])) return template;
  }
  return null;
}

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
    const inventorySecrets = [request.login?.password, ...steps.filter(step => step.action === 'fill').map(step => step.value)].filter(value => typeof value === 'string' && value.length);
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
      if (typeof token === 'string' && token) inventorySecrets.push(token);
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
      const displayProfile = {};
      // Explicit API display fields are observations, never translations of enums
      // or proof that a name appeared on screen. Retain no other profile fields.
      for (const field of ['displayName', 'roleDisplayName']) {
        const raw = payload.user?.[field];
        if (typeof raw !== 'string' || raw.length > 240) continue;
        const value = raw.normalize('NFC').replace(/\s+/g, ' ').trim();
        if (!value || value.length > 120 || value === login.username || value === observedRole
          || inventorySecrets.some(secret => value.includes(secret))
          || /[\u0000-\u001f\u007f]|\bBearer\s+\S+|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(value)) continue;
        displayProfile[field] = value;
      }
      session = { anonymous: false, authenticatedRole: observedRole,
        ...(Object.keys(displayProfile).length ? { displayProfile } : {}) };
    }
    workerPhase = 'new_page';
    const page = await context.newPage();
    let shadowSession;
    if (request.uiLanguageEvidence?.enabled === true && typeof context.newCDPSession === 'function') {
      try { shadowSession = await context.newCDPSession(page); } catch { /* no independent coverage */ }
    }
    workerPhase = 'navigate';
    await page.goto(request.url, { waitUntil: 'domcontentloaded' });
    const uiLanguageEvidence = request.uiLanguageEvidence?.enabled === true ? { version: 1, truncated: false, snapshots: [] } : undefined;
    const bounded = (value, fallback, maximum) => Number.isInteger(value) && value > 0 ? Math.min(value, maximum) : fallback;
    const maxInventoryBytes = Math.max(1024, bounded(request.uiLanguageEvidence?.maxTotalBytes, 131072, 262144));
    const inventoryLimits = { maxEntries: bounded(request.uiLanguageEvidence?.maxEntries, 400, 1000), maxTextLength: bounded(request.uiLanguageEvidence?.maxTextLength, 500, 2000), maxElements: 10000 };
    const appendSnapshot = snapshot => {
      const source = Array.isArray(snapshot.entries) ? snapshot.entries : [];
      const limited = { ...snapshot, entries: [] };
      // Account for serialized UTF-8, including all snapshot metadata, commas and flags.
      let size = Buffer.byteLength(JSON.stringify(uiLanguageEvidence), 'utf8') + Buffer.byteLength(JSON.stringify(limited), 'utf8') + 16;
      if (size > maxInventoryBytes) { uiLanguageEvidence.truncated = true; return; }
      for (const entry of source) {
        const entryBytes = Buffer.byteLength(JSON.stringify(entry), 'utf8') + 1;
        if (size + entryBytes > maxInventoryBytes) { limited.truncated = true; uiLanguageEvidence.truncated = true; break; }
        limited.entries.push(entry); size += entryBytes;
      }
      if (limited.truncated) uiLanguageEvidence.truncated = true;
      uiLanguageEvidence.snapshots.push(limited);
    };
    // after:N is an immediate observation, never an asynchronous-settled guarantee.
    // Each menu/error/empty state must have a subsequent explicit assert_text or
    // assert_element step waiting for that surface, and its after:N must be declared
    // in the operator catalogue. An unrelated final success label is insufficient.
    const captureUi = async state => {
      if (!uiLanguageEvidence) return;
      if (uiLanguageEvidence.snapshots.length >= bounded(request.uiLanguageEvidence?.maxSnapshots, 100, 200)) { uiLanguageEvidence.truncated = true; return; }
      const remainingBytes = maxInventoryBytes - Buffer.byteLength(JSON.stringify(uiLanguageEvidence), 'utf8') - 512;
      if (remainingBytes < 512) { uiLanguageEvidence.truncated = true; return; }
      const role = session.authenticatedRole || 'anonymous';
      // Evidence capture failure blocks the separate language gate; action proof is unchanged.
      try {
        const route = sanitizeEvidenceRoute(page.url(), request.uiLanguageEvidence?.routeTemplates, inventorySecrets);
        if (!route) {
          appendSnapshot({ route: '<unavailable>', role, state, entries: [], truncated: true, error: 'route_unavailable' });
          return;
        }
        const shadowBefore = await probeShadowCoverage(shadowSession);
        const inventory = await page.evaluate(collectVisibleUiText, { ...inventoryLimits, maxBytes: Math.min(65536, remainingBytes), secrets: inventorySecrets, shadowCoverageVerified: shadowBefore });
        const shadowAfter = await probeShadowCoverage(shadowSession);
        if (!shadowAfter) inventory.truncated = true;
        appendSnapshot({ ...inventory, route, role, state });
      } catch {
        appendSnapshot({ route: '<unavailable>', role, state, entries: [], truncated: true, error: 'inventory_unavailable' });
      }
    };
    await captureUi('initial');
    const actions = [];
    for (const [stepIndex, step] of steps.entries()) {
      await captureUi(`before:${stepIndex}`);
      workerStep = stepIndex;
      workerPhase = 'control_visible';
      if (step.action === 'navigate' || step.action === 'reload') {
        workerPhase = 'navigate';
        const url = new URL(step.url || request.url, request.url);
        if (url.origin !== origin) throw new Error('Browser navigation escapes application origin.');
        await page.goto(url.href, { waitUntil: 'domcontentloaded' });
        await captureUi(`after:${stepIndex}`);
        continue;
      }
      let locator = step.selector ? page.locator(step.selector) : page.getByText(step.target || '', { exact: true });
      if (step.action === 'assert_text') { await page.getByText(step.expectedText, { exact: false }).last().waitFor({ state: 'visible' }); await captureUi(`after:${stepIndex}`); continue; }
      if (step.action === 'assert_element') { await locator.waitFor({ state: 'visible' }); await captureUi(`after:${stepIndex}`); continue; }
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
      if (step.action === 'fill') {
        let value = step.value;
        const identity = steps[stepIndex - 1];
        const submit = steps[stepIndex + 1];
        const login = request.authState !== 'anonymous' ? request.login : null;
        // Bind only a role login sequence whose three controls share a form.
        // Leave password changes and other form inputs at their approved values.
        if (login && identity?.action === 'fill' && identity.value === login.username && identity.selector
          && submit?.action === 'submit' && submit.selector && await locator.evaluate((input, selectors) => {
            const form = input.form;
            const identityInput = document.querySelector(selectors.identity);
            const submitControl = document.querySelector(selectors.submit);
            return input.type === 'password' && form && identityInput?.form === form
              && (submitControl === form || submitControl?.form === form);
          }, { identity: identity.selector, submit: submit.selector })) {
          value = login.password;
        }
        await locator.fill(value);
      }
      else if (step.action === 'select') {
        if (!await locator.evaluate(el => el.tagName === 'SELECT')) throw new Error('Browser select requires a native select control.');
        const selected = await locator.selectOption(selectChoice(step));
        if (!Array.isArray(selected) || selected.length !== 1) throw new Error('Browser select did not observe one selected option.');
      }
      else await locator.press('Enter');
      actions.push({ index: actions.length, action: step.action, target: step.selector || step.target, completed: true, accessibleName, keyboardReachable });
      await captureUi(`after:${stepIndex}`);
    }
    workerPhase = 'outcome';
    const expected = request.expectedOutcome;
    if (!expected?.text || !['success', 'denied'].includes(expected.kind)) throw new Error('Visible browser outcome is required.');
    const outcome = page.getByText(expected.text, { exact: false }).last();
    await outcome.waitFor({ state: 'visible' });
    await captureUi('outcome');
    workerPhase = 'viewport';
    const viewport = await page.evaluate(() => ({ width: innerWidth, horizontalOverflow: document.documentElement.scrollWidth > innerWidth }));
    workerPhase = 'outcome';
    return { passed: !viewport.horizontalOverflow, session, actions,
      outcome: { kind: expected.kind, visible: true, text: await outcome.innerText() }, viewport, ...(uiLanguageEvidence ? { uiLanguageEvidence } : {}) };
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

module.exports = { runBrowserJourney, resolveFillValue, browserFailureDiagnostic, localBrowserFailureDiagnostic, collectVisibleUiText, sanitizeEvidenceRoute };
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
