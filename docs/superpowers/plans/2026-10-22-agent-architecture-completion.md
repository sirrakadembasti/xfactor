# Agent architecture completion implementation plan

> For agentic workers: use subagent-driven-development task by task, with independent task and final review. Checkbox evidence is authoritative; an unchecked item is not complete.

**Goal:** Close the remaining audit findings, verify the original request requirement by requirement, and deliver a reviewable branch without merging or deploying.

**Architecture:** Retain the six-role workflow and independent execution worker. Enforce authority, ownership, cancellation and acceptance in backend code. Model findings are advisory; executed evidence and receipts remain mandatory.

**Tech stack:** Node.js ESM, SQLite, existing backend runner, frontend Vitest/build, execution worker native integration, Graphify.

## Global constraints

- Branch: `codex/agent-architecture-completion`, baseline `b8799ef`.
- Preserve real projects, DB, artifacts, receipts, credentials and LLM settings. No accepted hotel ZIP access or paid LLM probes.
- Preserve the user's unstaged deletion of `surec-raporu.md`; do not stage it.
- Use temporary test storage. No production restart, main merge or deployment.
- Preserve baseline audit evidence; publish current status separately with source/test links.
- Each behavioral fix requires a failing regression, implementation, passing focused tests and independent review. Do not claim skipped tests passed.

## Task 1: Source write fencing (P1)

Files: `backend/workflowAttempts.js`, `backend/engine/codeGenerator.js`, callers in `backend/engine/workflow.js`, `backend/engine/fileProtocol.js`, existing lease integration suites.

- [x] Trace every normal/repair/scaffold source writer and cancellation boundary.
- [x] Add a deterministic two-process test: A stages source, B takes/revokes lease, A attempts commit; original bytes must remain unchanged.
- [x] Couple final filesystem commit to lease ownership and cancellation serialization, with an explicit recovery/error policy. A pre-write check alone is insufficient to close cross-process TOCTOU.
- [x] Test current owner, stale owner, cancellation, takeover contention and cleanup; document crash/hostile-filesystem limits precisely.
- [x] Run focused lease/write/repair suites; independently review this change.

## Task 2: State and evidence transitions (P1)

Files: `backend/engine/workflow.js`, `backend/workflowAttempts.js`, `backend/verification/`, `backend/routes/projectRoutes.js`; state/contract/worker tests.

- [x] Map transitions from plan approval to completion, including pause/resume/restart and late provider/worker results.
- [x] Test changed contract, stale attempt, missing/empty evidence and cancellation; assert no completion or receipt is produced.
- [x] Fix any demonstrated gaps at their authoritative state/evidence writer; preserve completed historical receipts.
- [x] Record which existing tests cover unchanged guarantees and which new regressions prove fixes.

## Task 3: Qualified checkpoint identity (P2)

Files: `backend/engine/checkpointRepository.js`, `checkpointHelper.js`, `fileProtocol.js`, `workflow.js`, `backend/contracts/taskProjection.js`, impact/preview routes, migration and checkpoint tests.

- [x] Reproduce two teams with identical local IDs and byte-identical task specifications.
- [x] Use contract/domain/team/local-task identity consistently for new checkpoints and queries; provide conservative legacy lookup that cannot cross teams.
- [x] Test migration/reopen, legacy ambiguity, dependency invalidation, impact/preview and resume without rewriting historical evidence.
- [x] Independently review backward compatibility and identity propagation.

## Task 4: Nested protocol recovery (P2)

**Priority update from executed evidence:** before Task 3's identity migration, close the newly reproduced P1 protocol read/write symlink boundary. `readDurum` leaks external linked data and `writeDurum` overwrites it in isolated sentinel regressions. Harden all protocol metadata readers/writers, not only generated executable source; then implement the nested reconciliation below. This changes implementation order, not the approved scope.

Files: `backend/engine/fileProtocol.js`, actual workflow call sites, `test_p0_c_workflow_integration.js`, checkpoint/resume tests.

- [x] Reproduce stale DURUM/TODO at `manager/<domain>.director/<teamleader>/<task>`.
- [x] Pass explicit task location/identity to reconciliation; update only the matching task and its team/ancestor summaries from authoritative checkpoint validity.
- [x] Test duplicate local IDs, missing records, partial/restarted runs and parallel TODO updates.
- [x] Final review follow-up: route all reconciliation-service protocol recovery reads through the same bounded link/path boundary; prove external sentinel content cannot enter chat/task metadata.
- [x] Final review follow-up: key recovered task logs by full domain/team/task identity; preserve two teams sharing a local ID and same-node idempotence.

