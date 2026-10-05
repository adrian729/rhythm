import type { TimedAttemptPlan } from './types.js';

export function validatePlan<S, M>(plan: TimedAttemptPlan<S, M>): void {
  const finite = Number.isFinite;
  if (!finite(plan.durationSeconds) || plan.durationSeconds <= 0) throw new RangeError('Plan duration must be positive.');
  const { startSeconds: start, endSeconds: end } = plan.responseWindow;
  if (!finite(start) || !finite(end) || start < 0 || end <= start || end > plan.durationSeconds) {
    throw new RangeError('Invalid response window.');
  }
  let phaseEnd = 0;
  for (const phase of plan.phases) {
    if (!['countIn', 'listen', 'respond'].includes(phase.kind) || !finite(phase.startSeconds) ||
      !finite(phase.endSeconds) || phase.startSeconds < phaseEnd || phase.endSeconds <= phase.startSeconds ||
      phase.endSeconds > plan.durationSeconds) throw new RangeError('Invalid phase ordering.');
    phaseEnd = phase.endSeconds;
  }
  if (!plan.targets.length) throw new RangeError('A scored plan needs targets.');
  const ids = new Set<string>();
  let previousWindowEnd = -Infinity;
  for (const target of plan.targets) {
    const { targetId, atSeconds: at, associationRadiusSeconds: radius } = target;
    if (!targetId || ids.has(targetId) || !finite(at) || at < start || at >= end || !finite(radius) || radius <= 0 ||
      at - radius <= previousWindowEnd) throw new RangeError('Invalid or overlapping target windows.');
    ids.add(targetId);
    previousWindowEnd = at + radius;
  }
}

export function captureBounds<S, M>(plan: TimedAttemptPlan<S, M>, offsetMs: number, graceSeconds: number, lastAudioEnd = 0) {
  validatePlan(plan);
  if (!Number.isFinite(offsetMs) || !Number.isFinite(graceSeconds) || graceSeconds < 0 ||
    !Number.isFinite(lastAudioEnd) || lastAudioEnd < 0 || lastAudioEnd > plan.durationSeconds) {
    throw new RangeError('Invalid capture padding.');
  }
  const first = plan.targets[0]!;
  const start = Math.min(plan.responseWindow.startSeconds, first.atSeconds - first.associationRadiusSeconds);
  const end = plan.responseWindow.endSeconds;
  return { correctedStart: start, correctedEnd: end, rawStart: start + offsetMs / 1000,
    rawEnd: end + offsetMs / 1000,
    runtimeDuration: Math.max(plan.durationSeconds, lastAudioEnd, end + offsetMs / 1000) + graceSeconds };
}
