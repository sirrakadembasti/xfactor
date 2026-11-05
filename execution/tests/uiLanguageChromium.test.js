import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { chromium } from 'playwright-core';
import { runBrowserJourney } from '../browserRunner.cjs';

async function fixture(html, inspect, overrides = {}) {
  const server = http.createServer((req, res) => {
    if (req.url === '/login') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ token: 'FIXTURE_PRIVATE_TOKEN', user: {
      role: 'admin', username: 'technical_admin_42', displayName: 'Çağrı Öztürk', roleDisplayName: 'Yönetici', password: 'FIXTURE_PRIVATE_PASSWORD', unrelated: 'PRIVATE_METADATA'
    } })); return; }
    res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(html);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const result = await runBrowserJourney({ url: `http://127.0.0.1:${server.address().port}/fixture`, authState: 'anonymous',
      uiLanguageEvidence: { enabled: true, routeTemplates: ['/fixture'], shadowCoverageVerified: true },
      expectedOutcome: { kind: 'success', text: 'Tamam' }, ...overrides, ...(overrides.login ? { login: { ...overrides.login, url: `http://127.0.0.1:${server.address().port}/login` } } : {}) }, { chromium, containerized: false,
      launchOptions: { ...(process.env.XFACTOR_TEST_CHROMIUM ? { executablePath: process.env.XFACTOR_TEST_CHROMIUM } : {}) } });
    await inspect(result.uiLanguageEvidence, result);
  } finally { await new Promise(resolve => server.close(resolve)); }
}

test('real Chromium operator probe establishes light DOM coverage and distinct occurrence anchors', async () => {
  await fixture('<!doctype html><body><h1>Tamam</h1><code>admin</code><span>admin</span>', evidence => {
    assert.equal(evidence.truncated, false);
    const entries = evidence.snapshots[0].entries.filter(item => item.text === 'admin');
    assert.equal(entries.length, 2);
    assert.deepEqual(entries.map(item => item.anchor), ['html:nth-child(1)>body:nth-child(2)>code:nth-child(2)', 'html:nth-child(1)>body:nth-child(2)>span:nth-child(3)']);
  });
});

test('real Chromium closed shadow on a standard DIV blocks coverage even with a caller attestation', async () => {
  await fixture('<!doctype html><body><h1>Tamam</h1><div id="host"></div><script>document.getElementById("host").attachShadow({mode:"closed"}).innerHTML="<button>Settings</button>"</script>', evidence => {
    assert.equal(evidence.truncated, true);
    assert.ok(evidence.snapshots.every(snapshot => snapshot.truncated));
  });
});

test('real Chromium editable contents and form values stay private while their surface blocks completeness', async () => {
  await fixture('<!doctype html><body><h1>Tamam</h1><div contenteditable>PRIVATE_EDITABLE<button title="PRIVATE_TITLE">Save</button></div><input value="PRIVATE_INPUT"><textarea>PRIVATE_TEXTAREA</textarea>', evidence => {
    assert.equal(evidence.truncated, true);
    assert.ok(!JSON.stringify(evidence).includes('PRIVATE_'));
  });
});


test('real Chromium login preserves explicit Turkish display names separately from technical role and secrets', async () => {
  await fixture('<!doctype html><body><h1>Tamam</h1><p>Çağrı Öztürk</p><span>Yönetici</span>', (_evidence, result) => {
    assert.equal(result.session.authenticatedRole, 'admin');
    assert.deepEqual(result.session.displayProfile, { displayName: 'Çağrı Öztürk', roleDisplayName: 'Yönetici' });
    assert.ok(!JSON.stringify(result).includes('PRIVATE_'));
    assert.ok(!JSON.stringify(result).includes('technical_admin_42'));
  }, { authState: 'authenticated', role: 'admin', login: { username: 'technical_admin_42', password: 'FIXTURE_PRIVATE_PASSWORD', identityField: 'username', passwordField: 'password', tokenField: 'token' } });
});
