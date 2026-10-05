import { analyzeTiming, captureBounds, type CapturedTap, type RhythmTarget, type TimedAttemptPlan, type TimingAnalysis } from '../index.js';
import { normalizeInputTimestamp } from './input.js';
import { browserRuntime, type AttemptRuntime, type ClockSnapshot, type RhythmPlaybackHandle, type RhythmPlaybackPort, type ExternalInputSource, type ExternalInputHandle } from './ports.js';

export type AttemptPhase = 'ready' | 'preparing' | 'countIn' | 'listen' | 'respond' | 'finalizing' | 'completed' | 'interrupted' | 'disposed';
export interface AttemptSnapshot<M = unknown> {
  phase: AttemptPhase;
  playbackTimeSeconds: number;
  tapCount: number;
  clockSource?: string;
  result?: TimingAnalysis<M>;
  reason?: string;
}
export interface AttemptOptions<M> {
  offsetMs: number;
  inputSources?: readonly ExternalInputSource[];
  /** Padding for simultaneous inputs with different fixed offsets. Default is offsetMs only. */
  offsetRangeMs?: readonly [number, number];
  creditRadiusSeconds: number | ((target: RhythmTarget<M>) => number);
  deliveryGraceMs?: number;
  readinessTimeoutMs?: number;
  heartbeatMs?: number;
  leadSeconds?: number;
  maximumClockJumpMs?: number;
}

