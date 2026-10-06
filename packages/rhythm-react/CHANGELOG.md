# @polyhymnia/rhythm-react

## 0.3.0

### Minor Changes

- Add `useTimedAttemptController` and `useAttemptState(controller, select)`, so a screen can follow only the attempt's phase or result instead of re-rendering on every playback-clock heartbeat. `useTimedAttempt` is built from them and behaves as before.

## 0.2.1

### Patch Changes

- Updated dependencies
  - @polyhymnia/rhythm@0.3.0

## 0.2.0

### Minor Changes

- b979354: Introduce reusable rhythm plans, pulse builders, tap analysis, browser capture and React presentation.
  
  Support non-repeating integer tempo selection, simultaneous Space/pointer input with optional Space reservation on controls and recovery after focus loss, and per-event adjustments within a prepared offset range.

### Patch Changes

- Updated dependencies [b979354]
  - @polyhymnia/rhythm@0.2.0
