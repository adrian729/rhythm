# @polyhymnia/rhythm

The dependency-free root supports regular pulses and arbitrary ordered target times:

```ts
import { buildPulsePlan, analyzeTiming, timingAccuracy } from '@polyhymnia/rhythm';
const plan = buildPulsePlan({ pulseBpm: 90, beatsPerBar: 4, responseBars: 4 });
const result = analyzeTiming(plan, capturedTaps, 0.08);
const accuracy = timingAccuracy(result); // Optional policy, no imposed pass rule.
```

Targets have unique IDs and inclusive, disjoint association windows. Eligibility is `[min(responseStart, firstTarget - radius), responseEnd)`. Each window chooses the closest tap; ties use capture sequence. Unused eligible taps are extras. Tolerance earns credit within a capped window, independently of association. Targets never move to fit input. Results expose signed error, absolute error and drift. `estimateAdjustment` accepts reliability gates and never applies or saves a recommendation.

`selectPulseBpm(min, max, previous?, random?)` selects an integer tempo without consecutive repeats; equal bounds produce a fixed tempo. The pulse builder separates sound cues, targets, phases and beat grid. BPM counts the configured main pulse. It supports target masks, displaced cues and subdivisions, without instruments or lesson IDs.

## Browser entry

```ts
import { createTimedAttempt, bindTapInput } from '@polyhymnia/rhythm/browser';
const attempt = createTimedAttempt(myAudioPort);
const unbind = bindTapInput({ keyboardTarget: window, pointerTarget: tapPad,
  method: 'both', isActive: attempt.isCapturing,
  onTap: (timestamp, method) => attempt.recordAdjustedTap(timestamp, offsets[method]) });
await attempt.start(plan, { offsetMs: offsets.keyboard,
  offsetRangeMs: [Math.min(offsets.keyboard, offsets.pointer), Math.max(offsets.keyboard, offsets.pointer)],
  creditRadiusSeconds: 0.08 });
// Subscribe to getSnapshot(): completed contains analysis, interrupted no result.
// Later: unbind(); attempt.dispose();
```

`RhythmPlaybackPort<Stimulus>` prepares under the caller's gesture, validates last audio end, plays opaque stimuli and plays explicit clock-bearing silence. Handles supply an ended/stopped/blocked promise, exact-source snapshots, interruption subscription and idempotent stop. Their clocks remain usable after natural end until stop/replacement; stopping an old handle cannot affect a newer one.

Snapshots pair signed playback seconds relative to the scheduled start with milliseconds on the runtime's performance origin. They already include output-delay estimation. Sources are backend-owned and ordered by preference, then locked after at least 100 ms of warm-up and two advancing, continuous pairs from the preferred available source. A newly available preferred source gets its second pair before a fallback is selected. Exact requests cannot fall back. Opaque `continuityKey` changes with route or latency configuration; changed, invalid or stale clocks interrupt grading.

`bindTapInput` supports keyboard, pointer or both simultaneously and reports the input method. Space prevents scrolling, ignores held repeats, and accepts a missing physical key code. Editable fields stay editable. By default buttons/links keep their native activation; `captureFromControls: true` reserves Space for tapping there too (Enter still activates buttons). Pointer capture accepts the primary mouse/touch contact.

`recordTap(timestamp)` uses the default adjustment and can be passed directly as a timestamp callback. `recordAdjustedTap(timestamp, offsetMs)` applies a per-event adjustment within the frozen `offsetRangeMs`; capture bounds and the audio tail cover the whole range. Omit the range for a single fixed adjustment.

One injectable runtime supplies monotonic milliseconds, epoch origin and cancellable tasks. Input uses native timestamps, normalizing clearly identifiable legacy epoch values; it never substitutes delivery time. The user offset is subtracted once. The host must supply sufficient count-in for raw eligibility; the controller rejects insufficient lead rather than modifying stimuli.

Defaults: 1 s total preparation budget, 80 ms lead, 50 ms heartbeat, 250 ms delivery grace. Runtime duration pads for corrected/raw bounds and final sound. Completion requires natural end, locked output time and elapsed delivery grace. Late eligible events, a closing heartbeat stall, hidden tab, window blur or backend interruption yield an ungraded interrupted attempt. These bounds do not measure physical-device latency and are configurable.

Capture is independent of React and animation frames. Cancel before navigation and dispose unused controllers. Use immutable plans and frozen settings during an attempt. Other exercises can supply listen/response phases and different audio backends.
