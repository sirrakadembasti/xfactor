# Implementation Evidence Index

Evidence files are authoritative verification receipts for delivery units. A unit may be checked complete in `yol-haitasi-todo.md` only when its receipt has `status: verified`, all mandatory tasks have command/scenario evidence, independent review has no blocker, independent test reproduces acceptance, and `node scripts/validate-continuity.mjs` passes.

| Unit | Evidence | Status | Verified commit |
| --- | --- | --- | --- |
| P0-A | `P0-A.md` | pending | — |
| P0-B | `P0-B.md` | pending | — |
| P0-C | `P0-C.md` | pending | — |
| P1-A | `P1-A.md` | pending | — |
| P1-B | `P1-B.md` | pending | — |
| P1-C | `P1-C.md` | pending | — |
| P2 | `P2.md` | pending | — |
| P3 | `P3.md` | pending | — |

## Receipt Rules

- Never replace failed evidence with a success claim; append a later run.
- Record exact command/scenario, exit/status, timestamp, relevant output digest/reference, and commit.
- Agent prose is not PASS evidence.
- `implemented` is not `verified`.
- No raw secret, token, credential, or sensitive environment value may be recorded.
