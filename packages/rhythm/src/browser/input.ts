import type { AttemptRuntime } from './ports.js';

/** Legacy epoch timestamps are accepted only when clearly identified. No handler-time substitution. */
export function normalizeInputTimestamp(value: number, runtime: AttemptRuntime): number {
  const timestamp = value > 1e12 ? value - runtime.timeOriginEpochMs : value;
  if (!Number.isFinite(timestamp) || timestamp < 0 || timestamp > runtime.nowMs() + 100) {
    throw new RangeError('Input timestamps do not share the playback clock.');
  }
  return timestamp;
}

export function bindTapInput({ keyboardTarget, pointerTarget, method, onTap, isActive, ignoreKeyboardEvent, captureFromControls = false }:
  { keyboardTarget?: EventTarget; pointerTarget?: HTMLElement; method: 'keyboard' | 'pointer' | 'both';
    onTap: (timestampMs: number, method: 'keyboard' | 'pointer') => void; isActive: () => boolean;
    ignoreKeyboardEvent?: (event: KeyboardEvent) => boolean; captureFromControls?: boolean }): () => void {
  // Require release after a Space activation/held key; keyup belongs to the chosen target too.
  let held = false;
  const space = (key: KeyboardEvent) => key.code === 'Space' || (!key.code && (key.key === ' ' || key.key === 'Spacebar'));
  const keyDown = (event: Event) => {
    const key = event as KeyboardEvent;
    if (!space(key)) return;
    const target = key.target as HTMLElement | null;
    if (ignoreKeyboardEvent?.(key) || target?.closest?.('input,textarea,select,[contenteditable="true"]') ||
      (!captureFromControls && target?.closest?.('button,a'))) return;
    if (held || key.repeat) { if (isActive()) key.preventDefault(); return; }
    held = true;
    if (!isActive()) return;
    key.preventDefault();
    onTap(key.timeStamp, 'keyboard');
  };
  const keyUp = (event: Event) => { if (space(event as KeyboardEvent)) held = false; };
  // Keyup can happen outside this window after focus loss.
  const blur = () => { held = false; };
  const pointerDown = (event: PointerEvent) => {
    if (!isActive() || !event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    pointerTarget?.focus({ preventScroll: true });
    onTap(event.timeStamp, 'pointer');
  };
  if (method === 'keyboard' || method === 'both') {
    keyboardTarget?.addEventListener('keydown', keyDown);
    keyboardTarget?.addEventListener('keyup', keyUp);
    keyboardTarget?.addEventListener('blur', blur);
  }
  if (method === 'pointer' || method === 'both') pointerTarget?.addEventListener('pointerdown', pointerDown);
  return () => {
    keyboardTarget?.removeEventListener('keydown', keyDown);
    keyboardTarget?.removeEventListener('keyup', keyUp);
    keyboardTarget?.removeEventListener('blur', blur);
    pointerTarget?.removeEventListener('pointerdown', pointerDown);
  };
}
