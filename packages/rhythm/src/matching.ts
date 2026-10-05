import { validatePlan } from './plan.js';
import type { CapturedTap, TimedAttemptPlan, TimingAnalysis, RhythmTarget, TargetTiming } from './types.js';

export function median(values: readonly number[]): number | undefined {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/** Diagnostic matching and timing classification. No fitted offset/tempo or app pass policy. */
export function analyzeTiming<S, M>(plan: TimedAttemptPlan<S, M>, taps: readonly CapturedTap[],
  credit: number | ((target: RhythmTarget<M>) => number)): TimingAnalysis<M> {
  validatePlan(plan);
  if (taps.some(t => !Number.isFinite(t.atSeconds) || !Number.isInteger(t.sequence) || t.sequence < 0)) throw new RangeError('Invalid tap.');
  const start = Math.min(plan.responseWindow.startSeconds, plan.targets[0]!.atSeconds - plan.targets[0]!.associationRadiusSeconds);
  const eligible = taps.filter(t => t.atSeconds >= start && t.atSeconds < plan.responseWindow.endSeconds)
    .sort((a, b) => a.atSeconds - b.atSeconds || a.sequence - b.sequence);
  const used = new Set<CapturedTap>();
  const targets: TargetTiming<M>[] = plan.targets.map(target => {
    const requested = typeof credit === 'number' ? credit : credit(target);
    if (!Number.isFinite(requested) || requested <= 0) throw new RangeError('Credit radius must be positive.');
    const creditRadiusSeconds = Math.min(requested, target.associationRadiusSeconds);
    let tap: CapturedTap | undefined;
    for (const candidate of eligible) {
      if (Math.abs(candidate.atSeconds - target.atSeconds) > target.associationRadiusSeconds + 1e-10) continue;
      if (!tap || Math.abs(candidate.atSeconds - target.atSeconds) < Math.abs(tap.atSeconds - target.atSeconds) - 1e-10 ||
        (Math.abs(Math.abs(candidate.atSeconds - target.atSeconds) - Math.abs(tap.atSeconds - target.atSeconds)) <= 1e-10 && candidate.sequence < tap.sequence)) tap = candidate;
    }
    if (!tap) return { target, creditRadiusSeconds, status: 'missed' };
    used.add(tap);
    const errorSeconds = tap.atSeconds - target.atSeconds;
    const status = Math.abs(errorSeconds) <= creditRadiusSeconds + 1e-10 ? 'onTime' : errorSeconds < 0 ? 'early' : 'late';
    return { target, tap, errorSeconds, creditRadiusSeconds, status };
  });
  const matched = targets.filter(t => t.errorSeconds !== undefined);
  const errors = matched.map(t => t.errorSeconds!);
  let driftSecondsPerSecond: number | undefined;
  if (matched.length >= 4) {
    const xMean = matched.reduce((n, t) => n + t.target.atSeconds, 0) / matched.length;
    const yMean = errors.reduce((n, t) => n + t, 0) / errors.length;
    const variance = matched.reduce((n, t) => n + (t.target.atSeconds - xMean) ** 2, 0);
    if (variance > 0) driftSecondsPerSecond = matched.reduce((n, t) => n + (t.target.atSeconds - xMean) * (t.errorSeconds! - yMean), 0) / variance;
  }
  return { targets, extras: eligible.filter(t => !used.has(t)), targetCount: targets.length,
    onTime: targets.filter(t => t.status === 'onTime').length, early: targets.filter(t => t.status === 'early').length,
    late: targets.filter(t => t.status === 'late').length, missed: targets.filter(t => t.status === 'missed').length,
    medianErrorSeconds: median(errors), medianAbsoluteErrorSeconds: median(errors.map(Math.abs)), driftSecondsPerSecond };
}

/** Optional accuracy policy: extras enlarge the denominator; late/missed taps earn no credit. */
export function timingAccuracy(analysis: Pick<TimingAnalysis, 'onTime' | 'targetCount' | 'extras'>): number {
  return 100 * analysis.onTime / (analysis.targetCount + analysis.extras.length);
}

export function meanAccuracy(values: readonly number[]): number | undefined {
  if (values.some(n => !Number.isFinite(n) || n < 0 || n > 100)) throw new RangeError('Invalid accuracy.');
  return values.length ? values.reduce((sum, n) => sum + n, 0) / values.length : undefined;
}
