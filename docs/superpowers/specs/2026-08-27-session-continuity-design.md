# Session Continuity Ledger Design

## Status

Approved on 2026-08-27. This design governs planning and implementation of `PROJECT-QUALITY-IMPROVEMENT-PLAN.md` across separate chats and context resets.

## Problem

Conversation memory is not a durable project state. A new chat must recover current work, verified completion, decisions, blockers, and next action without relying on prior dialogue or rereading the full 60+ KB improvement plan.

## Decision

Use Git-tracked, repository-native continuity records:

- `PROJECT-CONTINUITY.md`: bounded machine/human handoff; sole session entry point.
- `yol-haitasi-todo.md`: user-facing roadmap visible in project file UI.
- `implementation-plans/00-MASTER-EXECUTION-PLAN.md`: unit graph and shared interfaces.
- One implementation plan per delivery unit.
- `implementation-evidence/*.md`: immutable verification receipts by unit.
- `scripts/validate-continuity.mjs`: validates both views, plan hash, references, and status coherence.

Git history is the durability layer. Chat memory is advisory only.

## File Responsibilities

### `PROJECT-CONTINUITY.md`

Maximum 200 lines. YAML frontmatter records schema, initiative, approved-plan hash, active unit/plan/task, state, branch, baseline/verified commit, evidence file, blockers, exact next action, and update time. Body records invariants, completed work, active work, pending work, decisions, verification, known failures, dirty worktree, exact next action, and prohibited actions.

### `yol-haitasi-todo.md`

Human-facing mirror. Contains validator-readable HTML markers matching continuity frontmatter and a checklist for every delivery unit. It never authorizes completion by itself; verified state must have evidence.

### Master and unit plans

Master plan defines dependency order and shared interfaces. Unit plans are independently executable, testable, reviewable, and resumable. Each task names exact files, interfaces, RED/GREEN commands, expected results, verification, evidence update, and commit boundary.

### Evidence files

Evidence records commands/scenarios, exit status, behavior observed, reviewer decision, independent tester decision, commit, and artifacts. Pending work explicitly says no evidence exists; it never fabricates PASS.

## Dual-View Invariants

`PROJECT-CONTINUITY.md` and `yol-haitasi-todo.md` must match on:

- `schema_version`
- `initiative`
- `improvement_plan_sha256`
- `master_plan`
- `current_unit`
- `status`

Validator also requires all unit plans and evidence files, all roadmap unit IDs, an exact improvement-plan SHA-256, a bounded continuity file, and no completed unit without verified evidence.

## Session Bootstrap

New chat reads, in order:

1. `PROJECT-CONTINUITY.md`
2. `implementation-plans/00-MASTER-EXECUTION-PLAN.md`
3. Only the current unit plan
4. Only the current unit evidence file
5. `git status` and relevant recent commits
6. Relevant source sections

It validates the continuity ledger before work. HEAD mismatch or unrecorded dirty files triggers reconciliation; no implementation proceeds on assumed state.

## Checkpoint Protocol

At a verified task boundary:

1. Run task-specific behavior verification.
2. Obtain independent review and test result where required.
3. Update unit evidence.
4. Check the unit-plan task.
5. Update master status if the unit boundary changed.
6. Update roadmap and continuity in one logical checkpoint.
7. Run `node scripts/validate-continuity.mjs`.
8. Commit code, tests, plans, evidence, and ledger coherently.

`head_commit: SELF` avoids a self-referential commit hash. `last_verified_commit` stores the actual commit whose behavior is proven.

## Recovery

- Continuity HEAD mismatch: inspect intervening commits and reconcile before work.
- Unrecorded dirty tree: identify owner/task and verification state; never infer completion.
- Interrupted RED task: resume from recorded failing command/evidence.
- Interrupted GREEN task without evidence: rerun task-specific verification.
- Plan change: create approved supersession, update master dependencies and plan hash, retain old evidence as historical but inapplicable.

## State Semantics

Allowed unit states:

`pending`, `in_progress`, `blocked`, `implemented`, `verified`, `rejected`, `completed`, `superseded`.

`implemented` is not `verified`. `completed` requires every mandatory task verified and a unit evidence receipt. Markdown checkboxes are views, not authority.

## Plan Decomposition

Delivery-unit plans:

1. P0-A state and contract safety
2. P0-B OS sandbox and fail-closed verification
3. P0-C selective checkpoint safety
4. P1-A contract and requirement traceability
5. P1-B runtime/API/browser verifier
6. P1-C artifact and ZIP clean-room validation
7. P2 quality hardening
8. P3 observability and metrics

## Non-Goals

- No reliance on hidden model memory.
- No full conversation transcript in continuity files.
- No raw long logs committed into roadmap files.
- No completion from agent self-report.
- No silent plan mutation.
- No Todo artifact repair in this initiative.

## Acceptance

- A fresh chat can identify the exact active unit, task, verified commit, evidence, and next command by reading four bounded files.
- Validator detects drift between human roadmap and machine/operator continuity state.
- Missing plan, evidence, hash, unit ID, or verified receipt fails validation.
- Context reset does not change authoritative project state.
