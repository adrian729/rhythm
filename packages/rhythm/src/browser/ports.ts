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
