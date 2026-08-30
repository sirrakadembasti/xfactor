---
schema_version: 1
initiative: project-quality-improvement
improvement_plan: PROJECT-QUALITY-IMPROVEMENT-PLAN.md
improvement_plan_sha256: b6ca1549990034bdd391ac89eebd7677522d13fc6f9192a5ad24c14d898f0db8
master_plan: implementation-plans/00-MASTER-EXECUTION-PLAN.md
current_unit: P1-A
current_plan: implementation-plans/04-P1-A-contract-traceability.md
current_task: P1-A Task 2 - Extend Capability Registry
status: pending
branch: master
head_commit: SELF
baseline_commit: 4164592f6a633f6094ff7fe45b4662c6bdbd835e
last_verified_commit: 42a3eae0c7e8ae9291380c95dfa0c8e2a6af5fd5
evidence_file: implementation-evidence/P1-A.md
blocked_by: []
next_action: Read P1-A Task 2, write the failing isolated capability registry test, and run the RED command
updated_at: 2026-08-30T13:53:56.339Z
---

# Project Continuity

## Objective

Implement the approved project-quality pipeline redesign without relying on chat memory and without repairing the audited Todo artifact.

## Invariants

- `PROJECT-QUALITY-IMPROVEMENT-PLAN.md` hash must match frontmatter.
- Only the active delivery unit may be implemented.
- No source implementation begins until unit plans are independently reviewed and P0-A execution is explicitly authorized.
- No agent self-report creates verified state.
- Unit completion requires evidence, independent review, independent testing, ledger validation, and commit.
- Existing user work is preserved.

## Completed

- Quality audit and runtime validation of Todo artifact.
- Root-cause diagnosis of false completion.
- Approved quality improvement architecture plan.
- Pre-ledger snapshot commit `4164592f6a633f6094ff7fe45b4662c6bdbd835e`.
- Approved repository-native Continuity Ledger design.

- P0-A Task 1 - Database Schema Migration Version 7.
- P0-A Task 2 - Separated State Machine, CAS Projector, and Status Transitions.
- P0-A Task 3 - Versioned Contract Revision Persistence and Approval Flow.
- P0-A Task 4 - Stack Capability Verification and capability_blocked State.
- P0-A Task 5 - Rejection Recording, Durable Repair Issues and Checkpoint Invalidation.

- P0-A Task 6 - Cutover and Compatibility Cleanup.
- P0-A — State and Contract Safety complete and verified (Tasks 1–6).
- P0-B Task 1 - OS Sandbox Boundary Interface and Adapter Registry.
- P0-B Task 2 - Migration 8 for Verification Runs/Checks Schema and Repository.
- P0-B Task 3 - AST Dependency Inventory and Package Verifier.
- P0-B Task 4 - Real Compiler, Typecheck, and Build Gates.
- P0-B Task 5 - Aggregate Quality Policy and Workflow Integration.
- P0-B — OS Sandbox and Fail-Closed Verification complete and verified (Tasks 1–5).
- P0-C Task 1 - Checkpoint Database Integration and CRUD APIs.
- P0-C Task 2 - Cryptographic Hashing and CAS Validation.
- P0-C Task 3 - Workflow Runner Integration and FS Reconciliation.
- P0-C Task 4 - Selective Rejection and Cascading Checkpoint Invalidation.
- P0-C — Selective Checkpoint Safety complete and verified (Tasks 1–4).
- P1-A Task 1 - Migration 9 Schema for Typed Traceability and Artifacts.
## In Progress

- P1-A Task 2 - Extend Capability Registry

## Pending

1. Read P1-A Task 2 and write the isolated capability registry RED test.
2. Implement Task 2 only after RED is observed.
3. Complete remaining P1-A tasks in plan order.

## Decisions

- Git-tracked files are canonical; chat memory is not.
- Plans are split by delivery unit.
- `PROJECT-CONTINUITY.md` is the session entry point.
- `yol-haitasi-todo.md` is the user-facing mirror.
- Evidence receipts authorize verified checklist state.
- `head_commit: SELF` avoids self-referential commit hashes.
- Task 2 transition matrix remains canonical; Task 3 chat revisions are limited to `planning`, `pending_approval`, and `capability_blocked`.
- Task 5 rejection flow preserves the Task 2 matrix through staged transitions ending at `verification_failed`.

## Verification

