import { expect, test } from '@playwright/test';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

const username = 'trust-chain-mfa';
const password = 'TrustChainPassword123!';
const unverifiedTitle = 'Unverified Download Project';
const verifiedTitle = 'Verified Download Project';
const contractId = 'trust-chain-contract';
const runId = 'trust-chain-run';
const artifactId = 'trust-chain-artifact';
const mandatoryGates = [
  'package_json', 'lockfile', 'ast_import_inventory', 'clean_install', 'typecheck',
  'framework_build', 'requirement_traceability', 'service_manifest', 'database_verification',
  'api_contract', 'browser_journey', 'smoke_gate', 'test_infrastructure', 'domain_entity_check',
  'placeholder_check', 'contamination_check', 'security_baseline', 'readme_check'
];
let secret;
let unverifiedProjectId;
let verifiedProjectId;

function currentTotp(totpSecret) {
  const counter = Math.floor(Math.floor(Date.now() / 1000) / 30);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', Buffer.from(totpSecret, 'hex')).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (binary % 1000000).toString().padStart(6, '0');
}

test.beforeAll(async () => {
  if (!process.env.E2E_DB_PATH || !process.env.E2E_PROJECTS_ROOT) {
    throw new Error('Playwright trust-chain fixture paths are not configured');
  }
  process.env.DB_PATH = process.env.E2E_DB_PATH;
  process.env.PROJECTS_ROOT = process.env.E2E_PROJECTS_ROOT;
  const { initializeDatabase } = await import('../backend/db.js');
  const db = initializeDatabase({ path: process.env.DB_PATH });
  const [{ createUser, createProjectForUser, generateTotpSecret }, { createArtifact }, { completeVerifiedProject }] = await Promise.all([
    import('../backend/auth.js'),
    import('../backend/repositories/artifactRepository.js'),
    import('../backend/projectRepository.js')
  ]);
  const user = createUser(username, password);
  secret = generateTotpSecret(user.id);
  const unverifiedProject = createProjectForUser(user.id, unverifiedTitle);
  unverifiedProjectId = unverifiedProject.id;
  const verifiedProject = createProjectForUser(user.id, verifiedTitle);
  verifiedProjectId = verifiedProject.id;
  const now = new Date().toISOString();
  const artifactPath = path.join(process.env.E2E_PROJECTS_ROOT, 'trust-chain-artifact.zip');
  await fs.writeFile(artifactPath, 'canonical browser download artifact');
  const artifactBytes = await fs.readFile(artifactPath);
  const artifactHash = crypto.createHash('sha256').update(artifactBytes).digest('hex');

  db.prepare("UPDATE projects SET status = 'artifact_verified' WHERE id = ?").run(verifiedProjectId);
  db.prepare(`INSERT INTO project_contracts (id, project_id, revision, status, contract_json, contract_hash, approved_at)
    VALUES (?, ?, 1, 'approved', '{\"name\":\"trust chain\"}', ?, ?)`)
    .run(contractId, verifiedProjectId, 't'.repeat(64), now);
  db.prepare(`INSERT INTO verification_runs (id, project_id, contract_id, status, policy_version, started_at, ended_at)
    VALUES (?, ?, ?, 'verified', '2.0', ?, ?)`)
    .run(runId, verifiedProjectId, contractId, now, now);
  for (const gateName of mandatoryGates) {
    db.prepare(`INSERT INTO verification_checks
      (id, contract_id, run_id, gate_name, applicability, status, command, exit_code, started_at, ended_at, stdout_digest, stderr_digest, evidence_json)
      VALUES (?, ?, ?, ?, 'MANDATORY', 'PASS', 'node gate', 0, ?, ?, ?, ?, '{\"ok\":true}')`)
      .run(`${runId}-${gateName}`, contractId, runId, gateName, now, now, `stdout-${gateName}`, `stderr-${gateName}`);
  }
  createArtifact({ id: artifactId, projectId: verifiedProjectId, contractId, kind: 'zip', path: artifactPath,
    sha256: artifactHash, size: artifactBytes.length, manifestJson: '[]', status: 'verified' });
  db.prepare('UPDATE artifacts SET verification_run_id = ? WHERE id = ?').run(runId, artifactId);
  completeVerifiedProject({ projectId: verifiedProjectId, contractId, artifactId, expectedRevision: 1 });
});

test('MFA user needs TOTP before dashboard access', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Kullanıcı Adı').fill(username);
  await page.getByLabel('Şifre').fill(password);
  await page.getByRole('button', { name: 'Giriş Yap' }).click();
  await expect(page.getByLabel('Doğrulama Kodu')).toBeVisible();
  await expect(page.getByText(/XFactor Projeler/)).toHaveCount(0);
  await page.getByLabel('Doğrulama Kodu').fill(currentTotp(secret));
  await page.getByRole('button', { name: 'Kodu Doğrula' }).click();
  await expect(page.getByText(/XFactor Projeler/)).toBeVisible();
});

test('only the completed verified project exposes a Header ZIP download', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Kullanıcı Adı').fill(username);
  await page.getByLabel('Şifre').fill(password);
  await page.getByRole('button', { name: 'Giriş Yap' }).click();
  await page.getByLabel('Doğrulama Kodu').fill(currentTotp(secret));
  await page.getByRole('button', { name: 'Kodu Doğrula' }).click();
  await expect(page.getByText(/XFactor Projeler/)).toBeVisible();

  await page.locator('span', { hasText: new RegExp(`^${unverifiedTitle}$`) }).click();
  await expect(page.getByRole('button', { name: 'Projeyi (ZIP) İndir' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /ZIP olarak indir/i })).toHaveCount(0);

  await page.locator('span', { hasText: new RegExp(`^${verifiedTitle}$`) }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Projeyi (ZIP) İndir' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.zip$/);
});
