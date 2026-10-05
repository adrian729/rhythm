import { expect, test, vi } from 'vitest';
import { createTimedAttempt, type ExternalInputStart, type RhythmPlaybackHandle, type RhythmPlaybackPort } from '../packages/rhythm/src/browser/index.js';
import type { TimedAttemptPlan } from '../packages/rhythm/src/index.js';
const plan: TimedAttemptPlan<null> = { durationSeconds: 1.5, stimulus: null,
  phases: [{ kind: 'countIn', startSeconds: 0, endSeconds: .5 }, { kind: 'respond', startSeconds: .5, endSeconds: 1.5 }],
  responseWindow: { startSeconds: .5, endSeconds: 1.5 },
  targets: [{ targetId: 'a', atSeconds: 1.45, associationRadiusSeconds: .1 }] };
function setup(drain: () => Promise<void>, maximumDeliveryAgeMs = 1000) {
  let now = 0, sourceStart!: ExternalInputStart;
  const port: RhythmPlaybackPort<null> = {
    clockSourcesByPreference: ['clock'], async prepare() {}, validateStimulus: () => ({ lastAudioEndSeconds: 0 }),
    playSilence: options => play(options.durationSeconds, 0), play: (_, options) => play(options.durationSeconds, options.leadSeconds),
  };
  function play(duration: number, lead: number): RhythmPlaybackHandle {
    const start = now + lead * 1000;
    return { finished: new Promise(resolve => setTimeout(() => resolve('ended'), duration * 1000 + lead * 1000)),
      clock: () => ({ performanceTimeMs: now, playbackTimeSeconds: (now - start) / 1000, sourceKey: 'clock', continuityKey: 'stable' }),
      stop() {}, onInterrupted: () => () => {} };
  }
  const controller = createTimedAttempt(port, { nowMs: () => now, timeOriginEpochMs: 0,
    scheduleTask(callback, delay) { const timer = setTimeout(callback, delay); return () => clearTimeout(timer); } }, {});
  const advance = async (ms: number) => { for (let i = 0; i < ms; i += 10) { now += Math.min(10, ms - i); await vi.advanceTimersByTimeAsync(Math.min(10, ms - i)); } };
  const start = () => controller.start(plan, { offsetMs: 0, creditRadiusSeconds: .08, inputSources: [{ id: 'microphone', offsetMs: 0,
    maximumDeliveryAgeMs, drainTimeoutMs: 1000, async prepare() {}, start(options) { sourceStart = options; return { drain, cancel() {} }; } }] });
  return { controller, advance, start, source: () => sourceStart };
}
test('eligible delayed tail detections drain once before completion; native input and generation boundaries survive', async () => {
  vi.useFakeTimers();
  try {
    let resolve!: () => void; const drained = new Promise<void>(done => { resolve = done; });
    const env = setup(() => drained), started = env.start(); await env.advance(200); await started;
    const source = env.source(), timestamp = source.eligibilityEndPerformanceMs - 50;
    await env.advance(1900); expect(env.controller.getSnapshot().phase).toBe('finalizing');
    source.emit({ generation: source.generation, eventId: 'attack', performanceTimeMs: timestamp });
    source.emit({ generation: source.generation, eventId: 'attack', performanceTimeMs: timestamp });
    source.emit({ generation: source.generation, eventId: 'tail', performanceTimeMs: source.eligibilityEndPerformanceMs + 1 });
    resolve(); await env.advance(100);
    const result = env.controller.getSnapshot(); expect(result.phase).toBe('completed'); expect(result.tapCount).toBe(1);
    expect(result.result?.onTime).toBe(1); expect(result.result?.targets[0]?.tap?.sourceId).toBe('microphone');
    const second = env.start(); await env.advance(200); await second;
    source.emit({ generation: source.generation, eventId: 'old', performanceTimeMs: timestamp });
    await env.advance(1450); env.controller.recordTap(env.source().eligibilityStartPerformanceMs + 950);
    await env.advance(1000); expect(env.controller.getSnapshot().phase).toBe('completed');
    expect(env.controller.getSnapshot().tapCount).toBe(1);
    expect(env.controller.getSnapshot().result?.onTime).toBe(1);
    expect(env.controller.getSnapshot().result?.targets[0]?.tap?.sourceId).toBeUndefined();
  } finally { vi.useRealTimers(); }
});
test('missing source drain interrupts instead of grading a partial capture', async () => {
  vi.useFakeTimers();
  try {
    const env = setup(() => new Promise(() => {})); const started = env.start(); await env.advance(200); await started;
    await env.advance(3000); expect(env.controller.getSnapshot()).toMatchObject({ phase: 'interrupted', reason: expect.stringContaining('did not finish') });
    expect(env.controller.getSnapshot().result).toBeUndefined();
  } finally { vi.useRealTimers(); }
});
