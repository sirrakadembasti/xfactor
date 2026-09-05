# P5 Critical Trust Chain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make generated execution fail closed without OS isolation, restore one canonical artifact/completion identity, expose only verified server artifacts for download, and require TOTP before creating sessions for MFA-enabled users.

**Architecture:** Existing execution, artifact, and authentication boundaries remain in place but lose their unsafe alternate paths. `sandboxRunner` becomes the only generated-process authority, `artifactRepository` becomes the only artifact row-to-domain mapper, the browser consumes only server-authorized artifact URLs, and `/api/login` becomes a two-step response protocol without adding a second endpoint or persistent challenge table.

**Tech Stack:** Node.js 22.5+ ESM, Express 4, built-in `node:sqlite`, React 18, Vite 6, Vitest 2, Playwright, existing isolated DB harness.

## Global Constraints

- Execute one delivery unit at a time in dependency order: P5 → P6 → P7 → P8.
- Implement observable behavior changes with TDD.
- Never treat generated or LLM-produced code as trusted host code.
- Mandatory verification cannot pass on skipped, blocked, missing, or evidence-free execution.
- Only canonical machine evidence may authorize artifact download or project completion.
- Use isolated temporary databases and project roots in tests.
- Preserve unrelated dirty-worktree changes.
- Do not perform unrelated refactoring.
- Mark roadmap tasks complete only after tests, behavioral proof, review, and evidence updates.
- Existing modified files overlap P5 (`backend/routes/projectRoutes.js`, `backend/verification/{buildVerifier,packageVerifier,qualityPolicy,sandboxRunner}.js`). Re-read and reconcile the user’s current diff before every edit; never restore or overwrite the whole file.
- Do not read, mutate, or copy `backend/data/projects.db` in tests.
- P5 does not implement Windows Job Objects, MFA enrollment, production frontend serving, backend JSZip ownership, disk reconciliation redesign, or sandbox resource limits.

## File Responsibility Map

| File | P5 responsibility |
| --- | --- |
| `backend/verification/sandboxRunner.js` | Sole generated-command execution boundary; no host branch |
| `backend/verification/processVerifier.js` | Service process creation only through a capable sandbox adapter |
| `backend/engine/buildValidator.js` | Build commands use injected/active sandbox and report unavailable isolation as BLOCKED |
| `backend/verification/{buildVerifier,packageVerifier,qualityPolicy}.js` | Stop forwarding or deriving host-execution authority |
| `backend/repositories/artifactRepository.js` | Map artifact SQL rows to one camelCase domain model |
| `backend/projectRepository.js` | Consume canonical artifacts and project verified artifact metadata |
| `backend/verification/verificationCli.js` | Verify identical run identity before completion |
| `frontend/src/services/api.js` | MFA request and configured-origin artifact URL construction |
| `frontend/src/App.jsx` | MFA UI state and verified-only download orchestration |
| `frontend/src/components/LoginView.jsx` | Credential/TOTP steps |
| `frontend/src/components/Header.jsx` | Show download only for a verified artifact |
| `frontend/src/components/Sidebar.jsx` | Remove project-list ZIP authority |
| `backend/tests/test_p5_*.js` | Isolated P5 backend regression contracts |
| `frontend/src/components/__tests__/*P5*.test.jsx` | MFA and download presentation contracts |
| `e2e/trust-chain.spec.js` | Browser proof for MFA and verified-only download |
| `backend/tests/test_runner.js` | Register P5 backend suites |
| `guncel-todo.md` and continuity/evidence files | Record only verified results after all gates pass |

---

### Task 1: Remove Generated Host Execution

**Files:**
- Create: `backend/tests/test_p5_execution_boundary.js`
- Modify: `backend/verification/sandboxRunner.js:31-127`
- Modify: `backend/verification/processVerifier.js:56-116`
- Modify: `backend/engine/buildValidator.js:82-260,410-733`
- Modify: `backend/verification/buildVerifier.js`
- Modify: `backend/verification/packageVerifier.js:241-290`
- Modify: `backend/verification/qualityPolicy.js:596-727`
- Modify: `backend/tests/test_build_sandbox_gate.js:1-134`
- Modify: `backend/tests/test_build_validator.js`
- Modify: `backend/tests/test_runner.js:15-41`

