# Rhythm

Reusable music timing capabilities, separate from the ear-training app:

- `@polyhymnia/rhythm`: dependency-free plans, bounded tempo selection, pulse cues, tap matching, diagnostics and explicit accuracy/adjustment policies.
- `@polyhymnia/rhythm/browser`: a framework-independent attempt controller and timestamped input binding, behind neutral audio/runtime ports.
- `@polyhymnia/rhythm-react`: a React peer hook and host-styled beat guide/timing plot.

The host owns lessons, settings, pass thresholds and persistence. The browser controller finalizes without animation frames; audio scheduling belongs to its backend. No import starts audio, listeners or tasks.

Run `pnpm install`, `pnpm build`, `pnpm typecheck`, `pnpm test`. Build before locally linking into a consumer. Changesets record releasable package work; the packages are published to npm. Package READMEs document the public contracts. `pnpm smoke` checks packed Node and React consumers; `examples/vanilla.ts` demonstrates the neutral browser port.

## Optional external timed input

`AttemptOptions.inputSources` accepts neutral `ExternalInputSource`s from `@polyhymnia/rhythm/browser`. A source declares an ID, frozen fixed offset, maximum event-delivery age and bounded drain timeout. Permission/activation belongs to the host before the attempt; source preparation belongs to the existing readiness budget. Include every source offset in `offsetRangeMs`.

`start` receives attempt generation, source-adjusted eligibility boundaries in monotonic performance time, an event callback and an interruption callback. Emit original event timestamps with unique IDs and the current generation. The controller excludes out-of-window and old-generation events, ignores repeated event IDs, and preserves `sourceId` on captured taps. Detector delivery age does not relax native event age or playback-clock freshness. Source policy limits are validated, and sources remain optional.

At eligibility closure the controller calls every handle's `drain()`. The concrete source must stop admitting new eligible events, process any confirmation tail and deliver all eligible events before resolving. Completion waits for playback, the native delivery grace and all source acknowledgements. A missing/failed drain interrupts instead of grading partial input. `cancel()` must release active source work; capture/DSP implementations stay in the consumer, with no dependency added to rhythm.
