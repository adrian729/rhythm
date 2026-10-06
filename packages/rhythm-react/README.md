# @polyhymnia/rhythm-react

Thin React peer integration over the rhythm browser controller. React 18–19; bring your own theme, audio backend and product policy.

```tsx
const { controller, snapshot } = useTimedAttempt(myAudioPort);
// Or follow only what a component shows: the snapshot advances with the playback clock.
// const controller = useTimedAttemptController(myAudioPort);
// const phase = useAttemptState(controller, snapshot => snapshot.phase);
// Explicit gesture: controller.start(plan, { offsetMs: 0, creditRadiusSeconds: 0.08 });
<BeatGuide plan={plan} phase="respond"
  playbackTimeSeconds={snapshot.playbackTimeSeconds}
  label="Your beat guide" beatLabels={['One', 'Two', 'Three', 'Four']}
  style={{ color: 'rebeccapurple' }} />
```

The hook subscribes and cancels on teardown, including development effect replay. It does not own taps, settings, retry/pass rules or storage. Keep the audio port identity stable during an attempt. Bind native input through the browser entry and provide a focusable pad.

`BeatGuide` accepts classes, styles, labels and active color; it only renders supplied time. The host chooses when guidance is allowed. It has no animated transitions. `TimingPlot` accepts classes/styles and an accessible description, drawing signed errors and per-target tolerance marks with `currentColor`. Both work without app CSS.
