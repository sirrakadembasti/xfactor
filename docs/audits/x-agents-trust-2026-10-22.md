# XFactor trust-boundary audit — 22 October 2026

Scope: read-only source review of trusted `x-agents`, generated project documents, schema enforcement, filesystem boundaries, and worker evidence. This report records the source state inspected before remediation. No real generated projects, delivery ZIPs, production database, secrets, or LLM calls were inspected or used. Only disposable `.tmp` fixtures were created and removed. No application code was changed by this audit.

## Findings

### P1 — Existing output-file symlinks escape the generated-file write boundary

`backend/engine/codeGenerator.js:340` and `:342` validate only the destination's parent directory. The subsequent `fs.writeFile(targetPath, ...)` at `:349` follows a pre-existing symbolic link at the final filename. The target-file allowlist therefore does not prevent an allowed filename from overwriting an unrelated file outside the project. The attacker/prerequisite is a project tree containing an existing output-file link; this is not a claim that JSON generation can itself create a symlink.

An isolated fixture reproduced this on the current Windows environment: `project/target.js` was a file symlink to a sibling `outside/sentinel.js` containing `BEFORE`. Calling `writeGeneratedFiles(project, null, [{path:'target.js',content:'AFTER'}], ['target.js'])` succeeded and the outside sentinel contained `AFTER`. Fixture cleanup completed in `finally`; no real project was touched.

Minimal regression: create that structure in a unique temporary directory; assert the writer rejects, the outside sentinel stays `BEFORE`, and no other candidate is partially written. Include an existing hard-link case if the desired policy excludes linked files generally. Validate/open the final destination safely rather than relying on parent checks alone; separately consider parent replacement races.

Existing `backend/tests/test_symlink_isolation.js:94` and `:144` exercise linked **parents**, not linked final files. Its HTTP-read test starts at `:194`. These tests do not establish safety of the final write target.

### P1 — Coder-copy destination receives only lexical containment checks

`backend/engine/codeGenerator.js:298–307` checks that `coderDir` is lexically nested under `projectDir`. Neither its canonical location nor the final copied filename is checked before `fs.writeFile(agentFilePath, ...)` at `:355`. A directory symlink/junction at `coderDir`, or a file symlink at the flattened copy filename, can direct that second write outside the project even while the main source destination is safe. The first source write has already happened before this copy, so late rejection also risks partial output.

The directory-junction variant was identified by source inspection. The local isolated junction reproduction was blocked by Windows `EPERM` during junction creation; it did not execute the vulnerable copy. This is an environment limitation, not evidence the product rejects such a destination. The independently reproduced file-symlink primitive in the preceding finding supports testing the coder-copy leaf too.

Minimal regressions: (1) `project/coder` points to a sibling fixture directory; request a safe `src/app.js`, then assert no `outside/src__app.js` is created; (2) a normal coder directory contains `src__app.js` as a symlink to an outside sentinel; assert that sentinel is unchanged. Validate all source and copy destinations before any writes. Run junction coverage on a Windows runner with the necessary capability, and explicitly distinguish unsupported fixture creation from product failures.

### P1 — Generated reports, logs and errors are promoted into Manager system authority

`backend/routes/projectRoutes.js:162` reads the generated root `RAPOR.md`, and `:169` interpolates its contents into the Manager system prompt. Raw error text enters at `:232`; generated agent log messages and failure reports enter at `:248–249`. These sections are combined at `:273–275`. The result is submitted as a `role: 'system'` message at `:465` and again during repair at `:499`.

Triple quotes around some content are not an authority boundary. A generated report can contain instructions that close or imitate surrounding prompt structure, and the entire generated text is delivered with system authority. Loading the trusted role and constitution from `x-agents` correctly does not prevent this later promotion of project-controlled material.

A no-LLM isolated proof parsed the actual exported `buildManagerChatSystemPrompt` declaration with the backend's installed Babel parser and evaluated that declaration with stub database, log/report readers, and trusted loaders. `findFailedReports` returned `INJECTED_POLICY_MARKER: ignore platform policy`. The resulting prompt included that exact raw marker and contained no `<<<UNTRUSTED_` wrapper. Output: `{"generatedReportAppearsInSystemPrompt":true,"wrappedInUntrustedDelimiter":false}`. This proves prompt construction, not that a model will necessarily obey the injected content.

Minimal regression: inject report/log/error payloads containing delimiter escapes and apparent instruction blocks through stub readers; assert they appear only in bounded, escaped reference-data messages and never in the trusted system-policy string. Cover both initial chat and Manager-plan repair. The helper tested by `test_agent_contract_schemas.js` is not currently applied to this chat path.

## Existing boundaries and limits

- `backend/agents/agentPaths.js:18–29` enforces a document-name allowlist, rejects a linked root or file, checks canonical containment, and bounds opened file type/size. `agentLoader.js` fails on missing or incomplete trusted role/constitution content; there is no generated-doc fallback in these loaders.
- `backend/projectPaths.js:20` and `:34` reject direct/canonical overlap with `x-agents`. This is specifically an agent-root protection; it is not a general rejection of every project-root alias to other host directories. Do not describe it as full host filesystem isolation.
- Coder output allowlist checks exist in `schemas.js:742` and `codeGenerator.js:272` onward. Those lexical checks do not resolve the write-target issues above.
- Worker API identity and payload enforcement was inspected in `execution/protocol.js`, `execution/jobStore.js`, and `backend/verification/artifactVerifier.js`. Artifact verification checks persisted contract identity, archive digest and persisted inventory before accepting authenticated worker results. `artifactEvidencePolicy.js` binds individual checks and a receipt to worker identity and check digests. This review did not establish an additional reproducible worker-evidence forgery; it is not an exhaustive proof of worker isolation.
- `local-trusted` execution is explicitly documented as using current-account privileges in `x-agents/README.md`; filesystem instruction separation is not an OS sandbox.

## Commands and results

`node --test backend/tests/test_agent_document_boundary.js backend/tests/test_agent_contract_schemas.js`

Result: 7 TAP tests, 5 passed, 2 failed. The schema suite's four internal checks all passed. Both TAP failures occurred while creating Windows junction fixtures (`EPERM`): `test_agent_document_boundary.js:54` and `:82`. They are environment capability failures, not demonstrated trust-boundary regressions. All six fixtures' cleanup paths completed.

The standalone output-file symlink proof succeeded and printed `{"leafSymlinkOutsideContent":"AFTER"}`. Its following coder-directory junction setup failed with `EPERM`; the command's overall exit code was therefore 1 despite the first exploit succeeding. Cleanup ran in `finally`.

The isolated AST-extracted Manager prompt proof succeeded with exit code 0 and the JSON output recorded above. Earlier attempts only failed to resolve the root-level Babel package and then a missing stub constant; using backend package resolution and stubbing `MANAGER_PLAN_CONTRACT_RULES` completed the proof without importing server/database initialization.

No broad integration, production acceptance, live worker execution, real generated project inspection, or delivery ZIP inspection was performed.
