# Resume Visibility for Verification Failures

## Problem and cause

Quality-gate rejection persists a project as `verification_failed` and writes a chat message telling the user to resume. The resume API accepts that status, but ChatView, Header and LogsView render their resume controls only for `paused`. The UI therefore contradicts the persisted workflow state.

## Design

Create one frontend predicate for resumable, stopped project statuses: `paused` and `verification_failed`. Use it for the resume controls in ChatView, Header and LogsView. Keep `running`, `completed`, `pending_approval` and other statuses ineligible. Preserve the backend status and resume transition so quality-failure evidence is not hidden or rewritten.

The existing App `handleResume` continues to call the same API and display its existing error on rejection. ChatView may distinguish the quality-failure banner text, but the primary behavioral requirement is that its resume action appears and remains clickable.

## Verification

Component tests render real ChatView, Header and LogsView with `verification_failed`, assert the action is visible, and click it to confirm the supplied handler is invoked. Tests also cover an ineligible status. Run focused tests red/green, then the full frontend unit suite, production build and relevant backend resume tests.