**Interfaces:**
- Consumes: adapter contract `{ id, getCapabilities(), execute({ command, args, workspace, timeoutMs, env, capabilities }), spawn(...) }`.
- Produces: `executeInSandbox(command, args, options)` that either uses a capability-proven adapter or throws `SandboxInitializationError` with `code === 'SANDBOX_UNAVAILABLE'` before process creation.
- Produces: `executeSafeCommand(executable, args, { adapter, cwd, timeoutMs, env, signal })`; no `sandboxMode` option.
- Removes: generated-path meaning of `allowHostExecution` and `XFACTOR_BUILD_SANDBOX=host`.

**Evidence:** Append Task 1 commands, exit codes, and observed no-spawn behavior to `implementation-evidence/P5.md` during Task 5.

- [ ] **Step 1: Reconcile overlapping user changes**

Run:

```bash
git diff -- backend/verification/sandboxRunner.js backend/verification/buildVerifier.js backend/verification/packageVerifier.js backend/verification/qualityPolicy.js backend/routes/projectRoutes.js
```

Record the current hunks in the implementation session. Every following edit must be surgical against the current snapshots; no checkout/reset/whole-file replacement is allowed.

- [ ] **Step 2: Write the failing execution-boundary test**

Create `backend/tests/test_p5_execution_boundary.js` using `setupIsolatedTestDb` before dynamic backend imports. The core assertions must be equivalent to:

```js
process.env.XFACTOR_BUILD_SANDBOX = 'host';
let executeCalls = 0;
const unavailable = {
  id: 'unavailable',
  getCapabilities: () => ({ available: false, isolation: false, reason: 'no isolation' }),
  async execute() { executeCalls += 1; throw new Error('must not execute'); }
};

await assert.rejects(
  executeInSandbox(process.execPath, ['-e', 'process.exit(0)'], {
    adapter: unavailable,
    allowHostExecution: true
  }),
  error => error.code === 'SANDBOX_UNAVAILABLE'
);
assert.strictEqual(executeCalls, 0);
```

Add a service assertion with an unavailable adapter whose `spawn()` increments a counter; `spawnService(...)` must reject and leave the counter at zero even when `allowHostExecution:true` and the environment says `host`.

Add a capable fake adapter:

```js
const capable = {
  id: 'isolated-test',
  getCapabilities: () => ({
    available: true,
    isolation: true,
    adapterId: 'isolated-test',
    envScrubbed: true
  }),
  async execute(input) {
    return { status: 'PASS', passed: true, exitCode: 0, stdout: input.command, stderr: '' };
  }
};
```

Assert this adapter is called once and receives no `API_KEY` from the provided environment.

- [ ] **Step 3: Run the new test and prove the unsafe branch exists**

Run:

```bash
node backend/tests/test_p5_execution_boundary.js
```

Expected: FAIL because `allowHostExecution:true` plus `XFACTOR_BUILD_SANDBOX=host` enters the host `spawn` branch or bypasses the unavailable adapter.

- [ ] **Step 4: Make `sandboxRunner` the only process authority**

In `executeInSandbox` delete the host-mode process branch. Resolve and validate exactly one adapter:

```js
const adapter = options.adapter || getActiveSandboxAdapter(options.sandboxAdapter || null);
const capabilities = requireSandboxCapabilities(adapter);
const scrubbedEnv = scrubEnvironmentVariables(options.env || {});
const result = await adapter.execute({
  command,
  args,
  workspace: options.workspace,
  timeoutMs: options.timeoutMs ?? 60000,
  env: scrubbedEnv,
  capabilities
});
return {
  ...result,
  adapterId: adapter.id || capabilities.adapterId || 'unknown',
  capabilities
};
```

Do not retain `allowHostExecution`, host `spawn`, or an environment-controlled fallback.

- [ ] **Step 5: Route service spawning through the same policy**

In `spawnService`, remove `hostMode` and its direct `spawn` branch. Always resolve a supplied or active adapter, require capabilities, scrub the environment, and call `adapter.spawn(...)`:

```js
const adapter = options.adapter || getActiveSandboxAdapter(options.sandboxAdapter || null);
requireAvailableSandbox(adapter);
const cleanEnv = scrubEnvironmentVariables(baseEnv);
const child = await adapter.spawn({
  command,
  args,
  workspace: cwd,
  cwd,
  port: config.port,
  env: cleanEnv,
  networkMode: options.networkMode || 'service'
});
```