- Improvement plan architecture review: APPROVE.
- Improvement instruction coverage: 30/30 PASS.
- Continuity design approved by user.
- Pre-ledger commit succeeded: `4164592f6a633f6094ff7fe45b4662c6bdbd835e`.
- Implementation plan architecture reviewer: APPROVE.
- Implementation plan mechanical validator: APPROVE.
- `node scripts/validate-continuity.mjs`: PASS before planning checkpoint commit.
- Planning checkpoint commit: `42a3eae0c7e8ae9291380c95dfa0c8e2a6af5fd5`.
- P0-A Task 1 review: APPROVE; specification PASS, quality PASS.
- P0-A Task 1 independent migration test: PASS (`1` passed, `0` failed).
- P0-A Task 1 continuity validation: PASS.
- P0-A Task 2 review: APPROVE; specification compliant, quality approved.
- P0-A Task 2 independent state-transition test: PASS (`1` passed, `0` failed).
- P0-A Task 2 continuity validation: PASS.
- P0-A Task 3 review: APPROVE; specification compliant, quality approved.
- P0-A Task 3 independent contract-flow test: PASS (`1` passed, `0` failed).
- P0-A Task 3 continuity validation: PASS.
- P0-A Task 4 review: APPROVE; specification PASS, quality PASS.
- P0-A Task 4 independent capability test: PASS (`1` passed, `0` failed).
- P0-A Task 4 continuity validation: PASS.
- P0-A Task 5 review: APPROVE; specification and quality criteria met.
- P0-A Task 5 independent rejection test: PASS (`1` passed, `0` failed).
- P0-A Task 5 continuity validation: PASS.
- P0-A Task 6 review: APPROVE; specification PASS, quality PASS.
- P0-A Task 6 independent cutover test: PASS (`1` passed, `0` failed).
- P0-A Task 6 continuity validation: PASS.
- P0-A Unit verification: 6/6 isolated unit tests PASS, 25/25 integration suites PASS.
- P0-A Final review: APPROVE; specification PASS, quality PASS.
- P0-A Independent acceptance: UNIT TEST PASS.
- P0-B Task 1 review: APPROVE; specification PASS, quality PASS.
- P0-B Task 1 independent sandbox tests: PASS (`5` passed, `0` failed).
- P0-B Task 1 continuity validation: PASS.
- P0-B Task 2 review: APPROVE; specification PASS, quality PASS.
- P0-B Task 2 independent migration test: PASS (`1` passed, `0` failed).
- P0-B Task 2 continuity validation: PASS.
- P0-B Task 3 review: APPROVE; specification PASS, quality PASS.
- P0-B Task 3 independent package verifier test: PASS (`3` passed, `0` failed).
- P0-B Task 3 continuity validation: PASS.
- P0-B Task 4 review: APPROVE; specification PASS, quality PASS.
- P0-B Task 4 independent build verifier test: PASS (`3` passed, `0` failed).
- P0-B Task 4 continuity validation: PASS.
- P0-B Task 5 review: APPROVE; specification PASS, quality PASS.
- P0-B Task 5 independent quality policy test: PASS (`3` passed, `0` failed).
- P0-B Task 5 continuity validation: PASS.
- P0-B Unit verification: 15/15 isolated unit tests PASS, 25/25 integration suites PASS.
- P0-B Final review: APPROVE; specification PASS, quality PASS.
- P0-B Independent acceptance: UNIT TEST PASS.
- P0-C Task 1 review: APPROVE; specification PASS, quality PASS.
- P0-C Task 1 independent checkpoint test: PASS (`1` passed, `0` failed).
- P0-C Task 1 continuity validation: PASS.
- P0-C Task 2 review: APPROVE; specification PASS, quality PASS.
- P0-C Task 2 independent CAS validation test: PASS (`3` passed, `0` failed).
- P0-C Task 2 continuity validation: PASS.
- P0-C Task 3 review: APPROVE; specification PASS, quality PASS.
- P0-C Task 3 independent workflow integration test: PASS (`3` passed, `0` failed).
- P0-C Task 3 continuity validation: PASS.
- P0-C Task 4 review: APPROVE; specification PASS, quality PASS.
- P0-C Task 4 independent selective rejection test: PASS (`2` passed, `0` failed).
- P0-C Task 4 continuity validation: PASS.
- P0-C Unit verification: 9/9 isolated unit tests PASS, 25/25 integration suites PASS.
- P1-A Task 1 review: APPROVE; specification PASS, quality PASS.
- P1-A Task 1 independent migration test: PASS (`1` passed, `0` failed).
- P1-A Task 1 continuity validation: PASS.
- P0-C Final review: APPROVE; specification PASS, quality PASS.
- P0-C Independent acceptance: UNIT TEST PASS.

## Known Failures

- Current generated-project quality pipeline remains unchanged and unsafe until implementation units are completed.
- Todo artifact remains intentionally unfixed.

## Dirty Worktree

User work preserved:
- `todo.md` deleted.
- `eski-todo.md` untracked.

## Exact Next Action

Read P1-A Task 2, write the failing isolated capability registry test, and run the RED command.

## Do Not Do

- Do not edit the audited Todo artifact.
- Do not mark roadmap units complete without `status: verified` evidence.
- Do not use prior conversation as authoritative state.
- Do not silently change approved plan interfaces or dependency order.
