# Baseline Fix Report

## RED

Command:

```text
node backend/tests/test_manager_error_telemetry.js
```

Result (before the fix): exit code `1`.

```text
[PASS] 1. buildManagerChatSystemPrompt includes workflow attempt error and anti-hallucination mandate
[PASS] 2. buildManagerChatSystemPrompt falls back to state.last_error if workflow attempt has no error
[FAIL] 3. POST /api/projects/:id/chat updates state.remediation when project is paused and user provides remediation instruction: Returned state should contain remediation property
[PASS] 4. buildManagerChatSystemPrompt strips hex reference strings from error telemetry
[PASS] 5. In paused and verification_failed states, a plan ready response transitions to pending_approval
[PASS] 6. Host dependency preparation fallback successfully recovers when worker is unavailable

==========================================
🎉 Testler Tamamlandı: 5 BAŞARILI, 1 HATALI
==========================================

Wall time: 7.65 seconds
```

## Fix

In `backend/routes/projectRoutes.js`, remediation keywords and intent are computed before plan-ready handling. A paused project with remediation intent is excluded from the pending-approval transition, then its remediation payload is persisted with `ready`, `instruction`, and `timestamp`. Explicit plan/start messages retain the existing plan-ready transition behavior.

## GREEN

Command:

```text
node backend/tests/test_manager_error_telemetry.js
```

Result (after the fix): exit code `0`.

```text
[PASS] 1. buildManagerChatSystemPrompt includes workflow attempt error and anti-hallucination mandate
[PASS] 2. buildManagerChatSystemPrompt falls back to state.last_error if workflow attempt has no error
[PASS] 3. POST /api/projects/:id/chat updates state.remediation when project is paused and user provides remediation instruction
[PASS] 4. buildManagerChatSystemPrompt strips hex reference strings from error telemetry
[PASS] 5. In paused and verification_failed states, a plan ready response transitions to pending_approval
[PASS] 6. Host dependency preparation fallback successfully recovers when worker is unavailable

==========================================
🎉 Testler Tamamlandı: 6 BAŞARILI, 0 HATALI
==========================================

Wall time: 7.51 seconds
```

## Commit

Commit message: `fix(chat): prioritize remediation instructions for paused projects`
