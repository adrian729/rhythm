export interface ClockSnapshot {
  performanceTimeMs: number;
  playbackTimeSeconds: number;
  sourceKey: string;
  continuityKey: string;
}
export interface PlaybackOptions { durationSeconds: number; leadSeconds: number }
export interface RhythmPlaybackHandle {
  finished: Promise<'ended' | 'stopped' | 'blocked'>;
  clock(sourceKey: string): ClockSnapshot | undefined;
  onInterrupted(listener: (reason: string) => void): () => void;
  stop(): void;
}
export interface RhythmPlaybackPort<S> {
  clockSourcesByPreference: readonly string[];
  prepare(signal: AbortSignal): Promise<void>;
  validateStimulus(stimulus: S): { lastAudioEndSeconds: number };
  playSilence(options: PlaybackOptions): RhythmPlaybackHandle;
  play(stimulus: S, options: PlaybackOptions): RhythmPlaybackHandle;
}
export interface AttemptRuntime {
  nowMs(): number;
  timeOriginEpochMs: number;
  scheduleTask(callback: () => void, delayMs: number): () => void;
}
export function browserRuntime(): AttemptRuntime {
  return { nowMs: () => performance.now(), timeOriginEpochMs: performance.timeOrigin,
    scheduleTask: (callback, delayMs) => { const id = setTimeout(callback, delayMs); return () => clearTimeout(id); } };
}

/** Neutral timestamped input; capture/analysis implementations stay in the host. */
export interface ExternalInputEvent {
  generation: number;
  eventId: string;
  /** Monotonic performance-clock time of the original event, not delivery. */
  performanceTimeMs: number;
}
export interface ExternalInputStart {
  generation: number;
  eligibilityStartPerformanceMs: number;
  eligibilityEndPerformanceMs: number;
  emit(event: ExternalInputEvent): void;
  interrupt(reason: string): void;
}
export interface ExternalInputHandle {
  /** Stop eligible input, process its confirmation tail, deliver all events and acknowledge. */
  drain(): Promise<void>;
  cancel(): void;
}
export interface ExternalInputSource {
  id: string;
  offsetMs: number;
  maximumDeliveryAgeMs: number;
  drainTimeoutMs: number;
  /** Permission must already have been granted by explicit host activation. */
  prepare(signal: AbortSignal): Promise<void>;
  start(options: ExternalInputStart): ExternalInputHandle;
}
