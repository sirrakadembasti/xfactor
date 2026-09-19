# Quality Dashboard (DashboardView) Graphify Integration Design

- **Date:** 2026-09-19
- **Status:** Approved (Brainstorming Spec)
- **Target:** `backend/scripts/generate_graph.js`, `graphify-out/`, `README.md`, `kullanici-kilavuzu.md`

---

## 1. Context & Motivation

XFactor includes a dedicated, read-only **Kalite Paneli (Quality & Evidence Dashboard)** implemented in `frontend/src/components/DashboardView.jsx` and mounted at `/dashboard`. The panel visualizes:
1. Immutable verification runs (`verification_runs`),
2. 18 mandatory quality gate evaluations (`verification_checks`),
3. Redacted console evidence (`stdout`/`stderr` digests and logs from `verification_check_logs`).

While backend verification policies (`backend/verification/qualityPolicy.js`) and test suites (`test_quality_gate.js`, `test_p1_b_quality_policy_evidence.js`) are tracked in the Graphify dependency graph, the frontend component (`DashboardView.jsx`), its Vitest unit tests (`frontend/src/components/__tests__/DashboardView.test.jsx`), and its Playwright E2E acceptance suite (`e2e/dashboard.spec.js`) were previously omitted from the visual and machine-readable graph generator (`backend/scripts/generate_graph.js`).

This design integrates the Quality Dashboard and its multi-tier test evidence into the canonical Graphify dependency graph, establishing full architectural traceability from UI components to backend verification routes.

---

## 2. Goals & Non-Goals

### Goals
- Register `frontend/src/components/DashboardView.jsx` as a first-class `FrontendComponent` node in `generate_graph.js`.
- Register `frontend/src/components/__tests__/DashboardView.test.jsx` as a `TestSuite` node verifying `DashboardView.jsx`.
- Register `e2e/dashboard.spec.js` as an E2E `TestSuite` node verifying both `DashboardView.jsx` and `backend/routes/projectRoutes.js`.
- Connect the frontend API bridge: `DashboardView.jsx` uses `frontend/src/services/api.js`, which consumes `backend/routes/projectRoutes.js`.
- Update `GRAPH_TREE.html` structure with `DashboardView.jsx` and `dashboard.spec.js`.
- Re-generate fresh `graphify-out/` artifacts (JSON graph, interactive map, hierarchical tree, markdown report).
- Synchronize documented node and edge counts in `README.md` and `kullanici-kilavuzu.md`.

### Non-Goals
- Modifying UI or backend runtime behavior in `DashboardView.jsx`, `api.js`, or `projectRoutes.js`.
- Adding new test cases or altering existing test assertions.
- Altering the 18 quality gates or backend verification pipeline.

---

## 3. Architectural Specifications (Nodes & Edges)

### 3.1 New Nodes
| Node ID | Group | Type | Label | Description |
|---|---|---|---|---|
| `frontend/src/components/DashboardView.jsx` | `frontend` | `FrontendComponent` | `DashboardView.jsx (Kalite & Kanıt Paneli)` | 18 kalite kapısı, doğrulama koşuları ve sansürlenmiş konsol logları salt-okunur denetim paneli |
### 3.2 New Edges / Links
| Source | Target | Label | Addition Mechanism |
|---|---|---|---|
| `frontend/src/App.jsx` | `frontend/src/components/DashboardView.jsx` | `renders` | `frontend.forEach` iteration |
| `frontend/src/components/DashboardView.jsx` | `frontend/src/services/api.js` | `uses` | Explicit `addLink` |
| `backend/tests/test_runner.js` | `frontend/src/components/__tests__/DashboardView.test.jsx` | `runs` | `tests.forEach` test hub iteration |
| `frontend/src/components/__tests__/DashboardView.test.jsx` | `frontend/src/components/DashboardView.jsx` | `verifies` | Explicit `addLink` |
| `backend/tests/test_runner.js` | `e2e/dashboard.spec.js` | `runs` | `tests.forEach` test hub iteration |
| `e2e/dashboard.spec.js` | `frontend/src/components/DashboardView.jsx` | `verifies` | Explicit `addLink` |
| `e2e/dashboard.spec.js` | `backend/routes/projectRoutes.js` | `verifies` | Explicit `addLink` |
| `frontend/src/services/api.js` | `backend/routes/projectRoutes.js` | `consumes_api` | Explicit `addLink` |

### 3.3 Visual Tree (`GRAPH_TREE.html`)
Inside `generate_graph.js`:
- Under `📁 frontend/src/components/`:
  - Add `<li><span class="file">📄 components/DashboardView.jsx</span> <span class="tag tag-ui">Kalite & Kanıt Paneli</span></li>`
- Under `📁 e2e/`:
  - Add `<li><span class="folder">📁 e2e/</span><ul><li><span class="file">📄 dashboard.spec.js</span> <span class="tag tag-test">Dashboard E2E Kanıt Testi</span></li></ul></li>`

---

## 4. Expected Artifact Metrics

- **Previous Counts:** 77 nodes, 102 links
- **New Counts:**
  - Nodes: +3 (`DashboardView.jsx`, `DashboardView.test.jsx`, `e2e/dashboard.spec.js`) ➔ **80 nodes**
  - Links: +8 (`App.jsx -> DashboardView`, `DashboardView -> api.js`, `test_runner -> DashboardView.test`, `DashboardView.test -> DashboardView`, `test_runner -> e2e/dashboard.spec`, `e2e/dashboard.spec -> DashboardView`, `e2e/dashboard.spec -> projectRoutes`, `api.js -> projectRoutes`) ➔ **110 links**
  - `test_runner.js` connectivity: 27 ➔ **29 bağlantı** (merkez koşucu düğümü)

---

## 5. Documentation Synchronization

Files requiring exact count updates:
- **`README.md`**: Update line referencing `graphify-out/GRAPH_REPORT.md (80 düğüm, 110 bağlantı...)`.
- **`kullanici-kilavuzu.md`**: Update line under Graphify section referencing `graphify-out/graph.json: 80 düğüm (node) ve 110 bağlantı (edge)...` and `test_runner.js` connectivity count (29 bağlantı).

---

## 6. Verification Plan

1. **Graph Regeneration:**
   ```bash
   npm run graph
   ```
   Must output:
   `JSON Grafiği: graphify-out/graph.json (80 düğüm, 110 bağlantı)`
2. **Graph JSON Verification:**
   Assert node existence and link integrity in `graphify-out/graph.json`:
   - Contains node `frontend/src/components/DashboardView.jsx`
   - Contains node `frontend/src/components/__tests__/DashboardView.test.jsx`
   - Contains node `e2e/dashboard.spec.js`
   - Contains exactly 80 nodes and 110 links.
3. **Frontend Unit Tests:**
   ```bash
   npm --prefix frontend run test:unit
   ```
   Must pass all 8 test files, 51 tests.
4. **Backend Test Suite:**
   ```bash
   npm --prefix backend test
   ```
   Must pass all 116 test suites.
