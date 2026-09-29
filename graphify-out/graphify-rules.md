## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `npm run graph` from the repository root to regenerate this repository's `graph.json`, `graph.html`, `GRAPH_TREE.html`, and `GRAPH_REPORT.md` from source (AST-only, no API cost). The Python `graphify update .` command maintains a separate cache and does not regenerate these four visual outputs.
