export interface RhythmTarget<Metadata = unknown> {
  targetId: string;
  atSeconds: number;
  associationRadiusSeconds: number;
  metadata?: Metadata;
}

export interface TimedAttemptPlan<Stimulus, Metadata = unknown> {
  durationSeconds: number;
  phases: readonly { kind: 'countIn' | 'listen' | 'respond'; startSeconds: number; endSeconds: number }[];
  stimulus: Stimulus;
  targets: readonly RhythmTarget<Metadata>[];
  responseWindow: { startSeconds: number; endSeconds: number };
}

export interface CapturedTap { atSeconds: number; sequence: number }
export interface TargetTiming<Metadata = unknown> {
  target: RhythmTarget<Metadata>;
  tap?: CapturedTap;
  errorSeconds?: number;
  creditRadiusSeconds: number;
  status: 'onTime' | 'early' | 'late' | 'missed';
}
export interface TimingAnalysis<Metadata = unknown> {
  targets: readonly TargetTiming<Metadata>[];
  extras: readonly CapturedTap[];
  targetCount: number;
  onTime: number;
  early: number;
  late: number;
  missed: number;
  medianErrorSeconds?: number;
  medianAbsoluteErrorSeconds?: number;
  /** Regression of signed error on target time; omitted with fewer than four matches. */
  driftSecondsPerSecond?: number;
}

export interface PulseCue { atSeconds: number; accent: boolean; level: 'pulse' | 'subdivision' }
export interface BeatPosition { atSeconds: number; bar: number; beat: number; kind: 'countIn' | 'respond' }
export interface PulseMetadata { bar: number; beat: number }
export interface PulsePlan extends TimedAttemptPlan<readonly PulseCue[], PulseMetadata> {
  pulseBpm: number;
  beatGrid: readonly BeatPosition[];
  pulseSeconds: number;
  beatsPerBar: number;
}
