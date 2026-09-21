# ZIP-Only Completion UI Design

## Goal

Completed projects remain on the normal chat/quality/DAG/log views and offer the verified ZIP download; the read-only browser code editor is removed.

## Boundaries

- Remove the completed-project editor tab, view state, automatic frontend file fetch, Monaco UI, and editor-only frontend dependencies.
- Keep the server `GET /api/projects/:id/files` route for compatibility. Do not alter verification, artifact receipts, download authorization, or ZIP content.
- Preserve the existing verified-artifact requirement for Header and Sidebar ZIP actions. An unverified completed project must not gain a download button.
- Update tests and user documentation. Regenerate Graphify after removing obsolete curated editor references.

## Verification

Frontend unit tests cover the absence of the editor and the continued verified-ZIP policy. Backend suites ensure the file API and artifact behavior remain intact. A production frontend build and Graphify regeneration confirm no stale imports or graph nodes.
