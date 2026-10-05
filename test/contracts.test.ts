import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyzeTiming, buildPulsePlan, captureBounds, estimateAdjustment, timingAccuracy, selectPulseBpm } from '../packages/rhythm/src/index.js';
import { bindTapInput, createTimedAttempt, type AttemptRuntime, type RhythmPlaybackHandle, type RhythmPlaybackPort } from '../packages/rhythm/src/browser/index.js';

describe('public timing contracts', () => {
  it('selects bounded tempos without consecutive repeats and supports a fixed tempo', () => {
    expect(selectPulseBpm(70, 100, 70, () => 0)).toBe(71);
    expect(selectPulseBpm(70, 100, 100, () => 0.999)).toBe(99);
    expect(selectPulseBpm(90, 90, 90)).toBe(90);
    expect(() => selectPulseBpm(100, 70)).toThrow(RangeError);
  });

  it('captures Space and pointer together, prevents scrolling, ignores held keys and releases listeners', () => {
    const keyboard = new EventTarget();
    const captures: string[] = [];
    const pointer = Object.assign(new EventTarget(), { focus: vi.fn() }) as unknown as HTMLElement;
    const event = (type: string, properties: object = {}) => Object.assign(new Event(type, { cancelable: true }),
      { key: ' ', code: '', ...properties });
    const unbind = bindTapInput({ keyboardTarget: keyboard, pointerTarget: pointer, method: 'both', captureFromControls: true, isActive: () => true, onTap: (_timestamp, method) => captures.push(method) });
    const space = event('keydown');
    Object.defineProperty(space, 'target', { value: { closest: (selector: string) => selector === 'button,a' ? {} : null } });
    keyboard.dispatchEvent(space);
    expect(space.defaultPrevented).toBe(true);
    keyboard.dispatchEvent(event('keydown', { repeat: true }));
    keyboard.dispatchEvent(event('keyup'));
    keyboard.dispatchEvent(event('keydown', { code: 'Space' }));
    pointer.dispatchEvent(Object.assign(new Event('pointerdown', { cancelable: true }), { isPrimary: true, button: 0 }));
    expect(captures).toEqual(['keyboard', 'keyboard', 'pointer']);
    unbind();
    keyboard.dispatchEvent(event('keyup'));
    keyboard.dispatchEvent(event('keydown'));
    pointer.dispatchEvent(Object.assign(new Event('pointerdown'), { isPrimary: true, button: 0 }));
    expect(captures).toHaveLength(3);
  });

  it('accepts a fresh Space press after focus loss hides the previous key release', () => {
    const keyboard = new EventTarget();
    const onTap = vi.fn();
    const unbind = bindTapInput({ keyboardTarget: keyboard, method: 'keyboard', isActive: () => true, onTap });
    const press = () => keyboard.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { code: 'Space' }));
    press();
    keyboard.dispatchEvent(new Event('blur'));
    press();
    expect(onTap).toHaveBeenCalledTimes(2);
    unbind();
    keyboard.dispatchEvent(new Event('blur'));
    press();
    expect(onTap).toHaveBeenCalledTimes(2);
  });

  it('keeps sparse association windows on the underlying pulse and counts duplicates without shifting the grid', () => {
    const plan = buildPulsePlan({ pulseBpm: 120, beatsPerBar: 4, responseBars: 1, targetBeats: [1, 3] });
    const result = analyzeTiming(plan, [
      { atSeconds: 1.98, sequence: 0 }, { atSeconds: 2.02, sequence: 1 },
      { atSeconds: 2.5, sequence: 2 }, { atSeconds: 3.2, sequence: 3 },
      { atSeconds: 4, sequence: 4 },
    ], 0.06);
    expect(result.targets[0]?.tap?.sequence).toBe(0);
    expect(result.targets.map(t => t.status)).toEqual(['onTime', 'late']);
    expect(result.extras.map(t => t.sequence)).toEqual([1, 2]);
    expect(timingAccuracy(result)).toBe(25);
    expect(plan.targets[1]?.associationRadiusSeconds).toBeCloseTo(0.225);
    expect(captureBounds(plan, 250, 0.25, 3.535)).toMatchObject({ rawEnd: 4.25, runtimeDuration: 4.5 });
  });

  it('separates compound pulse targets from subdivisions and declines inconsistent adjustment rounds', () => {
    const plan = buildPulsePlan({ pulseBpm: 90, beatsPerBar: 2, responseBars: 2,
      countInSubdivisions: 3, responseSubdivisions: 3 });
    expect(plan.targets).toHaveLength(4);
    expect(plan.stimulus.filter(c => c.level === 'subdivision')).toHaveLength(12);
    const round = (error: number) => analyzeTiming(plan, plan.targets.map((t, sequence) => ({ atSeconds: t.atSeconds + error, sequence })), 0.05);
    const gates = { minimumMatches: 4, maximumRoundDifferenceMs: 30, maximumMadMs: 20, maximumOffsetMs: 250 };
    expect(estimateAdjustment([round(0.08), round(0.09)], gates).suggestedOffsetMs).toBeCloseTo(85);
    expect(estimateAdjustment([round(0.08), round(-0.09)], gates).stable).toBe(false);
  });
});

