import { median } from './matching.js';
import type { TimingAnalysis } from './types.js';

export interface AdjustmentGates { minimumMatches: number; maximumRoundDifferenceMs: number; maximumMadMs: number; maximumOffsetMs: number }

/** Uses raw browser-clock errors; callers must not apply an existing user offset first. */
export function estimateAdjustment(rounds: readonly TimingAnalysis[], gates: AdjustmentGates) {
  if (!Number.isInteger(gates.minimumMatches) || gates.minimumMatches < 1 ||
    [gates.maximumRoundDifferenceMs, gates.maximumMadMs, gates.maximumOffsetMs].some(n => !Number.isFinite(n) || n < 0)) throw new RangeError('Invalid adjustment gates.');
  const measurements = rounds.map(round => {
    const errors = round.targets.flatMap(t => t.errorSeconds === undefined ? [] : [t.errorSeconds * 1000]);
    const offsetMs = median(errors);
    const madMs = offsetMs === undefined ? undefined : median(errors.map(n => Math.abs(n - offsetMs)));
    return { matches: errors.length, offsetMs, madMs };
  });
  const offsets = measurements.flatMap(m => m.offsetMs === undefined ? [] : [m.offsetMs]);
  const stable = rounds.length >= 2 && measurements.every(m => m.matches >= gates.minimumMatches &&
    m.offsetMs !== undefined && Math.abs(m.offsetMs) <= gates.maximumOffsetMs && m.madMs! <= gates.maximumMadMs) &&
    Math.max(...offsets) - Math.min(...offsets) <= gates.maximumRoundDifferenceMs;
  return { stable, suggestedOffsetMs: stable ? median(offsets) : undefined, measurements };
}