The returned `processTreeHandle.adapter` must always be the validated adapter.

- [ ] **Step 6: Remove host authority propagation from verifiers**

Apply a clean cutover:

- Delete `allowHostExecution` forwarding in `buildVerifier.js` and `packageVerifier.js`.
- Delete `allowHostExecution: options.allowHostExecution ?? (...)` from `qualityPolicy.js`.
- Remove `resolveBuildSandboxMode` and `sandboxMode` from `buildValidator.js`.
- Make `executeSafeCommand` call `executeInSandbox` with `options.adapter` and map `SANDBOX_UNAVAILABLE` to a blocked check at verifier callsites.
- For framework build, call the sandboxed command path regardless of environment. On unavailable isolation produce:

```js
{
  name: 'framework_build',
  status: 'blocked',
  reason: error.message,
  command: 'none',
  exitCode: null,
  stdout: '',
  stderr: '',
  timedOut: false
}
```

and set the aggregate `passed` to `false`.

- [ ] **Step 7: Replace tests that authorize host mode**

In `test_build_sandbox_gate.js`, replace the former “host build path runs” case with:

```js
process.env.XFACTOR_BUILD_SANDBOX = 'host';
const result = await validateProjectBuild(dir, { title: 'Host Flag Ignored' }, {});
assert.strictEqual(result.passed, false);
assert.strictEqual(result.checks.find(c => c.name === 'framework_build').status, 'blocked');
assert.strictEqual(fsSync.existsSync(path.join(dir, 'BUILD_RAN_MARKER')), false);
```

In `test_build_validator.js`, stop setting `XFACTOR_BUILD_SANDBOX=host`. Inject a capable fake adapter only into tests whose observable contract requires a successful command.

Register `test_p5_execution_boundary.js` in `backend/tests/test_runner.js` immediately after `test_subprocess_sandbox.js`.

- [ ] **Step 8: Verify Task 1**

Run:

```bash
node backend/tests/test_p5_execution_boundary.js
node backend/tests/test_build_sandbox_gate.js
node backend/tests/test_p4_production_safety.js
```

Expected GREEN: all PASS; no marker file is created by an unavailable-sandbox scenario.

- [ ] **Step 9: Commit Task 1**

```bash
git add backend/tests/test_p5_execution_boundary.js backend/tests/test_runner.js backend/tests/test_build_sandbox_gate.js backend/tests/test_build_validator.js backend/verification/sandboxRunner.js backend/verification/processVerifier.js backend/engine/buildValidator.js backend/verification/buildVerifier.js backend/verification/packageVerifier.js backend/verification/qualityPolicy.js
git commit -m "fix(sandbox): remove generated host fallback"
```

---

### Task 2: Canonicalize Artifact Completion Identity

**Files:**
- Create: `backend/tests/test_p5_artifact_completion.js`
- Modify: `backend/repositories/artifactRepository.js:1-119`
- Modify: `backend/projectRepository.js:1-334`
- Modify: `backend/verification/verificationCli.js:1-80`
- Modify: `backend/tests/test_p1_c_repository.js:44-135`
- Modify: `backend/tests/test_p1_c_artifact_verifier.js:54-195`
- Modify: `backend/tests/test_runner.js:15-45`

**Interfaces:**
- Produces: `mapArtifactRow(row)` as a private repository mapper.
- Produces: `getArtifact(...)` and `getLatestVerifiedArtifact(...)` returning `{ id, projectId, contractId, kind, path, sha256, size, manifestJson, status, verificationRunId, createdAt }` or `undefined`.
- Consumes: `verificationRunId` in `assertVerifiedArtifactEvidence` and `verifyArtifactAndProject`.
- Produces: project state fields `contractId` and public `latestArtifact` without exposing the server filesystem path.

**Evidence:** Append Task 2 commands, exit codes, canonical field assertions, and receipt identity to `implementation-evidence/P5.md` during Task 5.

- [ ] **Step 1: Write the failing repository/completion regression test**

Create `backend/tests/test_p5_artifact_completion.js` with `setupIsolatedTestDb`. Seed a project, latest approved contract, verified run, full active mandatory gate set, and a real temporary artifact file. Assert repository output uses only the canonical names:

