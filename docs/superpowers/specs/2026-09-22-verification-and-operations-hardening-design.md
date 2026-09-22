# Verification and Operations Hardening Design

## Goal

Close the confirmed verification, recovery, authorization, readiness, and source-map gaps without changing the existing default administrator account behavior.

## Scope and order

The work proceeds in this order, with a separate red-green test cycle for every item:

1. Fail closed when the execution worker cannot verify an artifact.
2. Stop disk recovery from manufacturing verified artifacts and passing checks.
3. Restrict global disk synchronization to administrators.
4. Report the service as unready when execution capacity is unavailable.
5. Correct Graphify request-path parsing and include execution-worker HTTP routes.

The `admin / xfactor` creation and login behavior is explicitly outside this work and must remain unchanged.

## 1. Authoritative artifact verification

The normal project workflow may mark an artifact `verified` and complete a project only after the execution worker returns a successful verification result whose persisted evidence passes `assertVerifiedArtifactEvidence`.

`runProjectVerification` must not invoke the development verifier when called by the production workflow. A worker connection error, timeout, protocol error, or verifier exception remains a verification failure and must not produce PASS checks or a completed project. The development verifier may remain available as an explicitly called test or development utility, but it is not a fallback for the normal workflow.

Existing behavior for a worker result that explicitly rejects an artifact remains fail closed.

## 2. Disk recovery trust boundary

`DURUM.md` or `state.json` may restore historical project state, plan, chat, and logs. These files are not verification evidence.

When a recovered project says it is completed and has no artifact, recovery may build a ZIP so the files are represented in the database. The resulting artifact remains `built` and has no verification run linkage. Recovery must not insert a `verified` run, synthetic PASS checks, executable evidence, or requirement-check links.

The UI and API must therefore expose no `latestArtifact` with status `verified` until the normal worker-backed verification path succeeds. The strict download endpoint continues to reject recovered, unverified artifacts.

## 3. Global synchronization authorization

`POST /api/projects/sync` scans and mutates the shared project root, so it is an administrator operation. An authenticated administrator receives the current synchronization result. An authenticated non-administrator receives HTTP 403 before disk reconciliation starts. Unauthenticated requests remain rejected by the existing authentication middleware.

Project-scoped routes and ordinary project listing retain their current ownership and role rules.

## 4. Readiness semantics

`GET /readyz` represents whether this instance can accept the full application workload. If the execution worker cannot be reached, reports no execution capacity, or lacks either `prepare_dependencies` or `verify_artifact`, the endpoint returns HTTP 503 with `status: "not_ready"` and `executionCapacity: "unavailable"`.

Database, filesystem, frontend, and worker success returns HTTP 200 with `status: "ready"`. Liveness at `GET /healthz` is unchanged.

## 5. Graphify coverage

For template-string client requests, parsing stops the route path at the first literal or dynamic query-string boundary. The frontend verification-runs request must resolve to `GET /projects/:id/verification-runs` rather than a path ending in `:value`.

The source extractor also recognizes literal method and pathname comparisons in the raw Node HTTP server used by `execution/server.js`. It emits worker `HttpRoute` nodes for the capabilities/readiness and job endpoints without treating arbitrary conditionals as routes. Generated route nodes keep source-file and line provenance and participate in the same request-to-route matching as Express routes.

## Testing strategy

Each correction starts with a focused regression test that fails for the confirmed defect:

- a worker exception cannot complete or verify a project;
- completed disk recovery creates no verified run or PASS checks;
- a non-admin sync request returns 403 and does not call reconciliation;
- unavailable or insufficient worker capabilities make readiness return 503;
- Graphify normalizes the dynamic query path and extracts representative raw-worker routes.

After each test turns green, its nearby existing suites run before work begins on the next item. Final verification runs the complete backend test runner, frontend unit tests, frontend production build, Graphify generation/test, and repository diff checks. Generated Graphify artifacts are regenerated only after the extractor tests pass.

## Compatibility and migration

No schema migration is required. Existing synthetic verification rows are not silently deleted during this change; the strict evidence check continues to prevent incomplete recovered runs from authorizing downloads. Newly recovered projects no longer create such rows.

Operational deployments must treat `/readyz` as the traffic-readiness endpoint and `/healthz` as process liveness. This matches the existing split between the web orchestrator and execution worker.
