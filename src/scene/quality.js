/* Adaptive quality, in every browser. The scene's frame time (the interval
   between frames, which is what the reader sees) is averaged over one-second
   windows:

   - two windows in a row slower than 18 ms (under ~55 fps) take one step
     down: pixel ratio 1.5 → 1.25 → 1, and once at 1, the header gives up its
     backdrop blur for an opaque veil (.header-solid in style.css). The blur
     re-filters the moving scene and the page under it on every frame, which
     some browsers — Safari above all — do slowly; nothing in the page can
     ask a browser whether it is one of them, so it is decided by the frame
     time like everything else here.
   - a step back up needs the frame time to stay low for a while: under
     12 ms, or at the display's own rate — a 60 Hz screen never goes below
     16.7 ms, so "under 12" alone would never let it back up. The first try
     comes after 5 s; a step up that has to be taken back within 4 s doubles
     the wait, and after three such tries the level stays where it is for the
     rest of the visit. That is the hysteresis: it settles instead of
     flipping back and forth.

   Only frames the scene actually draws are counted. A frame over 250 ms is a
   pause (hidden tab, the system busy), not slowness — the window starts
   afresh — and the first second after every change is skipped, because
   reallocating the drawing buffer costs a frame of its own. */

const WINDOW = 1000;        // ms of frames per average
const DOWN = 18;            // ms: slower than this…
const DOWN_WINDOWS = 2;     // …this many windows in a row is one step down
const UP = 12;              // ms: faster than this, or at the display's rate…
const UP_WAIT = 5000;       // …for this long (doubling per failed try) is one step up
const PROBE = 4000;         // ms: a step down this soon after a step up was a failed try
const TRIES = 3;            // failed tries before the level stays put
const GAP = 250;            // ms: a longer frame is a pause
const SETTLE = 1000;        // ms skipped after every change
const START = 1500;         // ms skipped at the start: the intro and first-use hitches

export function createQuality({ renderer, cap, root }) {
  /* the pixel ratios to step through, from the cap down to 1 */
  const ratios = [...new Set([cap, 1.25, 1].filter(r => r <= cap))];
  const levels = ratios.map(dpr => ({ dpr, solid: false }));
  levels.push({ dpr: ratios[ratios.length - 1], solid: true });

  let auto = true, level = 0;
  let clock = 0, settleUntil = START;
  let sum = 0, n = 0, last = 0, fastest = Infinity;
  let bad = 0, goodFor = 0, wait = UP_WAIT, failed = 0, wentUp = -Infinity;

  function set(dpr, solid) {
    if (renderer.getPixelRatio() !== dpr) renderer.setPixelRatio(dpr);
    root.classList.toggle('header-solid', solid);
    sum = n = bad = goodFor = 0;
    settleUntil = clock + SETTLE;
  }
  const apply = () => set(levels[level].dpr, levels[level].solid);

  function judge(avg, span) {
    if (avg > DOWN) {
      goodFor = 0;
      if (++bad < DOWN_WINDOWS || level === levels.length - 1) return;
      if (clock - wentUp < PROBE) { failed++; wait *= 2; }
      level++;
      apply();
      return;
    }
    bad = 0;
    const good = avg < UP || avg <= fastest * 1.06;
    goodFor = good ? goodFor + span : 0;
    if (level === 0 || failed >= TRIES || goodFor < wait) return;
    level--;
    wentUp = clock;
    apply();
  }

  return {
    /* every drawn frame, with the time since the previous one */
    frame(ms) {
      if (ms > GAP) { sum = n = 0; return; }
      clock += ms;
      if (clock < settleUntil) return;
      sum += ms;
      n++;
      if (sum < WINDOW) return;
      const span = sum;
      last = sum / n;
      fastest = Math.min(fastest, last);
      sum = n = 0;
      if (auto) judge(last, span);
    },

    /* ?debug=1: fixed settings while testing, or back to automatic */
    manual(dpr, solid) {
      auto = false;
      set(dpr, solid);
    },
    automatic() {
      auto = true;
      level = 0;
      failed = 0;
      wait = UP_WAIT;
      wentUp = -Infinity;
      apply();
    },

    get status() {
      const { dpr, solid } = auto ? levels[level] : { dpr: renderer.getPixelRatio(), solid: root.classList.contains('header-solid') };
      const up = auto && level > 0 && failed < TRIES ? Math.max(0, wait - goodFor) : null;
      return { auto, level, levels: levels.length, dpr, solid, avg: last, failed, up };
    },
    ratios
  };
}
