# Deep Source Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a current, source-derived file and symbol map with usable visual navigation.

**Architecture:** Extend the AST extractor with source facts, merge them with curated architectural annotations, then render file and detail views from the same JSON. Generate the hierarchy from scanned paths.

**Tech Stack:** Node.js 22, `@babel/parser`, D3, built-in Node test/assert.

## Global Constraints

- Preserve existing `nodes` and `links` JSON consumers.
- Static edges must not imply execution at runtime.
- Build from current source on each run; no manifest dependency.

---

### Task 1: Extract source details

**Files:** `backend/scripts/graphSource.js`, `backend/tests/test_graphify.js`

- [x] Add a fixture test for symbol containment, local cross-file calls, imports, and route registrations; run it and observe the missing relations.
- [x] Implement AST extraction and run the test green.
- [x] Add boundary fixtures for dynamic/ambiguous targets and verify no false resolved call edge appears.

### Task 2: Merge and render

**Files:** `backend/scripts/generate_graph.js`, `backend/tests/test_graphify.js`

- [x] Test that a regenerated graph preserves curated nodes while including source symbols and no dangling links.
- [x] Merge source nodes and edges, attach provenance, and report counts.
- [x] Add search, file overview, and symbol detail controls to the HTML visualization.
- [x] Generate the tree from scanned file paths.

### Task 3: Regenerate and verify

**Files:** `graphify-out/graph.json`, `graphify-out/graph.html`, `graphify-out/GRAPH_TREE.html`, `graphify-out/GRAPH_REPORT.md`

- [x] Run extraction tests and `npm run graph`.
- [x] Validate graph invariants and representative application flows using the generated JSON.
- [x] Check the rendered HTML and final diff; document static-analysis limits in the report.
