import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { browserFailureDiagnostic, localBrowserFailureDiagnostic, runBrowserJourney } = createRequire(import.meta.url)('../browserRunner.cjs');

function formFixture({ accessibleName = 'Room', focusable = true, tagName = 'SELECT', nativeElement } = {}) {
  const calls = [];
  const locator = {
    waitFor: async () => {},
    evaluate: async fn => {
      const source = fn.toString();
      if (source.includes("tagName === 'SELECT'")) return tagName === 'SELECT';
      if (source.includes('activeElement')) return focusable;
      if (nativeElement) return fn(nativeElement);
      return accessibleName;
    },
    fill: async value => { calls.push(['fill', value]); },
    selectOption: async value => { calls.push(['select', value]); return ['seed-uuid-option']; },
    press: async key => { calls.push(['press', key]); }
  };
  const page = { goto: async () => {}, locator: () => locator, keyboard: { press: async () => {} },
    getByText: () => ({ last: () => ({ waitFor: async () => {}, innerText: async () => 'Saved' }) }),
    evaluate: async () => ({ width: 375, horizontalOverflow: false }) };
  const chromium = { launch: async () => ({ close: async () => { calls.push(['close']); }, newContext: async () => ({
    setDefaultTimeout() {}, route: async () => {}, newPage: async () => page
  }) }) };
  const request = steps => ({ url: 'http://127.0.0.1:3000/', authState: 'anonymous', steps,
    expectedOutcome: { kind: 'success', text: 'Saved' } });
  return { calls, chromium, request };
}

test('native select executes label/index choices with the same accessible action receipts', async () => {
  const fixture = formFixture();
  const result = await runBrowserJourney(fixture.request([
    { action: 'select', selector: '#room', optionIndex: 1 },
    { action: 'select', selector: '#method', optionLabel: 'Credit card' }
  ]), { chromium: fixture.chromium });
  assert.deepEqual(fixture.calls.filter(([kind]) => kind === 'select'), [['select', { index: 1 }], ['select', { label: 'Credit card' }]]);
  assert.deepEqual(result.actions.map(action => [action.index, action.action, action.completed, action.accessibleName, action.keyboardReachable]),
    [[0, 'select', true, 'Room', true], [1, 'select', true, 'Room', true]]);
});

test('select rejects invalid options and inaccessible or non-native controls', async () => {
  const invalid = [{}, { optionIndex: -1 }, { optionIndex: 1001 }, { optionIndex: 1.5 }, { optionIndex: '1' },
    { optionLabel: '' }, { optionLabel: '  ' }, { optionLabel: 1 }, { optionIndex: 1, optionLabel: 'Room' }, { optionValue: 'made-up-id' }];
  for (const spec of invalid) {
    const fixture = formFixture();
    await assert.rejects(runBrowserJourney(fixture.request([{ action: 'select', selector: '#room', ...spec }]), { chromium: fixture.chromium }));
    assert.ok(!fixture.calls.some(([kind]) => kind === 'select'));
  }
  for (const settings of [{ accessibleName: '' }, { focusable: false }, { tagName: 'INPUT' }]) {
    const fixture = formFixture(settings);
    await assert.rejects(runBrowserJourney(fixture.request([{ action: 'select', selector: '#room', optionIndex: 1 }]), { chromium: fixture.chromium }));
    assert.ok(!fixture.calls.some(([kind]) => kind === 'select'));
  }
});

test('native select option text cannot substitute for an accessible control name', async () => {
  const fixture = formFixture({ nativeElement: { tagName: 'SELECT', labels: [], innerText: 'Choose guest\nDemo guest', getAttribute: () => null } });
  await assert.rejects(runBrowserJourney(fixture.request([{ action: 'select', selector: '#guest', optionIndex: 1 }]), { chromium: fixture.chromium }));
  assert.ok(!fixture.calls.some(([kind]) => kind === 'select'));
});

