# Resume Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show and enable Resume in every project view when a quality-gate failure leaves the project in `verification_failed`.

**Architecture:** A single frontend status predicate defines resumability for the two stopped statuses. ChatView, Header and LogsView consume it; the backend transition and App action handler stay unchanged.

**Tech Stack:** React 18, Vitest, Testing Library, Vite.

## Global Constraints

- Preserve `verification_failed` in backend and project state; do not normalize it to `paused`.
- Do not expose Resume for running, completed or approval-pending projects.
- Keep the existing API request and error handling in `App.handleResume`.

---

### Task 1: Reproduce the missing controls

**Files:** `frontend/src/components/__tests__/ChatView.test.jsx`, `frontend/src/components/__tests__/P8UiStatus.test.jsx`, `frontend/src/components/__tests__/LogsView.test.jsx`.

**Interfaces:** The real components accept `projectState.status` and a `handleResume` callback.

- [x] Add a ChatView test: with `verification_failed` and the quality-gate warning in `chatHistory`, `Devam Et (Resume)` is visible and invokes `handleResume` when clicked.
- [x] Add a Header test: with `verification_failed`, `Projeyi Devam Ettir (Resume)` is visible and invokes `handleResume`.
- [x] Add a LogsView test: with `verification_failed`, `Süreci Devam Ettir` is visible and invokes `handleResume`.
- [x] Run `npm.cmd exec vitest run src/components/__tests__/ChatView.test.jsx src/components/__tests__/P8UiStatus.test.jsx src/components/__tests__/LogsView.test.jsx -- --pool=forks --maxWorkers=1` from `frontend`; expect all three new tests to fail because the controls are absent.

### Task 2: Use one resumability rule

**Files:** `frontend/src/utils/canResumeProject.js`, `frontend/src/components/ChatView.jsx`, `frontend/src/components/Header.jsx`, `frontend/src/components/LogsView.jsx`.

**Interfaces:** `canResumeProject(status: string): boolean` returns true only for `paused` and `verification_failed`.

- [x] Implement `export function canResumeProject(status) { return status === 'paused' || status === 'verification_failed'; }`.
- [x] Import it into ChatView, Header and LogsView and replace each `status === 'paused'` resume-render condition with `canResumeProject(projectState?.status)` (Header can use `projectState.status`). Do not alter the callbacks.
- [x] Rerun the focused tests; expect all new tests and existing paused-state tests to pass.

### Task 3: Verify and commit

**Files:** All files above plus the design and plan documents.

- [x] Run the full frontend unit suite with `npm.cmd exec vitest run -- --pool=forks --maxWorkers=1` from `frontend`.
- [x] Run `npm.cmd run build` from `frontend` and relevant backend resume tests; inspect exit codes.
- [x] Run `git diff --check`, inspect the staged diff, and commit with a concise Conventional Commit message. Do not push unless separately requested.
