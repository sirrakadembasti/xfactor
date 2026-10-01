import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { browserFailureDiagnostic, localBrowserFailureDiagnostic, runBrowserJourney } = createRequire(import.meta.url)('../browserRunner.cjs');

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