test('fill expands bounded UTC date templates and one nonce per journey without evaluation', async () => {
  const { resolveFillValue } = createRequire(import.meta.url)('../browserRunner.cjs');
  const values = { now: new Date('2026-03-28T23:30:00.000Z'), nonce: 'abcd1234' };
  assert.equal(resolveFillValue('{date:+2d}', values), '2026-03-30');
  assert.equal(resolveFillValue('{date:-2d}', values), '2026-03-26');
  assert.equal(resolveFillValue('{date:+0d}', values), '2026-03-28');
  assert.equal(resolveFillValue('{nonce}', values), 'abcd1234');
  assert.equal(resolveFillValue('', values), '');
  for (const value of [undefined, null, 42, '{date:+3651d}', '{date:-3651d}', '{date:2d}', 'prefix-{date:+2d}', '{unknown}', '{nonce:eval}', 'prefix-{nonce}', '{{nonce}}', '{date:+{nonce}d}', '{date:+2d', 'value}']) {
    assert.throws(() => resolveFillValue(value, values));
  }
  const fixture = formFixture();
  const steps = [{ action: 'fill', selector: '#name', value: '{nonce}' }, { action: 'fill', selector: '#note', text: '{nonce}' }];
  await runBrowserJourney(fixture.request(steps), { chromium: fixture.chromium });
  const filled = fixture.calls.filter(([kind]) => kind === 'fill').map(([, value]) => value);
  assert.match(filled[0], /^[a-f0-9]{8}$/);
  assert.equal(filled[0], filled[1]);
  await runBrowserJourney(fixture.request(steps), { chromium: fixture.chromium });
  const next = fixture.calls.filter(([kind]) => kind === 'fill')[2][1];
  assert.notEqual(next, filled[0]);
});

test('invalid fill templates fail before any control is filled', async () => {
  for (const value of [undefined, 4, '{unknown}', '{date:+3651d}', '{date:+2d} suffix']) {
    const fixture = formFixture();
    await assert.rejects(runBrowserJourney(fixture.request([{ action: 'fill', selector: '#date', value }]), { chromium: fixture.chromium }));
    assert.ok(!fixture.calls.some(([kind]) => kind === 'fill'));
  }
});

function timeoutFixture() {
  const observed = {};
  const page = { goto: async () => {}, getByText: () => ({ last: () => ({ waitFor: async () => {}, innerText: async () => 'Ready' }) }),
    evaluate: async () => ({ width: 375, horizontalOverflow: false }) };
  const chromium = { launch: async options => {
    observed.launch = options;
    return { close: async () => {}, newContext: async () => ({
      setDefaultTimeout: value => { observed.interaction = value; },
      setDefaultNavigationTimeout: value => { observed.navigation = value; },
      route: async () => {}, newPage: async () => page
    }) };
  } };
  const request = { url: 'http://127.0.0.1:3000/', authState: 'anonymous', expectedOutcome: { kind: 'success', text: 'Ready' },
    interactionTimeout: 999999, navigationTimeout: 999999, timeout: 999999 };
  return { observed, chromium, request };
}

test('operator browser timeouts override defaults while request timeouts cannot override them', async () => {
  const { observed, chromium, request } = timeoutFixture();
  await runBrowserJourney(request, { chromium, interactionTimeout: 15000, navigationTimeout: 30000 });
  assert.equal(observed.interaction, 15000);
  assert.equal(observed.navigation, 30000);
});

test('Docker browser defaults retain five second interaction and navigation limits', async () => {
  const { observed, chromium, request } = timeoutFixture();
  await runBrowserJourney(request, { chromium, containerized: true });
  assert.equal(observed.interaction, 5000);
  assert.equal(observed.navigation, 5000);
});

test('native operator fixes longer action budgets without changing sandbox or ninety second journey budget', async t => {
  const { runLocalBrowserJourney } = createRequire(import.meta.url)('../localBrowserRunner.cjs');
  const { observed, chromium, request } = timeoutFixture();
  const timers = [];
  const originalSetTimeout = globalThis.setTimeout;
  t.mock.method(globalThis, 'setTimeout', (callback, delay, ...args) => {
    timers.push(delay);
    return originalSetTimeout(callback, delay, ...args);
  });
  const result = await runLocalBrowserJourney(request, { chromium, launchOptions: { chromiumSandbox: true } });
  assert.equal(result.passed, true);
  assert.equal(observed.interaction, 15000);
  assert.equal(observed.navigation, 30000);
  assert.equal(observed.launch.chromiumSandbox, true);
  assert.deepEqual(observed.launch.args, []);
  assert.deepEqual(timers, [90000]);
});

