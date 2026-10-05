# Rhythm package family
- `@polyhymnia/rhythm` root is dependency-free and has no DOM, React, Web Audio or notation types/imports. Browser APIs belong only in `./browser`.
- `@polyhymnia/rhythm-react` is a thin React peer adapter and configurable presentation. Capture and scoring belong to rhythm, never duplicated in React or the consumer app.
- Consumers provide audio ports, clocks, event targets and exercise policies. No lesson IDs, routing, persistence, theme tokens or app source dependencies in packages.
- No import-time listeners, timers or audio. Attempt start/cancel/dispose must be explicit and idempotent.
- Test public contracts with a few meaningful cases; use Vitest's dot reporter. Typecheck, test and build the affected packages.
- Add changesets for releasable package changes. Never publish or push without a session instruction. Cross-repository dependencies use npm ranges, never committed local paths.