```js
const artifact = getArtifact({ projectId, contractId, artifactId });
assert.strictEqual(artifact.projectId, projectId);
assert.strictEqual(artifact.contractId, contractId);
assert.strictEqual(artifact.verificationRunId, runId);
assert.strictEqual('project_id' in artifact, false);
assert.strictEqual('verification_run_id' in artifact, false);
```

Then call `verifyArtifactAndProject` with an injected verification runner that returns the seeded verified run without mutating the artifact:

```js
const result = await verifyArtifactAndProject({
  projectId,
  contractId,
  artifactId,
  complete: true,
  verificationRunner: async () => ({
    passed: true,
    status: 'verified',
    runId
  })
});
const receipt = db.prepare(
  'SELECT artifact_id, run_id FROM completion_receipts WHERE id = ?'
).get(result.completionReceiptId);
assert.deepStrictEqual(receipt, { artifact_id: artifactId, run_id: runId });
```

Seed the project at `runtime_verified`; the orchestration must perform the legal `acceptance_verified → artifact_verified → completed` path. This test exercises the canonical CLI/orchestration field comparison rather than only calling the lower-level projector.

Finally seed a project returned by `getProject` and assert `contractId` and a public `latestArtifact` are present while `latestArtifact.path` is absent.

- [ ] **Step 2: Run the new test and prove the field mismatch**

Run:

```bash
node backend/tests/test_p5_artifact_completion.js
```

Expected: FAIL because repository reads expose `verification_run_id`, and project state does not expose canonical latest artifact metadata.

- [ ] **Step 3: Add one artifact row mapper**

In `artifactRepository.js` add:

```js
function mapArtifactRow(row) {
  if (!row) return undefined;
  return {
    id: row.id,
    projectId: row.project_id,
    contractId: row.contract_id,
    kind: row.kind,
    path: row.path,
    sha256: row.sha256,
    size: row.size,
    manifestJson: row.manifest_json,
    status: row.status,
    verificationRunId: row.verification_run_id,
    createdAt: row.created_at
  };
}
```

Wrap both artifact read queries with this mapper. Keep SQL column names unchanged. Do not add snake_case aliases to the returned object.

When `updateArtifactStatus` receives `status: 'rejected'` with a verification run ID, preserve that ID for failed-run traceability. Only an omitted caller value remains `null`; do not forcibly clear rejected artifact linkage.

- [ ] **Step 4: Migrate every artifact domain consumer**

- In `projectRepository.js`, import `getArtifact` and use `artifact.verificationRunId` in `assertVerifiedArtifactEvidence`.
- In `verificationCli.js`, accept an optional `verificationRunner = verifyArtifact` parameter, invoke it instead of the static function, and keep the identity check on `artifact.verificationRunId`.
- In artifact tests, replace `artifact.verification_run_id` assertions with `artifact.verificationRunId` and preserve rejected-run linkage expectations.
- Leave direct SQL result objects snake_case only inside SQL/evidence assertions.

- [ ] **Step 5: Project verified artifact metadata**

Change the latest contract query in `getProject` to select `id, contract_json`. Query the latest verified artifact for that contract and return only:

```js
const latestArtifact = artifact && {
  id: artifact.id,
  status: artifact.status,
  sha256: artifact.sha256,
  size: artifact.size,
  verificationRunId: artifact.verificationRunId
};

return {
  ...existingState,
  contractId: contractRow?.id || null,
  latestArtifact: latestArtifact || null
};
```

Do not expose `artifact.path` or `manifestJson` through project state.

- [ ] **Step 6: Register and verify Task 2**

Register `test_p5_artifact_completion.js` after the P5 execution suite. Run:

```bash
node backend/tests/test_p5_artifact_completion.js
node backend/tests/test_p1_c_repository.js
node backend/tests/test_p1_c_artifact_verifier.js
node backend/tests/test_p4_production_safety.js
```

Expected GREEN: all PASS; artifact domain consumers use camelCase and the receipt run matches the artifact run.

- [ ] **Step 7: Commit Task 2**

```bash
git add backend/tests/test_p5_artifact_completion.js backend/tests/test_runner.js backend/tests/test_p1_c_repository.js backend/tests/test_p1_c_artifact_verifier.js backend/repositories/artifactRepository.js backend/projectRepository.js backend/verification/verificationCli.js
git commit -m "fix(artifact): unify completion run identity"
```

---

### Task 3: Enforce Verified-Only Browser Download

