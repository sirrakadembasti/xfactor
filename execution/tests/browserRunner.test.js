import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

test('isolated browser observes role, actions and mobile outcome', async () => {
  const { runBrowserJourney } = await import(process.env.XFACTOR_BROWSER_RUNNER || '../browserRunner.cjs');
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
    res.end(`<main><label for="name">Name</label><input id="name"><button id="save" onclick="document.querySelector('#result').textContent='${loggedIn ? 'Saved' : 'Denied'}'">Save</button><p id="result"></p></main>`);
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