## Task 5: Bounded repair routing (P2)

Files: `backend/engine/workflow.js` (extract focused repair helper when needed), execution/verification failure producers, repair issue stores, `test_generation_resume.js` and worker-boundary suites.

- [x] Trace Reviewer, Tester and worker failure payloads and distinguish product failures from infrastructure failures.
- [x] Reproduce worker rejection followed by resume: responsible Coder receives real same-contract findings and changes only owned files.
- [x] Implement durable bounded routing, no blind retry for ambiguous/unowned/infrastructure failures, and no duplicate paid attempt on same inputs.
- [x] Require fresh static review and independent worker evidence after repairs. Never resolve issues merely because a patch exists.
- [x] Test exhausted budgets, unchanged patch, concurrent cancellation, contract changes and successful revalidation.

## Task 6: Observable status and instruction coverage (P2)

Files: workflow messages, frontend quality/chat views where relevant, `x-agents/`, current audit inventory and operations documentation.

- [x] Use distinct static review/runtime verification labels and real state names in chat and panel.
- [x] Assert failed verification is never presented as successful runtime testing or a different persisted state.
- [x] Complete current Markdown -> reader -> loading stage -> message role -> extent/cache/limit/fallback -> enforcement -> test inventory, including unread templates.
- [x] Check six role input/output/authority/completion, schemas/version domains, DAG/ownership, trust precedence and malformed/missing docs against actual imports/tests.

## Task 7: Performance, verification and delivery

- [x] Inspect repeated generation/repair/LLM calls; add call-count regressions for proven duplication, preserve required quality gates.
- [x] Run isolated full backend, frontend unit/build, worker unit and native real SQLite/API/Chromium fixture; explicitly record Docker/environment skips.
- [x] Regenerate Graphify, parse/validate endpoints and compare curated edges with code.
- [x] Publish current architecture/diagram, full requirement closure matrix, proven bugs versus risks versus design choices, residual operating constraints and deployment checklist.
- [x] Independent whole-branch review, fix material findings, final tests and diff checks.
- [x] Full-suite integration follow-up: update the migration-version assertion for additive migration 17; remove redundant finalization of already-finalized BLOCKED static checks without weakening immutable evidence; diagnose the backend-suite and Chromium launch timeouts before accepting full verification.
- [x] Commit task-owned files on the approved branch; deliver commit/test evidence for user review. Do not merge/deploy.

## Progress

- Branch created; initial status contains only the user's `surec-raporu.md` deletion.
- Tasks 1–2: focused suites verified; combined independent review PASS after the checkpoint contract-race follow-up. Final 148-suite backend regression also passed.
- Task 4: protocol I/O security and nested recovery verified; both independent review findings corrected with meaningful RED/GREEN, scoped re-review PASS. Final four-suite run includes 16 protocol checks and 15 symlink checks with zero skips.
- Task 3: qualified identity/migration/impact/resume verified; nine-suite focused batch and three-suite exact-version rerun passed. Both subsequent review findings fixed; three covering suites passed (9.74s), independent scoped re-review PASS.
- Task 5: 32 focused tests passed; independent reviewer reran 32/32 and proved two successive same-semantic/new-source repairs through canonical acceptance. Spec/quality PASS within the exact TypeScript product-repair scope; infrastructure/ambiguous failures stop for revision. One nonblocking infrastructure-vs-ambiguous label finding remains recorded.
- Task 6 panel: commit `05580db`, independent review PASS; full frontend 120 tests/13 files and build passed on 23 October. Current inventory, role/state/trust coverage and source anchors are complete; final branch spec/quality PASS.
- Task 7 retry bound: commit `7c4f864`, two focused suites and independent review PASS. Full backend148/148, worker155/155, native3/3 and graph checks completed; final review PASS and main completion commit `5c08264` recorded.
- 24 October: worker unit 155/155, zero skips, passed. First full backend144/147 exposed the migration assertion, static check double-finalization and a non-reproduced timeout; the corrected final148/148 passed. Native readiness initially timed out; unchanged-limit serial integration3/3 passed. Final review found two additional reconciliation gaps; both fixes passed independent four-suite rereview.

- Final verification: backend148/148 suites (595.20s), worker155/155 zero skips, frontend120/120+build unchanged, native3/3 zero skips (JS fixture explicitly skips TypeScript gate), Docker P8.3/P8.4 unavailable skips. Graph2978nodes/7687links + endpoint/curation/Chromium views verified. Independent final spec/quality PASS; main completion commit `5c08264`. Branch retained for user review; no merge/push/deploy/restart. Only the user's unstaged report deletion remains outside delivery.