**Files:**
- Create: `frontend/src/components/__tests__/P5DownloadPolicy.test.jsx`
- Modify: `frontend/src/services/api.js:1-212`
- Modify: `frontend/src/App.jsx:1-719`
- Modify: `frontend/src/components/Header.jsx:1-138`
- Modify: `frontend/src/components/Sidebar.jsx:1-150`

**Interfaces:**
- Produces: `buildArtifactDownloadUrl(projectId, contractId, artifactId, baseURL = API_BASE_URL): string`.
- Consumes: project state `{ contractId, latestArtifact: { id, status, sha256 } | null }` from Task 2.
- Removes: browser JSZip/FileSaver fallback and Sidebar’s unconditional ZIP action.

**Evidence:** Append Task 3 commands, exit codes, verified-only UI assertions, and configured-origin result to `implementation-evidence/P5.md` during Task 5.

- [ ] **Step 1: Write failing frontend policy tests**

Create `P5DownloadPolicy.test.jsx`. Test URL construction:

```js
expect(buildArtifactDownloadUrl(
  'project-1',
  'contract-1',
  'artifact-1',
  'https://api.example.test/api'
)).toBe(
  'https://api.example.test/api/projects/project-1/contracts/contract-1/artifacts/artifact-1/download'
);
```

Render `Header` with a completed project and no artifact; assert the ZIP button is absent. Render again with `latestArtifact.status === 'verified'`; assert the button is present.

Render `Sidebar` with one project and open its action menu; assert no `ZIP Olarak İndir` action exists.

- [ ] **Step 2: Run frontend tests and prove current bypass controls exist**

Run:

```bash
npm --prefix frontend run test:unit -- --run src/components/__tests__/P5DownloadPolicy.test.jsx
```

Expected: FAIL because the URL builder does not exist, Header checks only `completed`, and Sidebar exposes unconditional download.

- [ ] **Step 3: Add the configured-origin URL builder**

In `api.js` add:

```js
export const buildArtifactDownloadUrl = (
  projectId,
  contractId,
  artifactId,
  baseURL = API_BASE_URL
) => buildApiUrl(
  baseURL,
  `/projects/${encodeURIComponent(projectId)}` +
  `/contracts/${encodeURIComponent(contractId)}` +
  `/artifacts/${encodeURIComponent(artifactId)}/download`
);
```

Throw a configuration error if any identity is blank before constructing the URL.

- [ ] **Step 4: Delete the browser ZIP fallback**

In `App.jsx`:

- Remove JSZip/FileSaver comments and dynamic imports.
- Change `handleDownloadProjectZip` to use only the current project’s canonical artifact metadata.
- If the selected project is not active, fetch its state once through `api.getProject(id)`.
- Require `contractId`, artifact ID, and `status === 'verified'`.
- On success call `window.location.assign(buildArtifactDownloadUrl(...))`.
- On failure set `uiError` to `Bu proje için doğrulanmış ZIP artefaktı bulunmuyor.`.
- Never call `api.getProjectFiles` from the download handler.

Render `uiError` as a dismissible `role="alert"` in the main authenticated layout so failed download policy is visible.

- [ ] **Step 5: Remove alternate download affordances**

- In `Header`, render the button only when both project status is `completed` and `latestArtifact.status === 'verified'` with a non-empty ID.
- In `Sidebar`, remove `Download`, `handleDownloadProjectZip`, and the ZIP menu button. Project-list actions remain pin, rename, and delete.
- In `App`, stop passing the removed Sidebar prop.

Do not remove frontend `jszip` or `file-saver` dependencies in P5 because backend verification still has an existing cross-package fallback; P6 owns that clean cutover.

- [ ] **Step 6: Verify Task 3 unit behavior**

Run:

```bash
npm --prefix frontend run test:unit -- --run src/components/__tests__/P5DownloadPolicy.test.jsx
npm --prefix frontend run test:unit
```

Expected GREEN: all frontend tests PASS; no project-list ZIP action exists and Header exposes download only for a verified artifact.

- [ ] **Step 7: Commit Task 3 frontend changes**

```bash
git add frontend/src/services/api.js frontend/src/App.jsx frontend/src/components/Header.jsx frontend/src/components/Sidebar.jsx frontend/src/components/__tests__/P5DownloadPolicy.test.jsx
git commit -m "fix(download): require verified server artifact"
```

---

### Task 4: Enforce MFA Before Session Creation

