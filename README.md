# Rhythm

Reusable music timing capabilities, separate from the ear-training app:

- `@polyhymnia/rhythm`: dependency-free plans, bounded tempo selection, pulse cues, tap matching, diagnostics and explicit accuracy/adjustment policies.
- `@polyhymnia/rhythm/browser`: a framework-independent attempt controller and timestamped input binding, behind neutral audio/runtime ports.
- `@polyhymnia/rhythm-react`: a React peer hook and host-styled beat guide/timing plot.

The host owns lessons, settings, pass thresholds and persistence. The browser controller finalizes without animation frames; audio scheduling belongs to its backend. No import starts audio, listeners or tasks.

Run `pnpm install`, `pnpm build`, `pnpm typecheck`, `pnpm test`. Build before locally linking into a consumer. Changesets record releasable package work; the packages are published to npm. Package READMEs document the public contracts. `pnpm smoke` checks packed Node and React consumers; `examples/vanilla.ts` demonstrates the neutral browser port.
