# Agent architecture audit and remediation plan

> Execute targeted, regression-tested changes in this chat. Independent research uses coordinated subagents; production files have explicit owners.

**Goal:** Establish the actual x-agents/backend contract, correct demonstrated security and coordination failures, and preserve independent runtime evidence.

**Architecture:** Retain the six-role orchestrator and separate execution worker. Treat Markdown as trusted policy only through the fixed loader; generated files, reports, errors and model responses remain data. Filesystem and state guarantees belong in code.

**Constraints:** Preserve real projects, artifacts, receipts, admin credentials and LLM configuration. No paid LLM probes, hotel ZIP access, production restarts, destructive maintenance, or staging the user's `surec-raporu.md` deletion. Tests use temporary storage roots.

## Initial evidence and deliverables

- [x] Local HEAD and origin/main both `4273484aba356d28ea1ce3080b71f2c26eeee7d2`; only preexisting change is deleted `surec-raporu.md`.
- [x] HTTP frontend 200, backend healthz 200 and readyz 200; unauthenticated worker 401. No service restart.
- [x] Trace constitution loading: `projectRoutes.buildManagerChatSystemPrompt` → `loadOrkestrasyonTalimatnamesi` → `readAgentDocument`; chat truncates at 3000 characters, production prompts contain role documents only.
- [x] Publish Markdown inventory, workflow contracts and trust-boundary reports under `docs/audits/` before implementation.
- [x] Publish consolidated findings, diagram, prioritized implementation and verification status.

## Prioritized targeted changes

1. **P1 filesystem boundary:** `engine/codeGenerator.js` follows existing leaf symlinks and does not resolve coder copy destinations. Add isolated external-sentinel regression tests; reject linked destinations before any content write, validate both copies, use safe replacement or no-follow semantics. Preserve normal writes/allowlists/quotas. Owner: trust investigator after report.
2. **P1 prompt authority:** `routes/projectRoutes.js` embeds generated RAPOR, logs, titles, summaries and errors in a system message. Keep trusted policy in system; deliver bounded, labeled runtime context as lower-priority data in initial and repair calls. Regression must inspect real assembled messages without an LLM. Owner: root.
3. **P2 coordination:** `fileProtocol.checkTodoItem` loses concurrent read/modify/write updates. Serialize updates per canonical TODO path and verify parallel completions plus failure recovery. Owner: workflow investigator after report.
4. **P2 file ownership:** `schemas.validateTaskDependencies` misses Windows case aliases and rejects transitive ordered writers. Verify both independently and preserve rejection for unordered competing writers. Owner: workflow investigator.
5. **P2 instruction consistency:** Compose complete constitution and role instructions through one explicit loader contract; remove obsolete master clauses before propagation, establish code/schema precedence, accurately label human-only templates. Assert complete content reaches every role and chat rather than prompt length. Owner: root.

## Follow-up evidence assessed and implemented

- Tester veto/resume: reproduced and repaired with a durable bounded advisory route; unambiguous current-contract targets only; fresh acceptance required. Pause after provider return is rejected before file commit and the lease is reasserted.
- Requirement impact persistence: proven missing production writer; implemented transactional approved-contract projection and real-workflow linkage regression. Impact/preview translate namespaced IDs back to execution ID + task specification hash.
- Unknown requirement IDs: proved direct and parser-chain bypass, removed automatic production synthesis; explicit legacy opt-in remains available outside approved-scope use.

## Verification and delivery

- [x] Record failing regression outputs before each fix and rerun the same tests afterward.
- [x] Run backend inventory runner (isolated database/projects/artifacts), frontend unit tests and build, execution worker tests; identify skips or environment blockers accurately.
- [x] Regenerate Graphify using `npm run graph`, validate graph tests, and explain static/manual edges.
- [x] Request independent diff review, resolve substantive findings, check staged files and `git diff --check`.
- Delivery: commit only task-owned files, push main as requested and verify the remote SHA; the final chat records the resulting commit. Remaining uncertainty is documented rather than claiming LLM-generated products work.

Final verification: backend 146/146 suites; frontend 118 tests and build; worker 155 unit tests; native SQLite/API/Chromium fixture 3 tests; all passed. P8.3/P8.4 Docker checks skipped explicitly. Graph: 462 files / 2836 nodes / 7208 edges, validated. Independent review fixes include mock role routing, strict parser scope, report ancestry, checkpoint identity, repair budgets and late-response cancellation.
