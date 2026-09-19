# Quality Dashboard (DashboardView) Graphify Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the frontend Quality Dashboard (`frontend/src/components/DashboardView.jsx`), its Vitest unit tests (`frontend/src/components/__tests__/DashboardView.test.jsx`), and Playwright acceptance tests (`e2e/dashboard.spec.js`) into the Graphify architecture dependency generator, update visual tree templates, re-generate artifacts to 80 nodes and 110 links, and synchronize documentation.

**Architecture:** Extend `backend/scripts/generate_graph.js` with the three missing nodes in `frontend` and `tests` collections, wire their architectural edges (`renders`, `uses`, `runs`, `verifies`, `consumes_api`), append `DashboardView.jsx` and `dashboard.spec.js` to the HTML tree template, run `npm run graph` to produce updated artifacts, and sync metric lines in `README.md` and `kullanici-kilavuzu.md`.

**Tech Stack:** Node.js (ES modules), Graphify AST generator, D3.js visualization artifacts, Vitest, Playwright.

## Global Constraints

- Never touch project code inside `projects/`.
- Only modify platform core scripts (`backend/scripts/generate_graph.js`) and documentation files (`README.md`, `kullanici-kilavuzu.md`, `graphify-out/*`).
- Maintain existing 18 mandatory quality gates and zero test regressions.
- Exact node count must become 80; exact link count must become 110.

---

### Task 1: Update `generate_graph.js` with Quality Dashboard Nodes, Links, and HTML Tree

**Files:**
- Modify: `backend/scripts/generate_graph.js`
- Reference: `docs/superpowers/specs/2026-09-19-quality-dashboard-graphify-design.md`

**Interfaces:**
- Consumes: `DashboardView.jsx`, `DashboardView.test.jsx`, `e2e/dashboard.spec.js` paths and descriptions from design spec.
- Produces: Updated `generate_graph.js` which defines 80 nodes and 110 links upon execution.

- [ ] **Step 1: Inspect target sections in `backend/scripts/generate_graph.js`**

Verify line ranges for `frontend` array, `tests` array, test verification links, and `treeHtml` components.

- [ ] **Step 2: Add `DashboardView.jsx` to `frontend` array**

In `backend/scripts/generate_graph.js`, add:
```javascript
{ id: 'frontend/src/components/DashboardView.jsx', label: 'DashboardView.jsx (Kalite & Kanıt Paneli)', desc: '18 kalite kapısı, doğrulama koşuları ve sansürlenmiş konsol logları salt-okunur denetim paneli' },
```

- [ ] **Step 3: Add `DashboardView.test.jsx` and `dashboard.spec.js` to `tests` array**

In `backend/scripts/generate_graph.js`, add to `tests`:
```javascript
{ id: 'frontend/src/components/__tests__/DashboardView.test.jsx', label: 'DashboardView.test.jsx', desc: 'Salt-okunur yetki sınırı, kanıt izolasyonu ve sansürlü log render birim testleri' },
{ id: 'e2e/dashboard.spec.js', label: 'dashboard.spec.js (Playwright E2E)', desc: 'Kalite paneli uçtan uca tarayıcı denetimi, yetki izolasyonu ve yeniden derleme izlenebilirliği' }
```

- [ ] **Step 4: Add architectural links for DashboardView and API consumption**

In `backend/scripts/generate_graph.js`, add:
```javascript
addLink('frontend/src/components/DashboardView.jsx', 'frontend/src/services/api.js', 'uses');
addLink('frontend/src/components/__tests__/DashboardView.test.jsx', 'frontend/src/components/DashboardView.jsx', 'verifies');
addLink('e2e/dashboard.spec.js', 'frontend/src/components/DashboardView.jsx', 'verifies');
addLink('e2e/dashboard.spec.js', 'backend/routes/projectRoutes.js', 'verifies');
addLink('frontend/src/services/api.js', 'backend/routes/projectRoutes.js', 'consumes_api');
```

- [ ] **Step 5: Add tree nodes in `treeHtml` template**

Under `📁 frontend/src/` in `treeHtml`:
- Add `<li><span class="file">📄 components/DashboardView.jsx</span> <span class="tag tag-ui">Kalite & Kanıt Paneli</span></li>`
Under root `<ul>`:
- Add `<li><span class="folder">📁 e2e/</span><ul><li><span class="file">📄 dashboard.spec.js</span> <span class="tag tag-test">Dashboard E2E Kanıt Testi</span></li></ul></li>`

