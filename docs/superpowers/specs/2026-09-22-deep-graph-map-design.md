# Deep source map design

## Goal

Regenerate the visual map from the current repository with file and symbol detail, while keeping the overview usable. The existing curated architectural links remain contextual annotations; source-derived links are identified separately.

## Source model

- Scan the existing backend, frontend, execution, e2e, scripts, and docs roots; ignore generated and dependency directories.
- Keep one node per file. For JavaScript and TypeScript, add nodes for named functions, classes, methods, and meaningful anonymous functions bound to variables or object properties. Each symbol records file and line.
- Derive local and package imports, static calls that can be resolved to a symbol in the same file or a locally imported module, dynamic imports with literal paths, server HTTP route registrations, static client requests, and environment variable names. Unknown/dynamic call targets remain unresolved rather than invented. Environment variable values are never recorded.
- Add containment edges from files to symbols. Curated relationships keep their existing labels and provenance. Every generated edge has source location/provenance where known.
- Source extraction is deterministic. Missing curated files or dangling edges fail generation.

## Visual model

The initial view shows file nodes and file-level relationships. Users can search/filter, select a file, and reveal its symbol-level neighborhood. A separate hierarchical tree is generated from the actual scanned file paths, not a hard-coded list. The report gives counts by kind and states static-analysis limits.

## Verification

Use fixture-based extraction tests for definitions, calls, imports, HTTP routes, and false-positive boundaries. Run the generator, inspect graph invariants and representative real application paths, then run relevant tests. Generated artifacts should be reproducible from source without incremental manifest state.