**Files:**
- Create: `backend/tests/test_p5_mfa_login.js`
- Create: `frontend/src/components/__tests__/P5MfaLogin.test.jsx`
- Create: `e2e/trust-chain.spec.js`
- Modify: `backend/auth.js:82-163`
- Modify: `backend/security.js:111-128`
- Modify: `backend/routes/authRoutes.js:16-55`
- Modify: `frontend/src/services/api.js:124-134`
- Modify: `frontend/src/App.jsx:26-126,354-365,591-610`
- Modify: `frontend/src/components/LoginView.jsx:3-54`
- Modify: `backend/tests/test_runner.js:15-46`

**Interfaces:**
- Produces internal user fields `mfaEnabled: boolean` and `totpSecret: string | null`; `toPublicUser` continues to exclude secrets.
- Changes: `api.login(username, password, totp = '', opts = {})`.
- Changes: `POST /api/login` may return HTTP 202 `{ mfaRequired: true }` with no session cookie.
- Produces LoginView props `mfaRequired`, `loginTotp`, `setLoginTotp`, and `cancelMfa`.

**Evidence:** Append Task 4 commands, exit codes, zero-session challenge/rejection assertions, and browser observations to `implementation-evidence/P5.md` during Task 5.

- [ ] **Step 1: Write failing backend MFA route tests**

Create `test_p5_mfa_login.js` with an isolated database and an Express app mounting `createAuthRouter`. Seed one normal user and one MFA user. Generate the current valid token with the same RFC 6238 counter/HMAC calculation used by the existing TOTP unit test.

Required assertions:

```js
const challenge = await postLogin({ username, password });
assert.strictEqual(challenge.status, 202);
assert.deepStrictEqual(challenge.body, { mfaRequired: true });
assert.strictEqual(challenge.headers.get('set-cookie'), null);
assert.strictEqual(activeSessionCount(mfaUser.id), 0);

const rejected = await postLogin({ username, password, totp: '000000' });
assert.strictEqual(rejected.status, 401);
assert.strictEqual(activeSessionCount(mfaUser.id), 0);

const accepted = await postLogin({ username, password, totp: validTotp });
assert.strictEqual(accepted.status, 200);
assert.match(accepted.headers.get('set-cookie'), /xfactor_session=/);
assert.strictEqual(activeSessionCount(mfaUser.id), 1);
```

Also assert the normal user still receives HTTP 200 without `totp`.

- [ ] **Step 2: Run backend MFA test and prove password-only bypass**

Run:

```bash
node backend/tests/test_p5_mfa_login.js
```

Expected: FAIL because the MFA user currently receives a session after password verification alone.

- [ ] **Step 3: Expose MFA state only to internal auth code**

Extend `mapUserRow`:

```js
return {
  id: row.id,
  username: row.username,
  passwordHash: row.password_hash,
  isAdmin: row.is_admin === 1,
  mfaEnabled: row.mfa_enabled === 1,
  totpSecret: row.totp_secret || null
};
```

Do not add `totpSecret` to `toPublicUser`, session user objects, logs, error details, or API JSON.

- [ ] **Step 4: Validate the optional TOTP shape**

In `validateLoginPayload`, accept only the exact existing username/password rules plus an optional empty-or-six-digit TOTP:

```js
const totp = payload.totp;
if (totp !== undefined && (typeof totp !== 'string' || !/^\d{6}$/.test(totp.trim()))) {
  return false;
}
```

Malformed TOTP returns the existing HTTP 400 invalid-payload response before authentication.

- [ ] **Step 5: Gate session creation in the login route**

Read `{ username, password, totp }`. After password authentication and before revoking/creating sessions:

```js
if (user.mfaEnabled) {
  if (!totp) {
    return res.status(202).json({ mfaRequired: true });
  }
  if (!user.totpSecret || !verifyTotpToken(user.totpSecret, totp)) {
    return res.status(401).json({ error: 'Çok faktörlü doğrulama kodu geçersiz.' });
  }
}
```

Import `verifyTotpToken`. No session row or session cookie may be created on either MFA challenge or rejection.

- [ ] **Step 6: Write failing frontend MFA tests**

Create `P5MfaLogin.test.jsx` to render `LoginView` in both states. Assert:

