# Repository cleanup and behavior-preserving refactor

Scope: audit README, user guide, generated Graphify map, Git references and actual
entrypoints before removing files. An isolated node in the graph is not proof of
dead code: CLI, Docker, HTML, test runner and dynamic imports must be checked.

1. Remove unused frontend `file-saver` dependency and regenerate its lockfile.
2. Remove retired `scripts/validate-continuity.mjs`: no callers, required ledger
   files absent; read-only execution fails with ENOENT.
3. Remove `backend/scripts/complete_stok_takip.js`: no callers, hardcoded historical
   project, direct database status mutation bypasses normal application workflow.
4. Archive nine untracked `_tmp_library_*.mjs` experiments with SHA-256 recovery
   manifest before removing their root copies. Preserve application databases,
   generated projects, active worktrees and installed development tools.
5. Test and extract frontend project-log merging and backend project-file reading.
   Keep authentication, response shape, filtering and worker entrypoints unchanged.
   Enforce the existing 20 MiB response budget without overshooting it.
6. Run frontend tests/build, backend file-reading/security and integration tests;
   regenerate Graphify, record audit results and review the final diff.

Preserve operational CLI scripts, standalone production pipeline tests, historical
documentation and optional Python Graphify metadata: lack of an import does not
establish lack of a purpose. Default admin credentials are outside this scope.

Completed: all six steps. Evidence and preserved-file classifications are recorded
in `docs/REPOSITORY-CLEANUP.md`. Frontend: 75 tests and production build passed;
backend: 16 distinct selected suites passed; independent review found no issues.
