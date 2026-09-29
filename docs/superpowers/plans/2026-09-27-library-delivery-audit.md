# Library Delivery Audit Plan

> **For agentic workers:** Use the applicable audit and review parts of `subagent-driven-development`; this is a read-only assessment of XFactor code and production data, not an implementation plan.

**Goal:** Assess the `kutuphane-takip-sistemi-2` delivery with reproducible execution evidence and map defects to XFactor causes.

**Architecture:** Verify the source ZIP and its earlier receipt first. Extract only into an isolated scratch directory. Run app checks with a private SQLite database, network port, and Docker container. Record commands, outcomes, evidence, and limits in a persistent ledger and report.

**Tech Stack:** Next.js, Prisma SQLite, npm, Docker, XFactor Node backend, Graphify graph.

## Global Constraints

- Do not alter `backend/data/deliveries/kutuphane-takip-sistemi-2.zip`, its expanded sibling, receipts, `backend/data/projects.db*`, or any live service.
- Keep test writes inside the scratch directory and use a dedicated port and Docker names.
- Verify findings independently before treating them as facts.
- Do not edit XFactor implementation code in this audit.
- Use `graphify-out/graph.json` and available Graphify queries for navigation; corroborate every finding in source and execution.

---

### Task 1: Provenance and sandbox

- [x] Record ZIP SHA-256, entry listing, CRC integrity, traversal and symlink checks.
- [x] Locate the prior verified artefact and receipt; compare hashes and statuses.
- [x] Extract the ZIP into a private scratch directory; record its location and isolation rules.

### Task 2: Build and data checks

- [x] Record runtime and dependency versions, install with lockfile in scratch.
- [x] Validate Prisma schema, generate client, create private database, and run seed.
- [x] Run static checks, unit and integration tests, and production build; preserve exact failures.

### Task 3: Runtime and product checks

- [x] Build and run Docker image and record container health and logs.
- [x] Exercise HTTP/API CRUD, loan and return, validation, security boundaries, and persistence with test data.
- [x] Inspect pages, docs, and user journey against the stated contract.

### Task 4: XFactor root causes and review

- [x] Use Graphify and source reads to trace each confirmed issue to generator, template, or verifier.
- [x] Prioritize concrete changes with evidence, expected impact, and proposed acceptance checks.
- [x] Review the audit for claim/evidence alignment; publish the report without implementation edits.