- Credential state shows username/password and no TOTP input.
- MFA state shows an input labeled `Doğrulama Kodu`, `inputMode="numeric"`, `autoComplete="one-time-code"`, and a cancel control.
- Submitting MFA state invokes the same `handleLogin` form callback.
- Cancel invokes `cancelMfa`.

Run:

```bash
npm --prefix frontend run test:unit -- --run src/components/__tests__/P5MfaLogin.test.jsx
```

Expected: FAIL because LoginView has no MFA state.

- [ ] **Step 7: Implement frontend MFA state transitions**

Change API client login signature:

```js
login: (username, password, totp = '', opts = {}) =>
  request('/login', {
    method: 'POST',
    body: JSON.stringify({ username, password, ...(totp ? { totp } : {}) }),
    ...opts
  })
```

In `App` add `mfaRequired` and `loginTotp`. On `{ mfaRequired:true }`, preserve username/password, clear the TOTP field, and do not set authenticated state. On successful user response, clear password, TOTP, and MFA state before setting authenticated. `clearAccountState` and an explicit `cancelMfa` must clear all MFA intermediate state.

Pass the new props to `LoginView`. In MFA state:

- Disable username/password editing by replacing those fields with a short account-identifying message.
- Render the six-digit TOTP input.
- Keep submit button text `Kodu Doğrula`.
- Add `Parola ekranına dön` that calls `cancelMfa`.

- [ ] **Step 8: Register and verify Task 4 unit/integration behavior**

Register `test_p5_mfa_login.js` after the other P5 suites. Run:

```bash
node backend/tests/test_p5_mfa_login.js
node backend/tests/test_p2_security_auth.js
npm --prefix frontend run test:unit -- --run src/components/__tests__/P5MfaLogin.test.jsx
npm --prefix frontend run test:unit
```

Expected: all PASS; password-only MFA login creates zero sessions.

- [ ] **Step 9: Add real browser proof**

Create `e2e/trust-chain.spec.js` using the Playwright fixture DB. In `beforeAll`:

- Create an MFA user and call `generateTotpSecret`.
- Create an unverified project owned by that user.
- Create a second completed project with latest approved contract, verified artifact, all 18 mandatory PASS checks, matching artifact file/hash, and a completion receipt.

Browser scenarios:

```js
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
```

For download policy, select the unverified project and assert no `Projeyi (ZIP) İndir` or Sidebar ZIP control exists. Select the verified completed project, wait for `page.waitForEvent('download')`, click the Header button, and assert the suggested filename ends with `.zip`.

- [ ] **Step 10: Run browser proof**

Run:

```bash
npx playwright test e2e/trust-chain.spec.js --project=chromium
```

Expected GREEN: MFA challenge and both download authorization scenarios PASS against real frontend/backend processes and isolated fixture storage.

- [ ] **Step 11: Commit Task 4**

```bash
git add backend/auth.js backend/security.js backend/routes/authRoutes.js backend/tests/test_p5_mfa_login.js backend/tests/test_runner.js frontend/src/services/api.js frontend/src/App.jsx frontend/src/components/LoginView.jsx frontend/src/components/__tests__/P5MfaLogin.test.jsx e2e/trust-chain.spec.js
git commit -m "fix(auth): enforce TOTP before session"
```

---

### Task 5: Verify and Record P5

**Files:**
- Create: `implementation-evidence/P5.md`
- Modify: `guncel-todo.md`
- Modify: `PROJECT-CONTINUITY.md`
- Modify: `yol-haitasi-todo.md`
- Modify: `implementation-plans/00-MASTER-EXECUTION-PLAN.md`
- Modify: `scripts/validate-continuity.mjs`

**Interfaces:**
- Consumes: passing Task 1–4 commits and exact verification output.
- Produces: P5 evidence receipt and continuity pointer to P6 planning; no source behavior.

**Evidence:** This task creates and finalizes `implementation-evidence/P5.md`; no P5 status becomes verified before all preceding evidence is present.

- [ ] **Step 1: Extend the continuity schema in a deliberately failing state**

Add P5 to `UNIT_IDS`, `UNIT_PLANS`, and `UNIT_DEPENDENCIES` in `scripts/validate-continuity.mjs`, with dependency `['P4']`. Add one unchecked P5 unit row to `yol-haitasi-todo.md` and one P5 row to the master plan, but do not create `implementation-evidence/P5.md` yet.

Run:

```bash
node scripts/validate-continuity.mjs
```

