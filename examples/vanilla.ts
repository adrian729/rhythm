import { buildPulsePlan, type PulseCue } from '@polyhymnia/rhythm';
import { bindTapInput, createTimedAttempt, type PlaybackOptions, type RhythmPlaybackHandle, type RhythmPlaybackPort } from '@polyhymnia/rhythm/browser';
import { clickInstrument, createAudioContext, createPlayer, type PlaybackClockSource } from '@polyhymnia/web-audio/webaudio';

/** Standalone vanilla host: no React, app source, persistence or animation frames. */
export function mountPulse(startButton: HTMLButtonElement, tapPad: HTMLElement, feedback: HTMLElement) {
  const ctx = createAudioContext();
  const player = createPlayer(ctx, clickInstrument(ctx, { out: ctx.destination }));
  const play = (cues: readonly PulseCue[], options: PlaybackOptions): RhythmPlaybackHandle => {
    const handle = player.play(cues.map(cue => ({ midi: cue.accent ? 84 : 76, start: cue.atSeconds,
      duration: 0.035, velocity: cue.level === 'subdivision' ? 0.2 : 0.7 })), { lead: options.leadSeconds, durationSeconds: options.durationSeconds });
    return { finished: handle.finished, stop: handle.stop,
      clock(key) { const pair = handle.clock?.(key as PlaybackClockSource); return pair && { ...pair, sourceKey: pair.source, continuityKey: JSON.stringify(pair.latencyStages) ?? 'output' }; },
      onInterrupted(listener) { const state = () => { if (ctx.state !== 'running') listener('Audio suspended.'); };
        ctx.addEventListener('statechange', state); return () => ctx.removeEventListener('statechange', state); } };
  };
  const port: RhythmPlaybackPort<readonly PulseCue[]> = {
    clockSourcesByPreference: ['outputTimestamp', 'latencyEstimate', 'uncorrected'],
    async prepare(signal) { await ctx.resume(); if (signal.aborted || ctx.state !== 'running') throw Error('Audio unavailable.'); },
    validateStimulus: cues => ({ lastAudioEndSeconds: Math.max(0, ...cues.map(c => c.atSeconds + 0.035)) }),
    playSilence: options => play([], options), play,
  };
  const controller = createTimedAttempt(port);
  const plan = buildPulsePlan({ pulseBpm: 90, beatsPerBar: 4, responseBars: 2 });
  const offInput = bindTapInput({ keyboardTarget: window, pointerTarget: tapPad, method: 'pointer',
    isActive: controller.isCapturing, onTap: controller.recordTap });
  const offState = controller.subscribe(() => {
    const state = controller.getSnapshot();
    feedback.textContent = state.result ? `${state.result.onTime}/${state.result.targetCount} on time` : state.reason ?? state.phase;
  });
  const start = () => { tapPad.focus(); void controller.start(plan, { offsetMs: 0, creditRadiusSeconds: 0.08 }); };
  startButton.addEventListener('click', start);
  return () => { startButton.removeEventListener('click', start); offInput(); offState(); controller.dispose(); };
}
