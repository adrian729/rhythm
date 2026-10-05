import { useEffect, useMemo, useSyncExternalStore, type CSSProperties } from 'react';
import type { PulsePlan, TimingAnalysis } from '@polyhymnia/rhythm';
import { createTimedAttempt, type AttemptRuntime, type RhythmPlaybackPort } from '@polyhymnia/rhythm/browser';

/** Headless adapter. The host owns controls, input binding, scoring policy and storage. */
export function useTimedAttempt<S, M = unknown>(port: RhythmPlaybackPort<S>, runtime?: AttemptRuntime) {
  const controller = useMemo(() => createTimedAttempt<S, M>(port, runtime), [port, runtime]);
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  // Cancel rather than dispose: React's development effect replay reuses the controller.
  useEffect(() => () => controller.cancel('Practice closed.'), [controller]);
  return { controller, snapshot };
}

export interface BeatGuideProps {
  plan: PulsePlan;
  playbackTimeSeconds: number;
  phase: 'countIn' | 'respond';
  label?: string;
  beatLabels?: readonly string[];
  className?: string;
  style?: CSSProperties;
  activeColor?: string;
}
/** A host-styled guide. It neither runs a clock nor enables response guidance itself. */
export function BeatGuide({ plan, playbackTimeSeconds: at, phase, label = 'Beat guide', beatLabels,
  className, style, activeColor = 'currentColor' }: BeatGuideProps) {
  const start = phase === 'respond' ? plan.responseWindow.startSeconds : 0;
  const beat = at < start ? -1 : Math.floor((at - start) / plan.pulseSeconds) % plan.beatsPerBar;
  return <div role="img" aria-label={label} className={className} style={{ display: 'flex', gap: '0.75rem', ...style }}>
    {Array.from({ length: plan.beatsPerBar }, (_, index) => <span key={index} data-active={beat === index}
      style={{ border: '2px solid currentColor', borderRadius: '50%', minWidth: '2.75rem', minHeight: '2.75rem',
        display: 'grid', placeItems: 'center', opacity: beat === index ? 1 : 0.35,
        boxShadow: beat === index ? `0 0 0 3px ${activeColor}` : undefined }}>
      {beatLabels?.[index] ?? index + 1}
    </span>)}
  </div>;
}

export function TimingPlot<M>({ result, label = 'Timing errors: above the centre is late; below is early.',
  className, style }: { result: TimingAnalysis<M>; label?: string; className?: string; style?: CSSProperties }) {
  const width = Math.max(320, result.targets.length * 24);
  const radius = Math.max(...result.targets.map(t => t.target.associationRadiusSeconds));
  const y = (error: number) => 80 - Math.max(-radius, Math.min(radius, error)) / radius * 55;
  const x = (index: number) => 15 + (width - 30) * (index + 0.5) / result.targets.length;
  return <div className={className} style={{ overflowX: 'auto', ...style }}>
    <svg role="img" aria-label={label} viewBox={`0 0 ${width} 160`} style={{ width: '100%', minWidth: width, maxHeight: 200 }}>
      <line x1="0" y1="80" x2={width} y2="80" stroke="currentColor" opacity="0.5" />
      {result.targets.map((target, index) => <g key={target.target.targetId}>
        <line x1={x(index) - 5} x2={x(index) + 5} y1={y(target.creditRadiusSeconds)} y2={y(target.creditRadiusSeconds)} stroke="currentColor" opacity="0.3" />
        <line x1={x(index) - 5} x2={x(index) + 5} y1={y(-target.creditRadiusSeconds)} y2={y(-target.creditRadiusSeconds)} stroke="currentColor" opacity="0.3" />
        {target.errorSeconds === undefined ? <text x={x(index)} y="85" fill="currentColor" textAnchor="middle">×</text>
          : <><line x1={x(index)} x2={x(index)} y1="80" y2={y(target.errorSeconds)} stroke="currentColor" />
            <circle cx={x(index)} cy={y(target.errorSeconds)} r={target.status === 'onTime' ? 4 : 6}
              fill={target.status === 'onTime' ? 'currentColor' : 'none'} stroke="currentColor" /></>}
        <text x={x(index)} y="150" fill="currentColor" textAnchor="middle" fontSize="10">{index + 1}</text>
      </g>)}
    </svg>
  </div>;
}