- [ ] **Step 6: Run `npm run graph` and verify counts**

Run: `npm run graph`
Expected output:
```
✓ Graphify Bilgi Grafiği ve Görsel HTML Haritaları Başarıyla Üretildi!
  - JSON Grafiği: graphify-out/graph.json (80 düğüm, 110 bağlantı)
```

- [ ] **Step 7: Commit Task 1 changes**

```bash
git add backend/scripts/generate_graph.js
git commit -m "feat(graph): add quality dashboard and e2e test nodes to graph generator"
```

---

### Task 2: Re-generate Artifacts and Assert Graph JSON Integrity

**Files:**
- Modify: `graphify-out/graph.json`, `graphify-out/graph.html`, `graphify-out/GRAPH_TREE.html`, `graphify-out/GRAPH_REPORT.md`

**Interfaces:**
- Consumes: `backend/scripts/generate_graph.js`
- Produces: Validated `graphify-out/` artifact files with 80 nodes and 110 edges.

- [ ] **Step 1: Execute graph generation script**

Run: `npm run graph`

- [ ] **Step 2: Assert graph JSON contains all target nodes and exact link count**

Run one-line verification script:
```bash
node -e "const g = JSON.parse(require('fs').readFileSync('graphify-out/graph.json', 'utf8')); if (g.nodes.length !== 80 || g.links.length !== 110) { console.error('Counts mismatch:', g.nodes.length, g.links.length); process.exit(1); } const ids = new Set(g.nodes.map(n => n.id)); ['frontend/src/components/DashboardView.jsx', 'frontend/src/components/__tests__/DashboardView.test.jsx', 'e2e/dashboard.spec.js'].forEach(id => { if (!ids.has(id)) { console.error('Missing node:', id); process.exit(1); } }); console.log('Graph JSON validated: 80 nodes, 110 links');"
```
Expected output: `Graph JSON validated: 80 nodes, 110 links`

- [ ] **Step 3: Commit updated Graphify artifacts**

```bash
git add graphify-out/
git commit -m "build(graph): regenerate graphify artifacts with quality dashboard nodes"
```

---

### Task 3: Synchronize Documentation Metrics

**Files:**
- Modify: `README.md`
- Modify: `kullanici-kilavuzu.md`

**Interfaces:**
- Consumes: Exact node (80), link (110), and runner connection counts from Task 2.
- Produces: Updated markdown documentation matching generated graph artifacts.

- [ ] **Step 1: Update `README.md` Graphify metrics**

Update line 132:
```markdown
- **Mimari Özet Raporu:** `graphify-out/GRAPH_REPORT.md` (80 düğüm, 110 bağlantı ve God Node analizleri)
```

- [ ] **Step 2: Update `kullanici-kilavuzu.md` Graphify metrics**

Update line 402 and runner connection line:
```markdown
1. **`graphify-out/graph.json`:** 80 düğüm (node) ve 110 bağlantı (edge) içeren tam makine-okunur bağımlılık grafiği.
- `backend/tests/test_runner.js` — 29 bağlantı ile tüm test ekosisteminin merkez koşucusu.
```

- [ ] **Step 3: Verify markdown diffs**

Run: `git diff README.md kullanici-kilavuzu.md`
Verify only metrics numbers (80, 110, 29) are touched.

- [ ] **Step 4: Commit documentation updates**

```bash
git add README.md kullanici-kilavuzu.md
git commit -m "docs: sync graphify node and edge counts in readme and user guide"
```

---

### Task 4: Complete Verification

**Files:**
- None (verification only)

**Interfaces:**
- Consumes: Entire merged repository state.
- Produces: Green test execution report for both frontend and backend suites.

- [ ] **Step 1: Run frontend unit tests**

Run: `npm --prefix frontend run test:unit`
Expected: 8 test files passed (8), 51 tests passed (51).

- [ ] **Step 2: Run backend test suite**

Run: `npm --prefix backend test`
Expected: 116 test suites passed, 0 failed.

- [ ] **Step 3: Final git status check**

Run: `git status`
Expected: Working tree clean, zero unstaged changes.
