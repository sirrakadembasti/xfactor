import { expect, test } from '@playwright/test';
import crypto from 'node:crypto';

const required = ['P6_BASE_URL', 'P6_USERNAME', 'P6_PASSWORD', 'P6_PROJECT_ID', 'P6_CONTRACT_ID', 'P6_ARTIFACT_ID', 'P6_SHA256'];
const missing = required.filter(name => !process.env[name]);
const baseUrl = process.env.P6_BASE_URL;
const username = process.env.P6_USERNAME;
const password = process.env.P6_PASSWORD;
const projectId = process.env.P6_PROJECT_ID;
const sha256 = process.env.P6_SHA256;

test.use({ ignoreHTTPSErrors: true });

test('production HTTPS origin serves SPA, API, authenticated WebSocket, and verified ZIP only', async ({ page }) => {
  test.skip(missing.length > 0, `Requires production image harness: missing ${missing.join(', ')}`);

  await page.goto(baseUrl);
  await page.locator('#login-username').fill(username);
  await page.locator('#login-password').fill(password);
  await page.getByRole('button', { name: 'Giriş Yap' }).click();
  await expect(page.getByRole('button', { name: 'Giriş Yap' })).toHaveCount(0);
  await expect(page.locator('#root')).not.toBeEmpty();
  const deepLink = await page.goto(`${baseUrl}/projects/${projectId}`);
  expect(deepLink.status()).toBe(200);
  await expect(page.locator('#root')).not.toBeEmpty();
  await page.locator('span').filter({ hasText: 'P6 Verified Project' }).click();
  await expect(page.getByRole('button', { name: 'Projeyi (ZIP) İndir' })).toBeVisible();
  const subscribedProjectId = await page.evaluate(async activeProjectId => new Promise((resolve, reject) => {
    const socket = new WebSocket(`wss://${window.location.host}/ws/logs`);
    const timeout = setTimeout(() => reject(new Error('authenticated WebSocket subscription timed out')), 10_000);
    const fail = event => {
      clearTimeout(timeout);
      reject(new Error(`authenticated WebSocket closed before subscription: ${event.code || 'error'}`));
    };
    socket.onerror = fail;
    socket.onclose = fail;
    socket.onopen = () => socket.send(JSON.stringify({ type: 'subscribe', projectId: activeProjectId }));
    socket.onmessage = event => {
      const message = JSON.parse(event.data);
      if (message.type === 'subscribed' && message.projectId === activeProjectId) {
        clearTimeout(timeout);
        socket.close();
        resolve(message.projectId);
      }
    };
  }), projectId);
  expect(subscribedProjectId).toBe(projectId);


  const api404 = await page.request.get(`${baseUrl}/api/does-not-exist`);
  expect(api404.status()).toBe(404);
  expect(api404.headers()['content-type']).toContain('application/json');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Projeyi (ZIP) İndir' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.zip$/);
  const bytes = await download.createReadStream().then(async stream => {
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
  });
  expect(crypto.createHash('sha256').update(bytes).digest('hex')).toBe(sha256);

  const projects = await page.request.get(`${baseUrl}/api/projects`).then(response => response.json());
  const unverified = projects.find(project => project.id !== projectId);
  expect(unverified).toBeTruthy();
  await page.locator('span').filter({ hasText: 'P6 Unverified Project' }).click();
  const deniedDownload = await page.request.get(
    `${baseUrl}/api/projects/${unverified.id}/contracts/${unverified.id}-contract/artifacts/${unverified.id}-artifact/download`
  );
  expect([404, 409]).toContain(deniedDownload.status());
  await expect(page.getByRole('button', { name: 'Projeyi (ZIP) İndir' })).toHaveCount(0);
});