export function createTimedAttempt<S, M = unknown>(port: RhythmPlaybackPort<S>,
  runtime: AttemptRuntime = browserRuntime(), lifecycle: { document?: Document; window?: Window } =
    { document: globalThis.document, window: globalThis.window }) {
  let snapshot: AttemptSnapshot<M> = { phase: 'ready', playbackTimeSeconds: 0, tapCount: 0 };
  const listeners = new Set<() => void>();
  let generation = 0;
  let abort: AbortController | undefined;
  let handle: RhythmPlaybackHandle | undefined;
  let cleanups: (() => void)[] = [];
  let options: AttemptOptions<M> | undefined;
  let bounds: ReturnType<typeof captureBounds> | undefined;
  let taps: CapturedTap[] = [];
  let clock: ClockSnapshot | undefined;
  let clockSource: string | undefined;
  let ended = false;
  let lastHeartbeat = 0;
  let closingPerformanceMs = Infinity;
  let graceMs = 250;
  let jumpMs = 75;
  let sourceHandles: { source: ExternalInputSource; handle: ExternalInputHandle }[] = [];
  let sourcesDrained = true, drainStarted = false;

  const publish = (next: AttemptSnapshot<M>) => { snapshot = next; for (const listener of listeners) listener(); };
  const cleanup = () => {
    abort?.abort(); abort = undefined;
    for (const item of sourceHandles.splice(0)) item.handle.cancel();
    for (const off of cleanups.splice(0)) off();
    handle?.stop(); handle = undefined;
  };
  const active = () => ['countIn', 'listen', 'respond', 'finalizing'].includes(snapshot.phase);
  const interrupt = (reason: string) => {
    if (snapshot.phase === 'disposed' || snapshot.phase === 'completed' || snapshot.phase === 'ready' || snapshot.phase === 'interrupted') return;
    generation++;
    cleanup();
    publish({ ...snapshot, phase: 'interrupted', result: undefined, reason });
  };
  const withAbort = <T,>(promise: Promise<T>, signal: AbortSignal): Promise<T> => new Promise((resolve, reject) => {
    const cancelled = () => { signal.removeEventListener('abort', cancelled); reject(new Error('Preparation cancelled.')); };
    if (signal.aborted) { cancelled(); return; }
    signal.addEventListener('abort', cancelled, { once: true });
    promise.then(value => { signal.removeEventListener('abort', cancelled); resolve(value); }, error => {
      signal.removeEventListener('abort', cancelled); reject(error);
    });
  });
  const pause = (signal: AbortSignal) => {
    let off: (() => void) | undefined;
    return withAbort(new Promise<void>(resolve => { off = runtime.scheduleTask(resolve, 25); }), signal).finally(() => off?.());
  };
  const validClock = (candidate: ClockSnapshot | undefined, source: string) => candidate &&
    candidate.sourceKey === source && typeof candidate.continuityKey === 'string' &&
    Number.isFinite(candidate.performanceTimeMs) && Number.isFinite(candidate.playbackTimeSeconds) &&
    candidate.performanceTimeMs >= 0 && candidate.performanceTimeMs <= runtime.nowMs() + 100 &&
    runtime.nowMs() - candidate.performanceTimeMs <= graceMs;
  const continuous = (previous: ClockSnapshot, next: ClockSnapshot) => previous.continuityKey === next.continuityKey &&
    next.performanceTimeMs >= previous.performanceTimeMs &&
    Math.abs(next.playbackTimeSeconds - previous.playbackTimeSeconds - (next.performanceTimeMs - previous.performanceTimeMs) / 1000) <= jumpMs / 1000;
  const readClock = () => {
    const next = clockSource && handle?.clock(clockSource);
    if (!next || !validClock(next, clockSource!) || (clock && !continuous(clock, next))) {
      interrupt('The audio clock changed or was interrupted. Restart this attempt.'); return undefined;
    }
    clock = next;
    return next;
  };

  const captureTap = (timestampMs: number, inputOffsetMs: number, sourceId?: string, maximumAgeMs = graceMs) => {
      if (!active() || !bounds || !options) return;
      try {
        const timestamp = normalizeInputTimestamp(timestampMs, runtime);
        const offset = inputOffsetMs ?? options.offsetMs;
        const [minimum, maximum] = options.offsetRangeMs ?? [options.offsetMs, options.offsetMs];
        if (!Number.isFinite(offset) || offset < minimum || offset > maximum) throw new RangeError('Input adjustment is outside the prepared range.');
        const pair = readClock();
        if (!pair) return;
        const corrected = pair.playbackTimeSeconds + (timestamp - pair.performanceTimeMs) / 1000 - offset / 1000;
        if (corrected < bounds.correctedStart || corrected >= bounds.correctedEnd) return;
        if (runtime.nowMs() - timestamp > maximumAgeMs) {
          interrupt('Input arrived too late to grade reliably. Restart this attempt.'); return;
        }
        if (taps.length >= 10000) { interrupt('Input event limit exceeded.'); return; }
        taps.push({ atSeconds: corrected, sequence: taps.length, ...(sourceId ? { sourceId } : {}) });
      } catch {
        interrupt('Input timing is unavailable. Restart this attempt.');
      }
  };

  const controller = {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    isCapturing: active,
    cancel: interrupt,
    dispose() {
      generation++; cleanup();
      publish({ ...snapshot, phase: 'disposed', result: undefined });
      listeners.clear();
    },
    recordTap(timestampMs: number) {
      controller.recordAdjustedTap(timestampMs, options?.offsetMs ?? 0);
    },
    recordAdjustedTap(timestampMs: number, inputOffsetMs: number) {
      captureTap(timestampMs, inputOffsetMs);
    },
    async start(nextPlan: TimedAttemptPlan<S, M>, nextOptions: AttemptOptions<M>): Promise<void> {
      if (snapshot.phase === 'disposed') throw new Error('Controller disposed.');
      const sources = (nextOptions.inputSources ?? []).map(source => ({
        id: source.id, offsetMs: source.offsetMs, maximumDeliveryAgeMs: source.maximumDeliveryAgeMs,
        drainTimeoutMs: source.drainTimeoutMs, prepare: source.prepare.bind(source), start: source.start.bind(source),
      }));
      if (new Set(sources.map(source => source.id)).size !== sources.length || sources.some(source =>
        !source.id || !Number.isFinite(source.offsetMs) || !Number.isFinite(source.maximumDeliveryAgeMs) ||
        source.maximumDeliveryAgeMs <= 0 || source.maximumDeliveryAgeMs > 10000 ||
        !Number.isFinite(source.drainTimeoutMs) || source.drainTimeoutMs <= 0 || source.drainTimeoutMs > 10000)) {
        throw new RangeError('Invalid external input policy.');
      }
      const lastAudioEnd = port.validateStimulus(nextPlan.stimulus).lastAudioEndSeconds;
      const nextGrace = nextOptions.deliveryGraceMs ?? 250;
      const heartbeat = nextOptions.heartbeatMs ?? 50;
      const timeout = nextOptions.readinessTimeoutMs ?? 1000;
      const lead = nextOptions.leadSeconds ?? 0.08;
      const nextJump = nextOptions.maximumClockJumpMs ?? 75;
      if (![nextGrace, heartbeat, timeout, nextJump].every(n => Number.isFinite(n) && n > 0) ||
        heartbeat >= nextGrace || !Number.isFinite(lead) || lead < 0 || !port.clockSourcesByPreference.length) throw new RangeError('Invalid runtime policy.');
      const [minimumOffset, maximumOffset] = nextOptions.offsetRangeMs ?? [nextOptions.offsetMs, nextOptions.offsetMs];
      if (![minimumOffset, maximumOffset, nextOptions.offsetMs].every(Number.isFinite) || minimumOffset > nextOptions.offsetMs || maximumOffset < nextOptions.offsetMs) {
        throw new RangeError('Invalid input adjustment range.');
      }
      if (sources.some(source => source.offsetMs < minimumOffset || source.offsetMs > maximumOffset)) throw new RangeError('External input adjustment is outside the prepared range.');
      const firstBounds = captureBounds(nextPlan, minimumOffset, nextGrace / 1000, lastAudioEnd);
      const lastBounds = captureBounds(nextPlan, maximumOffset, nextGrace / 1000, lastAudioEnd);
      const nextBounds = { ...firstBounds, rawEnd: lastBounds.rawEnd, runtimeDuration: Math.max(firstBounds.runtimeDuration, lastBounds.runtimeDuration) };
      // Validate scoring before beginning, even when there will be no input.
      analyzeTiming(nextPlan, [], nextOptions.creditRadiusSeconds);
      if (nextBounds.rawStart + lead < 0.05) throw new RangeError('Extend the count-in: input capture needs at least 50 ms of preparation margin.');
      generation++; cleanup();
      const token = generation;
      options = nextOptions; bounds = nextBounds;
      graceMs = nextGrace; jumpMs = nextJump; taps = []; clock = undefined; clockSource = undefined; ended = false;
      closingPerformanceMs = Infinity; sourcesDrained = sources.length === 0; drainStarted = false;
      abort = new AbortController();
      const signal = abort.signal;
      publish({ phase: 'preparing', playbackTimeSeconds: 0, tapCount: 0 });
      const budgetOff = runtime.scheduleTask(() => { if (token === generation) interrupt('Audio could not be prepared in time. Try starting again.'); }, timeout);
      cleanups.push(budgetOff);
      const watchLifecycle = () => {
        const hidden = () => { if (lifecycle.document?.hidden) interrupt('Practice paused when the tab became hidden.'); };
        const blurred = () => interrupt('Practice paused when the window lost focus.');
        lifecycle.document?.addEventListener('visibilitychange', hidden);
        lifecycle.window?.addEventListener('blur', blurred);
        cleanups.push(() => { lifecycle.document?.removeEventListener('visibilitychange', hidden); lifecycle.window?.removeEventListener('blur', blurred); });
        hidden();
      };
      watchLifecycle();
      try {
        await withAbort(Promise.all([port.prepare(signal), ...sources.map(source => source.prepare(signal))]), signal);
        if (token !== generation) return;
        handle = port.playSilence({ durationSeconds: timeout / 1000 + 1, leadSeconds: 0 });
        const stopWarmupWatch = handle.onInterrupted(interrupt);
        cleanups.push(stopWarmupWatch);
        const previous = new Map<string, ClockSnapshot>();
        const warmupStarted = runtime.nowMs();
        while (!clockSource && token === generation) {
          let preferredAvailable: string | undefined;
          for (const source of port.clockSourcesByPreference) {
            const candidate = handle.clock(source);
            if (!validClock(candidate, source)) continue;
            preferredAvailable ??= source;
            const before = previous.get(source);
            // Output latency/timestamps can initialize after resume. Give them time
            // to settle, and let a newly available preferred source get its second pair.
            if (source === preferredAvailable && runtime.nowMs() - warmupStarted >= 100 &&
              before && continuous(before, candidate!) && candidate!.performanceTimeMs > before.performanceTimeMs &&
              candidate!.playbackTimeSeconds > before.playbackTimeSeconds) {
              clockSource = source; break;
            }
            previous.set(source, candidate!);
          }
          if (!clockSource) await pause(signal);
        }
        if (token !== generation || !clockSource) return;
        stopWarmupWatch();
        handle.stop();
        handle = port.play(nextPlan.stimulus, { durationSeconds: nextBounds.runtimeDuration, leadSeconds: lead });
        cleanups.push(handle.onInterrupted(interrupt));
        clock = undefined;
        const initial = readClock();
        if (!initial || token !== generation) return;
        if (initial.playbackTimeSeconds + (runtime.nowMs() - initial.performanceTimeMs) / 1000 >= nextBounds.rawStart) {
          interrupt('Count-in is too short for input setup. Choose a longer count-in.'); return;
        }
        for (const source of sources) {
          const toPerformance = (at: number) => initial.performanceTimeMs + (at - initial.playbackTimeSeconds) * 1000;
          const seen = new Set<string>();
          const inputHandle = source.start({ generation: token,
            eligibilityStartPerformanceMs: toPerformance(nextBounds.correctedStart + source.offsetMs / 1000),
            eligibilityEndPerformanceMs: toPerformance(nextBounds.correctedEnd + source.offsetMs / 1000),
            emit(event) {
              if (token !== generation || event.generation !== token) return;
              if (!event.eventId || !Number.isFinite(event.performanceTimeMs)) { interrupt('External input timing is unavailable.'); return; }
              if (seen.has(event.eventId)) return;
              if (seen.size >= 10000) { interrupt('External input event limit exceeded.'); return; }
              seen.add(event.eventId);
              captureTap(event.performanceTimeMs, source.offsetMs, source.id, source.maximumDeliveryAgeMs);
            },
            interrupt(reason) { if (token === generation) interrupt(reason); },
          });
          if (token !== generation) { inputHandle.cancel(); return; }
          sourceHandles.push({ source, handle: inputHandle });
        }
        budgetOff();
        lastHeartbeat = runtime.nowMs();
        handle.finished.then(result => {
          if (token !== generation) return;
          if (result !== 'ended') interrupt('Playback stopped. Restart this attempt.');
          else ended = true;
        }, () => { if (token === generation) interrupt('Playback failed. Restart this attempt.'); });
        let tickOff: (() => void) | undefined;
        cleanups.push(() => tickOff?.());
        const tick = () => {
          if (token !== generation || !handle) return;
          const now = runtime.nowMs();
          const pair = readClock();
          if (!pair || token !== generation) return;
          const at = pair.playbackTimeSeconds + (now - pair.performanceTimeMs) / 1000;
          closingPerformanceMs = pair.performanceTimeMs + (nextBounds.rawEnd - pair.playbackTimeSeconds) * 1000;
          if (now > closingPerformanceMs && now - lastHeartbeat > graceMs) {
            interrupt('The system stalled at the end of the attempt. Restart to get a reliable result.'); return;
          }
          // Check the still-open heartbeat gap before updating it; callback order cannot hide a stall.
          lastHeartbeat = now;
          const phase = nextPlan.phases.find(p => at >= p.startSeconds && at < p.endSeconds)?.kind;
          if (!drainStarted && at >= nextBounds.rawEnd) {
            drainStarted = true;
            void Promise.all(sourceHandles.map(({ source, handle: input }) => new Promise<void>((resolve, reject) => {
              const off = runtime.scheduleTask(() => reject(new Error(`Input source ${source.id} did not finish in time.`)), source.drainTimeoutMs);
              cleanups.push(off);
              Promise.resolve().then(() => input.drain()).then(() => { off(); resolve(); }, error => { off(); reject(error); });
            }))).then(() => { if (token === generation) sourcesDrained = true; }, error => {
              if (token === generation) interrupt(error instanceof Error ? error.message : 'External input drain failed.');
            });
          }
          if (sourcesDrained && ended && at >= nextBounds.runtimeDuration && now >= closingPerformanceMs + graceMs) {
            const result = analyzeTiming(nextPlan, taps, nextOptions.creditRadiusSeconds);
            cleanup();
            publish({ phase: 'completed', playbackTimeSeconds: at, tapCount: taps.length, clockSource, result });
            return;
          }
          publish({ phase: at >= nextPlan.responseWindow.endSeconds ? 'finalizing' : phase ?? 'countIn',
            playbackTimeSeconds: at, tapCount: taps.length, clockSource });
          tickOff = runtime.scheduleTask(tick, heartbeat);
        };
        tick();
      } catch (error) {
        if (token === generation) interrupt(error instanceof Error ? error.message : 'Audio preparation failed.');
      }
    },
  };
  return controller;
}

export type TimedAttemptController<S, M = unknown> = ReturnType<typeof createTimedAttempt<S, M>>;
