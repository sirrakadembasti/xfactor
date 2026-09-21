# ZIP-Only Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the completed-project browser editor while retaining verified ZIP download and the backend files API.

**Architecture:** `Header` will no longer expose an editor mode. `App` will no longer request project files for a completed project or render `IDEView`. Monaco-only files and dependencies can then be removed; the backend route stays unchanged.

**Tech Stack:** React 18, Vite, Vitest, Node.js Graphify.

## Global Constraints

- Preserve the existing verified-artifact ZIP authorization and UX.
- Keep `GET /api/projects/:id/files` unchanged.
- Do not change workflow, project state transitions, or artifact verification.

---

### Task 1: Remove editor UI and frontend file fetch

**Files:** `frontend/src/App.jsx`, `frontend/src/components/Header.jsx`, `frontend/src/components/__tests__/P5DownloadPolicy.test.jsx`, `frontend/src/components/__tests__/P9ProjectIsolation.test.jsx`.

- [x] Add a test asserting a completed verified project has ZIP but no editor button, then run the test and observe failure.
- [x] Add an App test asserting completed-project selection does not call `api.getProjectFiles`, then run and observe failure.
- [x] Remove editor mode/render and the automatic files effect; preserve ZIP controls; rerun the focused tests.

### Task 2: Retire editor-only assets and update the graph

**Files:** `frontend/src/components/IDEView.jsx`, `frontend/src/monacoSetup.js`, `frontend/vite.config.js`, `frontend/package.json`, `frontend/package-lock.json`, `e2e/p9-editor.spec.js`, `e2e/production.config.js`, `backend/scripts/generate_graph.js`, `README.md`, `kullanici-kilavuzu.md`, `graphify-out/*`.

- [x] Remove editor-only frontend files, Vite aliases, dependencies, and obsolete editor E2E coverage; retain ZIP E2E coverage.
- [x] Update README and user guide to describe ZIP-only completion and the remaining views.
- [x] Remove stale curated Graphify references and run `npm run graph`; assert no dangling nodes or links.
- [x] Run frontend unit tests, frontend build, backend test suite, and `git diff --check` before committing.