test('browser failure diagnostics identify timeouts without exposing application secrets', () => {
  const secret = 'password=private-fixture; token=private-session; response=private-body';
  const timeout = Object.assign(new Error(secret), { name: 'TimeoutError' });
  assert.equal(browserFailureDiagnostic(timeout), 'Isolated browser journey timed out.');
  assert.equal(browserFailureDiagnostic(new Error(secret)), 'Isolated browser journey failed.');
  assert.equal(browserFailureDiagnostic({ name: secret, message: secret }), 'Isolated browser journey failed.');
});
test('browser diagnostics expose only fixed phase and bounded numeric step metadata', () => {
  const secret = 'password=secret; token=secret; http://private/response';
  const error = Object.assign(new Error(secret), { name: 'TimeoutError', workerPhase: 'outcome', workerStep: 2 });
  assert.equal(browserFailureDiagnostic(error), 'Isolated browser journey timed out. [phase=outcome step=2]');
  assert.equal(localBrowserFailureDiagnostic(browserFailureDiagnostic(error)), 'Local browser journey timed out. [phase=outcome step=2]');
  assert.equal(browserFailureDiagnostic({ message: secret, workerPhase: secret, workerStep: secret }), 'Isolated browser journey failed.');
  for (const phase of ['control_visible', 'control_name', 'control_focus']) {
    const diagnostic = `Isolated browser journey timed out. [phase=${phase} step=0]`;
    assert.equal(browserFailureDiagnostic({ name: 'TimeoutError', message: secret, workerPhase: phase, workerStep: 0 }), diagnostic);
    assert.equal(localBrowserFailureDiagnostic(diagnostic), `Local browser journey timed out. [phase=${phase} step=0]`);
    assert.equal(localBrowserFailureDiagnostic(diagnostic + secret), 'Local browser journey failed.');
  }
  for (const stderr of [secret, 'Isolated browser journey failed. [phase=password]', 'Isolated browser journey timed out. [phase=outcome step=-1]', 'Isolated browser journey failed. [phase=login]\n'+secret]) {
    assert.equal(localBrowserFailureDiagnostic(stderr), 'Local browser journey failed.');
  }
});
test('launch and renderer failures retain their execution phase without leaking error details', async () => {
  for (const phase of ['launch', 'context', 'new_page', 'navigate']) {
    const failure = Object.assign(new Error('private-login-response'), { name: 'TimeoutError' });
    const chromium = { launch: async () => {
      if (phase === 'launch') throw failure;
      return { newContext: async () => {
        if (phase === 'context') throw failure;
        return { setDefaultTimeout() {}, route: async () => {}, newPage: async () => {
          if (phase === 'new_page') throw failure;
          return { goto: async () => { throw failure; } };
        } };
      }, close: async () => {} };
    } };
    await assert.rejects(runBrowserJourney({ url: 'http://127.0.0.1:3000/', authState: 'anonymous' }, { chromium }), error => {
      assert.equal(error.workerPhase, phase);
      assert.equal(browserFailureDiagnostic(error), `Isolated browser journey timed out. [phase=${phase}]`);
      return true;
    });
  }
});
test('login, controls, action, outcome and viewport failures report only phase and step', async () => {
  for (const phase of ['login', 'control_visible', 'control_name', 'control_focus', 'control_focus_evaluate', 'action', 'outcome', 'outcome_text', 'viewport']) {
    const failure = Object.assign(new Error('password=secret; selector=private; url=private'), { name: 'TimeoutError' });
    let evaluations = 0;
    const locator = { waitFor: async () => { if (phase === 'control_visible') throw failure; },
      evaluate: async () => {
        evaluations++;
        if ((evaluations === 1 && phase === 'control_name') || (evaluations > 1 && phase === 'control_focus_evaluate')) throw failure;
        return evaluations === 1 ? 'Accessible button' : true;
      },
      press: async () => { if (phase === 'action') throw failure; } };
    const page = { goto: async () => {}, locator: () => locator, keyboard: { press: async () => { if (phase === 'control_focus') throw failure; } },
      getByText: () => ({ last: () => ({ waitFor: async () => { if (phase === 'outcome') throw failure; }, innerText: async () => { if (phase === 'outcome_text') throw failure; return 'Saved'; } }) }),
      evaluate: async () => { if (phase === 'viewport') throw failure; return { width: 375, horizontalOverflow: false }; } };
    const chromium = { launch: async () => ({ close: async () => {}, newContext: async () => ({
      setDefaultTimeout() {}, route: async () => {}, newPage: async () => page,
      request: { post: async () => { throw failure; } }
    }) }) };
    const request = { url: 'http://127.0.0.1:3000/', authState: phase === 'login' ? 'authenticated' : 'anonymous',
      login: { url: 'http://127.0.0.1:3000/login', password: 'secret' },
      steps: [{ action: 'click', selector: '#private' }], expectedOutcome: { kind: 'success', text: 'Saved' } };
    await assert.rejects(runBrowserJourney(request, { chromium }), error => {
      const suffix = phase === 'login' ? '' : ' step=0';
      const expectedPhase = phase === 'outcome_text' ? 'outcome' : phase === 'control_focus_evaluate' ? 'control_focus' : phase;
      assert.equal(browserFailureDiagnostic(error), `Isolated browser journey timed out. [phase=${expectedPhase}${suffix}]`);
      return true;
    });
  }
});
