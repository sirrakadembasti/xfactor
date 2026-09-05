import { expect, test } from '@playwright/test';
import crypto from 'node:crypto';

const required = ['P6_BASE_URL', 'P6_USERNAME', 'P6_PASSWORD', 'P6_PROJECT_ID', 'P6_CONTRACT_ID', 'P6_ARTIFACT_ID', 'P6_SHA256'];
for (const name of required) {
  if (!process.env[name]) throw new Error(`Missing ${name} production-image fixture variable`);
}

const baseUrl = process.env.P6_BASE_URL;
const username = process.env.P6_USERNAME;
const password = process.env.P6_PASSWORD;
const projectId = process.env.P6_PROJECT_ID;
const sha256 = process.env.P6_SHA256;

test.use({ ignoreHTTPSErrors: true });

test('production HTTPS origin serves SPA, API, authenticated WebSocket, and verified ZIP only', async ({ page }) => {
  const webSocketUrls = [];
  page.on('websocket', socket => webSocketUrls.push(socket.url()));

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
  await expect.poll(() => webSocketUrls.some(url => url.startsWith('wss:'))).toBe(true);

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
  await expect(page.getByRole('button', { name: 'Projeyi (ZIP) İndir' })).toHaveCount(0);
});
