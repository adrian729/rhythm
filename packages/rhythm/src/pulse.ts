import { validatePlan } from './plan.js';
import type { BeatPosition, PulseCue, PulsePlan, RhythmTarget, PulseMetadata } from './types.js';

export interface PulseOptions {
  pulseBpm: number;
  beatsPerBar: number;
  responseBars: number;
  countInBars?: number;
  minimumCountInSeconds?: number;
  /** One-based target beats; omitted means every beat. */
  targetBeats?: readonly number[];
  /** Zero-based cue offsets inside a response bar; e.g. [1, 3] for backbeats. */
  cueOffsets?: readonly number[];
  countInSubdivisions?: number;
  responseSubdivisions?: number;
}

export function buildPulsePlan(options: PulseOptions): PulsePlan {
  const { pulseBpm, beatsPerBar, responseBars } = options;
  const countInBars = options.countInBars ?? 1;
  const minimum = options.minimumCountInSeconds ?? 0;
  const subdivisions = [options.countInSubdivisions ?? 1, options.responseSubdivisions ?? 1];
  if (!Number.isFinite(pulseBpm) || pulseBpm <= 0 || pulseBpm > 1000 ||
    !Number.isInteger(beatsPerBar) || beatsPerBar < 1 || beatsPerBar > 32 ||
    !Number.isInteger(responseBars) || responseBars < 1 || responseBars > 1000 ||
    !Number.isInteger(countInBars) || countInBars < 0 || countInBars > 1000 ||
    !Number.isFinite(minimum) || minimum < 0 || minimum > 3600 ||
    subdivisions.some(n => !Number.isInteger(n) || n < 1 || n > 16)) throw new RangeError('Invalid pulse options.');
  const pulseSeconds = 60 / pulseBpm;
  const countBars = Math.max(countInBars, Math.ceil(minimum / (pulseSeconds * beatsPerBar)));
  const allBeats = Array.from({ length: beatsPerBar }, (_, i) => i + 1);
  const targetBeats = options.targetBeats ?? allBeats;
  const cueOffsets = options.cueOffsets ?? allBeats.map(n => n - 1);
  if (!targetBeats.length || new Set(targetBeats).size !== targetBeats.length ||
    targetBeats.some(n => !Number.isInteger(n) || n < 1 || n > beatsPerBar) ||
    new Set(cueOffsets).size !== cueOffsets.length ||
    cueOffsets.some(n => !Number.isFinite(n) || n < 0 || n >= beatsPerBar)) throw new RangeError('Invalid target or cue beats.');
  const beatGrid: BeatPosition[] = [];
  const cues: PulseCue[] = [];
  const targets: RhythmTarget<PulseMetadata>[] = [];
  const responseStart = countBars * beatsPerBar * pulseSeconds;
  for (let bar = 0; bar < countBars + responseBars; bar++) {
    const countIn = bar < countBars;
    const localBar = countIn ? bar : bar - countBars;
    const barStart = bar * beatsPerBar * pulseSeconds;
    const offsets = countIn ? allBeats.map(n => n - 1) : cueOffsets;
    for (const offset of offsets) cues.push({ atSeconds: barStart + offset * pulseSeconds, accent: offset === 0, level: 'pulse' });
    const divisions = countIn ? subdivisions[0]! : subdivisions[1]!;
    for (let beat = 0; beat < beatsPerBar; beat++) {
      const atSeconds = barStart + beat * pulseSeconds;
      beatGrid.push({ atSeconds, bar: localBar + 1, beat: beat + 1, kind: countIn ? 'countIn' : 'respond' });
      for (let sub = 1; sub < divisions; sub++) cues.push({ atSeconds: atSeconds + sub * pulseSeconds / divisions, accent: false, level: 'subdivision' });
      if (!countIn && targetBeats.includes(beat + 1)) targets.push({ targetId: `${localBar + 1}:${beat + 1}`, atSeconds,
        associationRadiusSeconds: 0.45 * pulseSeconds, metadata: { bar: localBar + 1, beat: beat + 1 } });
    }
  }
  const durationSeconds = (countBars + responseBars) * beatsPerBar * pulseSeconds;
  const plan: PulsePlan = { durationSeconds, pulseBpm, pulseSeconds, beatsPerBar, beatGrid,
    phases: [...(responseStart > 0 ? [{ kind: 'countIn' as const, startSeconds: 0, endSeconds: responseStart }] : []),
      { kind: 'respond', startSeconds: responseStart, endSeconds: durationSeconds }],
    stimulus: cues.sort((a, b) => a.atSeconds - b.atSeconds), targets,
    responseWindow: { startSeconds: responseStart, endSeconds: durationSeconds } };
  validatePlan(plan);
  return plan;
}
