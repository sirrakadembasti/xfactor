import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { chromium } from 'playwright-core';
import { runBrowserJourney } from '../browserRunner.cjs';
import { verifyBrowserJourney } from '../../backend/verification/browserVerifier.js';

test('actual Chromium observation yields bounded review candidates for both managed journeys without acceptance', async () => {
  const token = 'FIXTURE_PRIVATE_TOKEN';
  const server = http.createServer((req, res) => {
    if (req.url === '/login') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ token, user: { role: 'admin', displayName: 'Çağrı Öztürk', roleDisplayName: 'Yönetici' } })); return;
    }
    const negative = new URL(req.url, 'http://localhost').searchParams.get('kind') === 'negative';
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><body><h1>Yönetici</h1><p>Çağrı Öztürk</p><span>Settings</span><p>${token}</p>
      <div contenteditable>PRIVATE_EDITABLE</div><input value="PRIVATE_INPUT"><button onclick="document.getElementById('result').textContent='${negative ? 'Erişim reddedildi' : 'Kaydedildi'}'">Devam</button><div id="result"></div>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const binding = { sourceHash: 'a'.repeat(64), artifactHash: 'b'.repeat(64), contractId: 'fixture-contract', runId: 'fixture-run' };
  const journeys = ['positive', 'negative'].map(kind => ({ role: 'admin', kind, steps: [{ action: 'click', selector: 'button' }],
    expectedOutcome: { kind: kind === 'positive' ? 'success' : 'denied', text: kind === 'positive' ? 'Kaydedildi' : 'Erişim reddedildi' } }));
  const adapter = {
    id: 'operator-chromium-fixture', request: async ({ url }) => { const response = await fetch(url); return { statusCode: response.status, html: await response.text() }; },
    interact: request => runBrowserJourney({ ...request, url: `${origin}/fixture?kind=${request.kind}&token=${token}`,
      login: { url: `${origin}/login`, username: 'technical_admin', password: 'PRIVATE_PASSWORD', identityField: 'username', passwordField: 'password', tokenField: 'token' } },
    { chromium, containerized: false, launchOptions: process.env.XFACTOR_TEST_CHROMIUM ? { executablePath: process.env.XFACTOR_TEST_CHROMIUM } : {} })
  };
  try {
    const result = await verifyBrowserJourney(`${origin}/fixture`, {}, { adapter, management: { needed: true, roles: [{ name: 'admin' }] }, roleJourneys: journeys,
      uiLanguageObservation: { binding, routeTemplates: ['/fixture'] }, uiLanguageObservationBinding: binding });
    const check = result.checks.find(item => item.name === 'ui_language_evidence');
    assert.equal(check?.status, 'blocked');
    assert.equal(check.evidence.advisory, true);
    assert.equal(check.evidence.needsReview, true);
    assert.equal(check.evidence.fullProductProof, false);
    assert.ok(check.evidence.inventory.snapshots.length >= 8);
    assert.ok(check.evidence.inventory.snapshots.some(snapshot => snapshot.entries.some(entry => entry.text === 'Çağrı Öztürk')));
    assert.ok(check.evidence.inventory.snapshots.some(snapshot => snapshot.entries.some(entry => entry.text === 'Settings')));
    assert.ok(!JSON.stringify(check).includes('PRIVATE_'));
    assert.ok(check.evidence.inventory.snapshots.every(snapshot => snapshot.route === '/fixture'));
  } finally { await new Promise(resolve => server.close(resolve)); }
});