function harness() {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  let continuity = 'device-one';
  let pendingPrepare = false;
  const runtime: AttemptRuntime = { nowMs: () => Date.now(), timeOriginEpochMs: 0,
    scheduleTask(callback, delay) { const id = setTimeout(callback, delay); return () => clearTimeout(id); } };
  const play = ({ durationSeconds, leadSeconds }: { durationSeconds: number; leadSeconds: number }): RhythmPlaybackHandle => {
    const start = Date.now() + leadSeconds * 1000;
    let resolve!: (value: 'ended' | 'stopped') => void;
    let stopped = false;
    const finished = new Promise<'ended' | 'stopped'>(r => { resolve = r; });
    const id = setTimeout(() => resolve('ended'), durationSeconds * 1000 + leadSeconds * 1000);
    return { finished, clock: source => stopped ? undefined : { sourceKey: source, continuityKey: continuity,
      performanceTimeMs: Date.now(), playbackTimeSeconds: (Date.now() - start) / 1000 },
      onInterrupted: () => () => {}, stop() { stopped = true; clearTimeout(id); resolve('stopped'); } };
  };
  const port: RhythmPlaybackPort<readonly unknown[]> = {
    clockSourcesByPreference: ['test-clock'],
    prepare: () => pendingPrepare ? new Promise(() => {}) : Promise.resolve(),
    validateStimulus: () => ({ lastAudioEndSeconds: 0 }),
    playSilence: play, play: (_stimulus, options) => play(options),
  };
  const controller = createTimedAttempt(port, runtime, {});
  const plan = buildPulsePlan({ pulseBpm: 120, beatsPerBar: 2, responseBars: 1 });
  return { controller, plan, changeDevice: () => { continuity = 'device-two'; },
    blockPrepare: () => { pendingPrepare = true; },
    allowPrepare: () => { pendingPrepare = false; },
    async start(offsetMs = 0, offsetRangeMs?: readonly [number, number]) {
      const before = Date.now();
      const start = controller.start(plan, { offsetMs, offsetRangeMs, creditRadiusSeconds: 0.05 });
      await vi.advanceTimersByTimeAsync(110);
      await start;
      return before + 180; // Warm-up: 100 ms, then 80 ms playback lead.
    } };
}
afterEach(() => vi.useRealTimers());

describe('headless capture lifecycle', () => {
  it('lets output timing initialize before locking the attempt clock', async () => {
    const h = harness();
    setTimeout(h.changeDevice, 50);
    await h.start();
    await vi.advanceTimersByTimeAsync(2500);
    expect(h.controller.getSnapshot().phase).toBe('completed');
    h.controller.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('completes without frames with independent input offsets and bounded delayed delivery', async () => {
    const h = harness();
    const origin = await h.start(0, [-200, 250]);
    for (const [index, target] of h.plan.targets.entries()) {
      const offset = index === 0 ? -200 : 250;
      const timestamp = origin + target.atSeconds * 1000 + offset;
      await vi.advanceTimersByTimeAsync(timestamp + 100 - Date.now());
      h.controller.recordAdjustedTap(timestamp, offset);
    }
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.controller.getSnapshot().phase).toBe('completed');
    expect(h.controller.getSnapshot().result?.onTime).toBe(2);
    h.controller.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['device', 'delayed-input', 'closing-stall'] as const)('interrupts %s without a graded result', async cause => {
    const h = harness();
    const origin = await h.start();
    if (cause === 'device') { h.changeDevice(); await vi.advanceTimersByTimeAsync(100); }
    if (cause === 'delayed-input') {
      const timestamp = origin + 1000;
      await vi.advanceTimersByTimeAsync(timestamp + 300 - Date.now());
      h.controller.recordTap(timestamp);
    }
    if (cause === 'closing-stall') {
      await vi.advanceTimersByTimeAsync(origin + 1950 - Date.now());
      vi.setSystemTime(Date.now() + 350);
      await vi.advanceTimersByTimeAsync(50);
    }
    expect(h.controller.getSnapshot()).toMatchObject({ phase: 'interrupted', result: undefined });
    h.controller.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('bounds pending resume and permits a fresh attempt after interruption', async () => {
    const h = harness();
    h.blockPrepare();
    const preparing = h.controller.start(h.plan, { offsetMs: 0, creditRadiusSeconds: 0.05 });
    await vi.advanceTimersByTimeAsync(1100);
    await preparing;
    expect(h.controller.getSnapshot().phase).toBe('interrupted');
    h.allowPrepare();
    await h.start();
    await vi.advanceTimersByTimeAsync(2500);
    expect(h.controller.getSnapshot().phase).toBe('completed');
    h.controller.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
});
