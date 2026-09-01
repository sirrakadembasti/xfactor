import { expect, test } from '@playwright/test';

const username = 'dashboard-e2e';
const password = 'DashboardE2E!2026';
const contractId = 'dashboard-contract-001';
const runId = 'dashboard-run-001';
const checkId = 'dashboard-check-001';
let projectId;

test.beforeAll(async () => {
  if (!process.env.E2E_DB_PATH || !process.env.E2E_PROJECTS_ROOT) {
    throw new Error('Playwright dashboard fixture paths are not configured');
  }
  process.env.DB_PATH = process.env.E2E_DB_PATH;
  process.env.PROJECTS_ROOT = process.env.E2E_PROJECTS_ROOT;

  const [{ createUser, createProjectForUser }, { db }] = await Promise.all([
    import('../backend/auth.js'),
    import('../backend/db.js')
  ]);
  const user = createUser(username, password);
  const project = createProjectForUser(user.id, 'Read-Only Quality Dashboard');
  projectId = project.id;
  const now = new Date().toISOString();
  db.prepare("UPDATE projects SET status = 'pending_approval' WHERE id = ?").run(projectId);

  db.prepare(`
    INSERT INTO project_contracts
      (id, project_id, revision, status, contract_json, contract_hash, approved_at, created_at)
    VALUES (?, ?, 1, 'approved', '{}', ?, ?, ?)
  `).run(contractId, projectId, 'd'.repeat(64), now, now);
  db.prepare(`
    INSERT INTO verification_runs
      (id, project_id, contract_id, status, policy_version, started_at, ended_at)
    VALUES (?, ?, ?, 'verified', 'quality-v3', ?, ?)
  `).run(runId, projectId, contractId, now, now);
  db.prepare(`
    INSERT INTO verification_checks
      (id, contract_id, run_id, gate_name, applicability, status, command, exit_code,
       started_at, ended_at, timed_out, stdout_digest, stderr_digest, evidence_json)
    VALUES (?, ?, ?, 'api_contract', 'MANDATORY', 'PASS', 'npm test', 0,
            ?, ?, 0, ?, ?, ?)
  `).run(
    checkId,
    contractId,
    runId,
    now,
    now,
    'stdout-digest-e2e',
    'stderr-digest-e2e',
    JSON.stringify({
      reason: 'verified',
      requirementIds: [],
      evidence: {
        stdout: 'database_url=postgres://owner:e2e-supersecret@db/app',
        stderr: 'Bearer sk-e2e-supersecret-token'
      }
    })
  );
});

test('authorized dashboard renders redacted evidence and no mutation controls', async ({ page }) => {
  await page.goto('/dashboard');
  await page.getByLabel('Kullanıcı Adı').fill(username);
  await page.getByLabel('Şifre').fill(password);
  await page.getByRole('button', { name: 'Giriş Yap' }).click();

  await expect(page.getByText('Independent Sandbox Evidence')).toBeVisible();
  await expect(page.getByText(runId)).toBeVisible();
  await page.getByRole('button', { name: new RegExp(`api_contract.*${checkId}`, 'i') }).click();

  await expect(page.getByText('database_url=[REDACTED]')).toBeVisible();
  await expect(page.getByText('Bearer [REDACTED]')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('e2e-supersecret');
  await expect(page.getByRole('button', { name: /Planı Onayla/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Yeni Proje Başlat/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Proje İşlemleri/i })).toHaveCount(0);

  for (const mutationName of [/accept/i, /complete/i, /approve/i, /bypass/i]) {
    await expect(page.getByRole('button', { name: mutationName })).toHaveCount(0);
  }
});
