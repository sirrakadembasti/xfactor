# Quiz-Master & Multi-Stack Manager Orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute the full lifecycle of Quiz-Master application generation by engaging the platform's Manager agent, diagnosing generated project internals for missing features or build failures without manual patches inside `projects/`, and hardening the platform prompts and orchestration engine.

**Architecture:** A multi-step flow where the platform Manager agent is prompted via the backend API to architect Quiz-Master. The orchestration engine (Manager -> Director -> Teamleader -> Coder) produces the application in `projects/`. We inspect the generated app externally, diagnose build/test/schema issues, resolve root causes in platform code/prompts, and achieve a 100% complete, building Next.js 15+ Quiz-Master project.

**Tech Stack:** Node.js 22 LTS, Next.js 15+, React 19/18.3, Prisma 6+, SQLite, Tailwind CSS, TypeScript, Express (Platform API), Vitest/Playwright.

## Global Constraints

- Never manually edit or patch code inside `projects/` directly; all fixes must be solved at the platform level (prompts, schemas, verification gates, engine).
- Lock latest stable versions for generated dependencies (no legacy pinning).
- Ensure multi-stack adaptability in Manager and Director agent prompts (Next.js default, Nuxt, Python, .NET supported).
- Generated project must pass `npm run build` / `tsc --noEmit` and database setup cleanly.
- Include working seed data with standard test accounts for Admin, Teacher, and Student.

---

### Task 1: Codify Latest Stable Version & Multi-Stack Guidelines in Platform Prompts

**Files:**
- Modify: `docs/manager.md`
- Modify: `docs/director.md`
- Modify: `docs/ORKESTRASYON-TALIMATNAMESI.md`
- Modify: `backend/agents/manager.js`
- Modify: `backend/agents/director.js`

**Interfaces:**
- Produces: Updated system prompts ensuring Manager and Director lock the latest stable versions of dependencies and adapt to requested stacks (Next.js, Nuxt, Python, .NET).

- [ ] **Step 1: Inspect current agent prompt fallback texts**
- [ ] **Step 2: Update `docs/manager.md` and `docs/director.md` with explicit 2026/latest stable rules and multi-stack guidelines**
- [ ] **Step 3: Update `backend/agents/manager.js` and `backend/agents/director.js` fallback prompts**
- [ ] **Step 4: Update `docs/ORKESTRASYON-TALIMATNAMESI.md` with multi-stack architectural standards**
- [ ] **Step 5: Commit changes**

---

### Task 2: Create Quiz-Master Project and Initiate Manager Dialogue

**Files:**
- Create/Run: Script or API call to create project `Quiz-Master` and send initial specification message to `/:id/chat`
- Monitor: `backend/routes/projectRoutes.js` and database `chat_history`

**Interfaces:**
- Consumes: Platform REST API (`POST /api/projects`, `POST /api/projects/:id/chat`)
- Produces: Initialized project with comprehensive Quiz-Master requirements in `chatHistory` and `manager/TALIMATNAME.md`.

- [ ] **Step 1: Initialize database and create project named `Quiz-Master`**
- [ ] **Step 2: Send the complete Quiz-Master specification message to Manager via chat endpoint**
- [ ] **Step 3: Verify Manager's plan response, ensuring role matrix, Prisma models, and AI question generator requirements are captured**
- [ ] **Step 4: If plan needs refinement, send follow-up prompt to Manager**
- [ ] **Step 5: Verify status transitions to `pending_approval` with valid plan**

---

### Task 3: Approve Plan and Run Workflow Engine

**Files:**
- Execute: `POST /api/projects/:id/approve`
- Monitor: Workflow logs via WebSocket / `project_logs`
- Inspect: `projects/<id>/` generation progress

**Interfaces:**
- Consumes: Approved contract and workflow attempts engine
- Produces: Generated project codebase in `projects/<id>/` across directors and teamleaders.

- [ ] **Step 1: Approve project to start DAG orchestration**
- [ ] **Step 2: Observe workflow progress through Manager -> Director -> Teamleader -> Coder**
- [ ] **Step 3: Wait for workflow completion or pause/failure state**

---

### Task 4: Inspect Generated Quiz-Master Internals & Diagnose Issues

**Files:**
- Inspect: `projects/<id>/package.json`
- Inspect: `projects/<id>/prisma/schema.prisma`
- Inspect: `projects/<id>/src/`
- Test: Run build and typecheck in isolation inside `projects/<id>/` without modifying files

**Interfaces:**
- Consumes: Generated project artifacts
- Produces: Diagnostic report detailing missing models, syntax issues, dependency version mismatches, or missing seed accounts.

- [ ] **Step 1: Check dependencies in `package.json` for latest stable versions**
- [ ] **Step 2: Check Prisma schema for all 7 required models and relations**
- [ ] **Step 3: Check presence of AI Question Generator, Exam Room with Timer, and Result Breakdown pages**
- [ ] **Step 4: Run diagnostic `npx prisma validate` and `npm run build` inside the project to capture compiler errors**
- [ ] **Step 5: Document all identified root causes in diagnostic notes**

---

### Task 5: Remediate Platform Root Causes & Regenerate Quiz-Master via Manager

**Files:**
- Modify: Relevant platform templates, schemas (`backend/agents/schemas.js`), coder prompts, or workflow rules based on Task 4 findings.
- Retrigger: Manager chat revision / regeneration without touching `projects/<id>/` directly.

**Interfaces:**
- Consumes: Platform fixes
- Produces: A completely clean, functional Quiz-Master project generated entirely through the platform pipeline.

- [ ] **Step 1: Apply root cause fixes to platform agent prompts/validators/schemas**
- [ ] **Step 2: Re-run or trigger project generation through Manager**
- [ ] **Step 3: Re-verify build (`npm run build`, `tsc --noEmit`, `prisma db push`)**
- [ ] **Step 4: Confirm seed script creates Admin, Teacher, and Student test accounts**

---

### Task 6: Final Verification and Documentation

**Files:**
- Update: `implementation-evidence/` or project report
- Test: Verify project end-to-end

- [ ] **Step 1: Run comprehensive build verification on generated Quiz-Master**
- [ ] **Step 2: Verify zero manual edits were made inside `projects/`**
- [ ] **Step 3: Commit platform changes and update progress documentation**
