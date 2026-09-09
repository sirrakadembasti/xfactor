import { expect, test } from '@playwright/test';

const required = [
  'P9_BASE_URL',
  'P9_USERNAME',
  'P9_PASSWORD',
  'P9_PROJECT_TITLE',
  'P9_TEXT_FILE',
  'P9_TEXT_MARKER',
  'P9_IMAGE_FILE',
  'P9_BINARY_FILE'
];
const missing = required.filter(name => !process.env[name]);
const baseUrl = process.env.P9_BASE_URL;
const username = process.env.P9_USERNAME;
const password = process.env.P9_PASSWORD;
const projectTitle = process.env.P9_PROJECT_TITLE;
const textFile = process.env.P9_TEXT_FILE;
const textMarker = process.env.P9_TEXT_MARKER;
const imageFile = process.env.P9_IMAGE_FILE;
const binaryFile = process.env.P9_BINARY_FILE;

// The production image is exercised behind its TLS sidecar; local web servers
// belong to the regular Playwright config, not this acceptance journey.
test.use({ ignoreHTTPSErrors: true });

test('production editor uses local Monaco and safe encoded file previews', async ({ page, request }) => {
  test.skip(missing.length > 0, `Requires production editor harness: missing ${missing.join(', ')}`);

  const externalMonacoRequests = [];
  page.on('request', requestEvent => {
    const url = requestEvent.url();
    if (/monaco|jsdelivr|unpkg|cdnjs|(?:^|\.)cdn\./i.test(url)) externalMonacoRequests.push(url);
  });

  await page.goto(baseUrl);
  await page.getByLabel('Kullanıcı Adı').fill(username);
  await page.getByLabel('Şifre').fill(password);
  await page.getByRole('button', { name: 'Giriş Yap' }).click();
  await expect(page.getByText(projectTitle, { exact: true })).toBeVisible();
  await page.getByText(projectTitle, { exact: true }).click();
  await page.getByRole('button', { name: /Kod Editörü/i }).click();

  await expect(page.locator('.monaco-editor')).toBeVisible();
  await expect(page.locator('.monaco-editor textarea')).toHaveCount(1);
  expect(externalMonacoRequests).toEqual([]);
  await page.getByRole('button', { name: new RegExp(textFile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click();
  await expect(page.locator('.monaco-editor textarea')).toHaveValue(new RegExp(textMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  await page.getByRole('button', { name: new RegExp(imageFile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click();
  await expect(page.locator('img')).toHaveAttribute('src', /^data:image\//);

  await page.getByRole('button', { name: new RegExp(binaryFile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click();
  await expect(page.getByRole('status')).toContainText(/Binary dosya önizlenemiyor/i);

  const allowedOrigin = process.env.P9_ALLOWED_ORIGIN || new URL(baseUrl).origin;
  const allowedResponse = await request.post(`${baseUrl}/api/login`, {
    headers: { Origin: allowedOrigin, 'X-XFactor-CSRF': '1' },
    data: { username: '', password: '' }
  });
  expect(allowedResponse.status()).not.toBe(403);

  const blockedResponse = await request.post(`${baseUrl}/api/login`, {
    headers: { Origin: 'https://unknown-origin.invalid', 'X-XFactor-CSRF': '1' },
    data: { username: '', password: '' }
  });
  expect(blockedResponse.status()).toBe(403);
});
