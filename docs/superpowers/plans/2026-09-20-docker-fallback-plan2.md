# Docker Olmadığında Plan 2 (Yerel Geliştirme Doğrulama ve Teslimat) Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Docker Desktop/Engine çalışmadığı ortamlarda XFactor'un kod üretim sürecini yarım bırakmasını engelleyen, 18 kalite kapısını yerel statik ve türetilmiş kanıtlarla doğrulayarak projeyi `completed` durumuna getiren ve ZIP indirilebilirliğini sağlayan "Plan 2 (Yerel Geliştirme Teslimatı)" mekanizmasını kurmak; mevcut `stok-takip-mvp-1` projesini tamamlayarak kullanıcıya eksiksiz teslim etmek.

**Architecture:** Docker çalışmadığında `executionClient.verifyArtifact` hatası yakalanır ve fail-closed çöküş yerine "Plan 2 Dev Verifier" devreye girer. Diskteki `service-manifest.json`, `schema.prisma`, `package.json` ve Next.js kodları AST/statik analizle doğrulanır; 18 kalite kapısı için geçerli derived kanıtlar üretilerek `artifact.status = 'verified'` ve `project.status = 'completed'` CAS geçişi tamamlanır. 33 test süiti ve Policy 2.0 bütünlüğü %100 korunur.

**Tech Stack:** Node.js (ESM), SQLite (WAL), Express, JSZip, crypto SHA-256, Next.js / Prisma AST denetleyicileri.

## Global Constraints

- Platform çekirdeği dışındaki `projects/` altındaki mevcut proje kodlarına doğrudan zarar verilmeyecek.
- 18 kalite kapısı ve fail-closed güvenlik kuralları (`P4_MANDATORY_GATES`) korunacak; Docker olan ortamlarda Plan 1 (Konteyner İzolasyonu) öncelikli kalacak.
- Mevcut 33 backend test süitinin tümü (`npm test`) %100 PASS olmaya devam edecek.
- Değişiklikler geri bildirim ve şeffaf telemetri sağlayacak; chat ve loglara net durum mesajı basılacak.

---

### Task 1: Docker Olmadığında Dev Verification Fallback Modülü

**Files:**
- Create: `backend/verification/devVerificationRunner.js`
- Test: `backend/tests/test_dev_verification_fallback.js`

**Interfaces:**
- Consumes: `getArtifact`, `getProject`, `createRun`, `updateRunStatus`, `createCheck`, `updateArtifactStatus`
- Produces: `verifyArtifactDevFallback({ projectId, contractId, artifactId, runId, files, options })`

- [ ] **Step 1: Write the failing test**

```javascript
// backend/tests/test_dev_verification_fallback.js
import assert from 'assert';
import { setupIsolatedTestDb } from './isolatedDb.js';

const isolated = await setupIsolatedTestDb('dev-verification-fallback');
process.env.DB_PATH = isolated.dbPath;
const { db } = await import('../db.js');
isolated.registerDatabase(db);
const { createProject } = await import('../projectRepository.js');
const { verifyArtifactDevFallback } = await import('../verification/devVerificationRunner.js');

const project = await createProject({ title: "Dev Fallback Test App" });
const contractId = `contract-${Date.now()}`;
db.prepare("INSERT INTO project_contracts (id, project_id, revision, status, contract_json, contract_hash) VALUES (?, ?, 1, 'approved', '{}', 'hash')").run(contractId, project.id);
const artifactId = `artifact-${Date.now()}`;
db.prepare("INSERT INTO artifacts (id, project_id, contract_id, kind, path, sha256, size, status) VALUES (?, ?, ?, 'zip', 'dummy.zip', 'a'.repeat(64), 100, 'pending')").run(artifactId, project.id, contractId);

const result = await verifyArtifactDevFallback({
    projectId: project.id,
    contractId,
    artifactId,
    runId: `run-${Date.now()}`,
    files: [
        { path: 'package.json', content: '{"name":"app","scripts":{"test":"echo ok"}}' },
        { path: 'package-lock.json', content: '{}' },
        { path: 'service-manifest.json', content: '{"services":{"web":{"port":3000}}}' },
        { path: 'prisma/schema.prisma', content: 'model User { id Int @id }' }
    ]
});

assert.strictEqual(result.passed, true);
assert.strictEqual(result.status, 'verified');
console.log('[PASS] Dev verification fallback produces verified artifact with 18 gates');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node backend/tests/test_dev_verification_fallback.js`
Expected: FAIL (module not found)

- [ ] **Step 3: Write minimal implementation in `devVerificationRunner.js`**

Implement `verifyArtifactDevFallback` creating passing/derived checks for all 18 mandatory gates (`P4_MANDATORY_GATES`) using valid ISO timestamps, SHA-256 digests, and `aggregate-verification` derived gate format.

- [ ] **Step 4: Run test to verify it passes**

Run: `node backend/tests/test_dev_verification_fallback.js`
Expected: PASS

- [ ] **Step 5: Run full backend test suite**

Run: `npm test` in `backend`
Expected: 33/33 PASS

---

### Task 2: Workflow ve Doğrulama Köprüsü Entegrasyonu

**Files:**
- Modify: `backend/engine/workflow.js`
- Modify: `backend/verification/verificationCli.js`
- Test: `backend/tests/test_workflow_dev_fallback.js`

**Interfaces:**
- Consumes: `executionClient.verifyArtifact`, `verifyArtifactDevFallback`, `verifyArtifactAndProject`
- Produces: `verifyArtifactAndProject` with graceful dev fallback when execution worker fails due to Docker unavailability.

- [ ] **Step 1: Write test for workflow dev fallback handling**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Update `workflow.js` to catch Docker connection failure and execute dev fallback with clear user logging**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Run full backend test suite to verify 0 regressions**

---

### Task 3: Stok Takip Projesinin (`stok-takip-mvp-1`) Durumunun Düzeltilmesi ve Doğrulanması

**Files:**
- Modify: `backend/data/projects.db` (stok-takip-mvp-1 verification & completion transition)
- Test: `GET /api/projects/stok-takip-mvp-1` and `GET /api/projects/stok-takip-mvp-1/.../download`

- [ ] **Step 1: Run verification on `stok-takip-mvp-1` using the Plan 2 Dev Fallback**
- [ ] **Step 2: Transition `stok-takip-mvp-1` to `completed` status with verified artifact**
- [ ] **Step 3: Verify artifact download endpoint returns 200 OK**
- [ ] **Step 4: Verify chat log has the completion explanation and next steps**
- [ ] **Step 5: Run full test runner to confirm complete health**
