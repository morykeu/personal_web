/* Adaptive quality, in every browser. The scene's frame time (the interval
   between frames, which is what the reader sees) is looked at in one-second
   windows, and each window is one of three things:

   - a frame-rate cap: frames at ~33 ms and hardly ever faster (nine in ten
     slower than 27 ms — under load a 60 Hz display still slips in 16.7 ms
     frames) while the scene's own work is light. That is the browser
     holding animation at 30 fps — Safari in Low Power Mode, Chrome's Energy
     Saver — and no amount of lowering quality changes it. What it does hurt
     is Lenis, which scrolls inside those same frames: after two such windows
     the wheel goes back to the browser (native scrolling is composited at
     the display's rate whatever the frame rate), and Lenis returns after
     three windows at the full rate again. A cap can come and go while the
     page is open (a charger plugged in), so this is watched all along.
   - load: slow (average over 18 ms) without the cap's signature — uneven
     frames, a steady rate no cap runs at (a GPU that manages 17 fps), or the
     scene's own work heavy. Two such windows in a row take one step down: pixel
     ratio 1.5 → 1.25 → 1, and once at 1, the header gives up its backdrop
     blur for an opaque veil (.header-solid in style.css). The blur
     re-filters the moving scene and the page under it on every frame, which
     some browsers do slowly; nothing in the page can ask a browser whether
     it is one of them, so it is decided by the frame time like the rest.
   - fine: a step back up needs that for a while — under 12 ms, or at the
     display's own rate (a 60 Hz screen never goes below 16.7 ms, so "under
     12" alone would never let it back up). The first try comes after 5 s; a
     step up that has to be taken back within 4 s doubles the wait, and after
     three such tries the level stays where it is for the rest of the visit.
     That is the hysteresis: it settles instead of flipping back and forth.

   Only frames the scene actually draws are counted. A frame over 250 ms is a
   pause (hidden tab, the system busy), not slowness — the window starts
   afresh — and the first second after every change is skipped, because
   reallocating the drawing buffer costs a frame of its own. */

const WINDOW = 1000;        // ms of frames per window
const DOWN = 18;            // ms: slower than this on average…
const DOWN_WINDOWS = 2;     // …this many load windows in a row is one step down
const UP = 12;              // ms: faster than this, or at the display's rate…
const UP_WAIT = 5000;       // …for this long (doubling per failed try) is one step up
const PROBE = 4000;         // ms: a step down this soon after a step up was a failed try
const TRIES = 3;            // failed tries before the level stays put
const GAP = 250;            // ms: a longer frame is a pause
const SETTLE = 1000;        // ms skipped after every change
const START = 1500;         // ms skipped at the start: the intro and first-use hitches
/* the cap */
const CAP = [31, 36];       // ms: a median in here is ~30 fps…
const FLOOR = 27;           // …and with nine frames in ten slower than this, a cap
const LIGHT = 8;            // ms of scene work per frame: under this it is not our load
const FULL = 20;            // ms: a median under this is the full rate again
const CAP_ENTER = 2;        // windows to decide there is a cap…
const CAP_LEAVE = 3;        // …and to decide it is gone

export function createQuality({ renderer, cap, root, scroll }) {
  /* the pixel ratios to step through, from the cap down to 1 */
  const ratios = [...new Set([cap, 1.25, 1].filter(r => r <= cap))];
  const levels = ratios.map(dpr => ({ dpr, solid: false }));
  levels.push({ dpr: ratios[ratios.length - 1], solid: true });

  let auto = true, level = 0;
  let clock = 0, settleUntil = START;
  let frames = [], sum = 0, last = 0, fastest = Infinity;
  let bad = 0, goodFor = 0, wait = UP_WAIT, failed = 0, wentUp = -Infinity;
  let capped = false, capRun = 0, fullRun = 0;

  function set(dpr, solid) {
    if (renderer.getPixelRatio() !== dpr) renderer.setPixelRatio(dpr);
    root.classList.toggle('header-solid', solid);
    frames = [];
    sum = bad = goodFor = 0;
    settleUntil = clock + SETTLE;
  }
  const apply = () => set(levels[level].dpr, levels[level].solid);

  /* the cap only ever changes how the wheel scrolls, and only when automatic */
  function watchCap(isCap, isFull) {
    capRun = isCap ? capRun + 1 : 0;
    fullRun = isFull ? fullRun + 1 : 0;
    if (!capped && capRun >= CAP_ENTER) capped = true;
    else if (capped && fullRun >= CAP_LEAVE) capped = false;
    else return;
    if (auto) scroll.smooth = !capped;
  }

  function judge(avg, span, load) {
    if (load) {
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
    /* every drawn frame: the time since the previous one, and how long the
       scene's own work took per frame lately */
    frame(ms, work) {
      if (ms > GAP) { frames = []; sum = 0; return; }
      clock += ms;
      if (clock < settleUntil) return;
      frames.push(ms);
      sum += ms;
      if (sum < WINDOW) return;
      const span = sum, n = frames.length;
      const sorted = frames.sort((a, b) => a - b);
      const median = sorted[n >> 1];
      last = span / n;
      frames = [];
      sum = 0;

      const isCap = work < LIGHT && median >= CAP[0] && median <= CAP[1] && sorted[Math.floor(n * 0.1)] >= FLOOR;
      watchCap(isCap, median < FULL);
      if (!isCap) fastest = Math.min(fastest, last);
      if (!auto) return;
      /* a cap is never load: it neither counts towards a step down nor lets
         one that was building up continue, and while it is still being
         decided the level is left alone altogether */
      if (isCap) {
        bad = 0;
        if (!capped) return;
      }
      judge(last, span, !isCap && last > DOWN);
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
      scroll.smooth = !capped;
      apply();
    },

    get status() {
      const { dpr, solid } = auto ? levels[level] : { dpr: renderer.getPixelRatio(), solid: root.classList.contains('header-solid') };
      const up = auto && level > 0 && failed < TRIES ? Math.max(0, wait - goodFor) : null;
      return { auto, level, levels: levels.length, dpr, solid, avg: last, failed, up, capped };
    },
    ratios
  };
}
