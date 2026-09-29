# LLM Management Implementation Plan

**Goal:** Provide a reusable, admin-only Turkish LLM provider management page and connect its selected profile to every XFactor LLM call.

**Architecture:** A mountable Express router and profile resolver live under `backend/llm-auth`. Encrypted file storage is injected through options. The existing `generateLLMResponse` remains the common call boundary and reads the selected profile once per call.

**Tech Stack:** Node 22, Express, node:crypto, existing React navigation, Node test runner.

## Global Constraints

- Keep existing `.env` behavior until an active profile is selected.
- Never return or log stored API keys.
- Deny non-admin access to both HTML and API.
- Preserve existing uncommitted work.

### Task 1: Profile persistence and validation

**Files:** `backend/llm-auth/llm.js`, `backend/tests/test_llm_auth.js`, `backend/tests/testInventory.js`

- [x] Write failing tests for encrypted persistence, masked output, provider validation, and active-profile selection.
- [x] Run the focused suite and confirm expected failures.
- [x] Implement encrypted store, catalog, and resolver.
- [x] Run the focused suite.

### Task 2: Protected HTTP page and API

**Files:** `backend/llm-auth/llm.js`, `backend/llm-auth/llm.html`, `backend/llm-auth/llm-ui.js`, `backend/server.js`, `backend/tests/test_llm_auth.js`

- [x] Write failing HTTP tests for admin and non-admin access, CRUD, discovery, and connection testing.
- [x] Run the focused suite and confirm expected failures.
- [x] Implement router and Turkish page.
- [x] Run the focused suite.

### Task 3: Runtime integration and documentation

**Files:** `backend/llm.js`, `frontend/src/App.jsx`, `frontend/src/components/Sidebar.jsx`, `backend/.env.example`, `README.md`, `backend/tests/test_llm_auth.js`

- [x] Write failing provider-switch test through `generateLLMResponse`.
- [x] Run the focused suite and confirm expected failure.
- [x] Resolve active profile at call start and add an admin navigation link.
- [x] Run backend tests, frontend tests, build, and diff check.
- [x] Document installation, key setup, and portable router integration.

## Verification note

Frontend: 9 files / 68 tests passed with one worker; build passed. Backend: 128 of 129 suites passed in the full run; the 100 ms readiness test failed under concurrent load, then passed alone. The four directly affected backend suites passed together. No live paid provider credentials were used in automated tests.