Expected: FAIL because the newly registered `implementation-evidence/P5.md` does not exist and P5 has not been verified. This is the RED state for the superseding ledger.

- [ ] **Step 2: Run all P5-specific checks**

```bash
node backend/tests/test_p5_execution_boundary.js
node backend/tests/test_p5_artifact_completion.js
node backend/tests/test_p5_mfa_login.js
npm --prefix frontend run test:unit
npx playwright test e2e/trust-chain.spec.js --project=chromium
```

Expected: every command exits 0.

- [ ] **Step 3: Run related regression suites**

```bash
node backend/tests/test_build_sandbox_gate.js
node backend/tests/test_subprocess_sandbox.js
node backend/tests/test_p1_c_repository.js
node backend/tests/test_p1_c_artifact_verifier.js
node backend/tests/test_p4_production_safety.js
node backend/tests/test_http_integration.js
```

Expected: every suite exits 0.

- [ ] **Step 4: Run complete project verification**

```bash
npm --prefix backend test
npm --prefix frontend run build
npx playwright test --project=chromium
```

Expected: backend suites, frontend production build, and all browser tests exit 0.

- [ ] **Step 5: Perform security-focused review**

Review the final diff against these blocking conditions:

- Any direct generated-path `spawn` outside a validated adapter.
- Any generated-path use of `allowHostExecution` or `XFACTOR_BUILD_SANDBOX=host`.
- Any client-side ZIP creation.
- Any artifact domain consumer reading snake_case fields.
- Any MFA challenge/rejection that creates a session or returns a session cookie.
- Any API response containing `totpSecret`, `totp_secret`, password hash, or session token.

A blocking match must be fixed and all affected checks rerun before evidence is written.

- [ ] **Step 6: Write immutable evidence and update ledgers**

Create `implementation-evidence/P5.md` containing:

- P5 goal and design/spec path.
- Task commit IDs.
- Every verification command from Steps 1–3.
- Exact exit code and observed pass counts.
- Browser observations for MFA and download.
- Review result and any fixed findings.
- Final status `verified` only if all commands passed.

Then:

- Mark P5 and its completed tasks `[x]` in `guncel-todo.md`.
- Add a supersession pointer from `yol-haitasi-todo.md` to `guncel-todo.md`; preserve P0–P4 historical status.
- Extend `00-MASTER-EXECUTION-PLAN.md` with P5 as the verified superseding unit. Keep P6 only as the textual next action until its plan exists.
- Update `PROJECT-CONTINUITY.md` to `current_unit: P5`, `current_plan: implementation-plans/10-P5-critical-trust-chain.md`, `status: verified`, `evidence_file: implementation-evidence/P5.md`, and an exact P6 planning next action.
- Update the P5 row in `yol-haitasi-todo.md` to verified and retain the pointer to `guncel-todo.md`.
- Run `node scripts/validate-continuity.mjs` again after ledger updates.

- [ ] **Step 7: Verify the superseding ledger turns GREEN**

Run:

```bash
node scripts/validate-continuity.mjs
```

Expected: PASS with P5 as the current verified unit and P6 design/planning as the exact next action.

- [ ] **Step 8: Commit P5 evidence and continuity**

```bash
git add implementation-evidence/P5.md guncel-todo.md PROJECT-CONTINUITY.md yol-haitasi-todo.md implementation-plans/00-MASTER-EXECUTION-PLAN.md scripts/validate-continuity.mjs
git commit -m "docs: record verified P5 trust chain"
```

- [ ] **Step 9: Stop at the delivery boundary**

Do not implement P6 source changes. The exact next action after P5 verification is to brainstorm and write the P6 production-operability design/plan from `guncel-todo.md`.

## P5 Exit Gate

- [ ] All three P5 backend test files pass against isolated databases.
- [ ] Frontend unit tests pass.
- [ ] MFA and verified-only download browser journeys pass.
- [ ] Generated execution cannot reach a direct host process branch.
- [ ] Artifact, verification run, completion receipt, and contract identities match.
- [ ] MFA challenge and rejection create no session or session cookie.
- [ ] Full backend regression, frontend build, and Playwright suite pass.
- [ ] Security-focused review has no blocking finding.
- [ ] `implementation-evidence/P5.md` records exact commands and exit codes.
- [ ] `node scripts/validate-continuity.mjs` passes with P5 verified.
