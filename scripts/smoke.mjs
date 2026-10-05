import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const scratch = mkdtempSync(resolve(tmpdir(), 'polyhymnia-rhythm-'));
const run = (cmd, args, cwd = scratch) => execFileSync(cmd, args, { cwd, stdio: 'pipe' });
for (const name of ['rhythm', 'rhythm-react']) {
  const directory = resolve(root, 'packages', name);
  const manifest = JSON.parse(readFileSync(resolve(directory, 'package.json'), 'utf8'));
  run('pnpm', ['pack', '--pack-destination', scratch], directory);
  const destination = resolve(scratch, 'node_modules/@polyhymnia', name);
  mkdirSync(destination, { recursive: true });
  run('tar', ['-xzf', `polyhymnia-${name}-${manifest.version}.tgz`, '--strip-components=1', '-C', destination]);
}
for (const name of ['react', 'react-dom', '@types/react']) {
  const destination = resolve(scratch, 'node_modules', name);
  mkdirSync(resolve(destination, '..'), { recursive: true });
  symlinkSync(realpathSync(resolve(root, 'node_modules', name)), destination, 'dir');
}
writeFileSync(resolve(scratch, 'package.json'), JSON.stringify({ type: 'module' }));
writeFileSync(resolve(scratch, 'node.ts'), `import { analyzeTiming, timingAccuracy, type TimedAttemptPlan } from '@polyhymnia/rhythm';
const plan: TimedAttemptPlan<string> = { durationSeconds: 3, stimulus: 'opaque', phases: [{ kind: 'respond', startSeconds: 1, endSeconds: 3 }], responseWindow: { startSeconds: 1, endSeconds: 3 }, targets: [{ targetId: 'a', atSeconds: 1, associationRadiusSeconds: .2 }, { targetId: 'b', atSeconds: 2.1, associationRadiusSeconds: .2 }] };
if (timingAccuracy(analyzeTiming(plan, [{ atSeconds: 1, sequence: 0 }], .08)) !== 50) throw Error('Node contract failed');
`);
writeFileSync(resolve(scratch, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'NodeNext',
  moduleResolution: 'NodeNext', lib: ['ES2022'], types: [], strict: true, skipLibCheck: false, outDir: 'dist' }, include: ['node.ts'] }));
const tsc = resolve(root, 'node_modules/.bin/tsc');
run(tsc, ['-p', 'tsconfig.json']);
run('node', ['dist/node.js']);
writeFileSync(resolve(scratch, 'react.mjs'), `import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildPulsePlan } from '@polyhymnia/rhythm';
import { BeatGuide, useTimedAttempt } from '@polyhymnia/rhythm-react';
const port = { clockSourcesByPreference: ['example'], prepare: async () => {}, validateStimulus: () => ({ lastAudioEndSeconds: 0 }), play: () => { throw Error('No import-time playback'); }, playSilence: () => { throw Error('No import-time playback'); } };
function Consumer() { const { snapshot } = useTimedAttempt(port); return React.createElement(BeatGuide, { plan: buildPulsePlan({ pulseBpm: 90, beatsPerBar: 4, responseBars: 2 }), playbackTimeSeconds: snapshot.playbackTimeSeconds, phase: 'countIn', label: 'Host guide', style: { color: 'rebeccapurple' } }); }
const html = renderToStaticMarkup(React.createElement(Consumer));
if (!html.includes('Host guide') || !html.includes('rebeccapurple')) throw Error('React contract failed');
`);
run('node', ['react.mjs']);
writeFileSync(resolve(scratch, 'react.tsx'), `import { BeatGuide, TimingPlot, useTimedAttempt } from '@polyhymnia/rhythm-react';
import { analyzeTiming, buildPulsePlan } from '@polyhymnia/rhythm';
import type { RhythmPlaybackPort } from '@polyhymnia/rhythm/browser';
const plan = buildPulsePlan({ pulseBpm: 90, beatsPerBar: 4, responseBars: 2 });
export function Consumer({ port }: { port: RhythmPlaybackPort<readonly unknown[]> }) {
  const { snapshot } = useTimedAttempt(port);
  return <><BeatGuide plan={plan} playbackTimeSeconds={snapshot.playbackTimeSeconds} phase="countIn" style={{ color: 'purple' }} />
    <TimingPlot result={analyzeTiming(plan, [], .08)} /></>;
}
`);
writeFileSync(resolve(scratch, 'tsconfig.react.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'NodeNext',
  moduleResolution: 'NodeNext', lib: ['ES2022', 'DOM'], types: ['react'], jsx: 'react-jsx', strict: true,
  skipLibCheck: false, noEmit: true }, include: ['react.tsx'] }));
run(tsc, ['-p', 'tsconfig.react.json']);
console.log(`Packed Node (no DOM) and React consumers passed, including public declarations with skipLibCheck false. Scratch: ${scratch}`);
