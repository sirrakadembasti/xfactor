# LLM management plugin and Manager reliability

User authorizes full diagnosis, fixes, robust UI and reusable delivery at
`F:/projeler/llm-yonetimi`. Build the tracked distributable in `llm-yonetimi/` first,
then deliver only source/docs/lockfile/tests, never user secrets or node_modules.

1. Characterize current Manager failures, timeouts, empty responses and MiMo
   thinking behavior with isolated tests and controlled provider probes.
2. Extract profile store, safe provider transport, key setup and page into a
   self-contained npm package; preserve existing host profile/key paths via shims.
3. Validate bounded timeout/token/thinking options, redact structured failures,
   retain probe durations/error codes and distinguish quick vs conversation tests.
4. Strengthen UI request cancellation, busy guards, edit/reset state, safe error
   display and runtime controls. Keep existing providers/models/manual endpoints.
5. Integrate host Manager runtime controls and readable failure reporting; do not
   silently switch provider/model or reduce code-generation reasoning quality.
6. Test package independently and host regressions; verify real provider latency,
   update setup/Docker/Graphify/README/guide and review changes independently.
7. Deliver sibling plugin with README integration/auth/CSRF/backup instructions.

External constraints: provider load, quota/rate limits, DNS and internet latency
cannot be guaranteed by the application. Report measured outcomes, not universal
success. A successful probe never authorizes an artifact or changes project state.
