/* The mouse, shared by everything that follows it: the magnetic links, the
   tilting cards, the custom cursor and the lens in the 3D scene. One set of
   listeners; whoever needs the position reads it once per frame.

   `fine` is decided once, from the media query. A touch on a hybrid laptop
   still arrives as a pointer event, so `mouse` also tracks whether the last
   input really was a mouse — a finger has nothing to follow. */
export const fine = matchMedia('(pointer: fine)').matches;

export const pointer = {
  x: 0, y: 0,            // viewport px
  vx: 0, vy: 0,          // px/s, smoothed; decays once the mouse stops
  inside: false,         // within the window
  mouse: fine,           // last input came from a mouse
  overCopy: false,       // over text, where the lens has to stay subtle
  hot: false,            // over something clickable or a card
  moved: 0               // performance.now() of the last move
};

/* What the cursor effects may be switched between; ?debug=1 flips them. */
export const flags = { cursor: true, lens: true, aberration: true, ripple: true, attract: true };

const COPY = 'p, h1, h2, h3, li, a, button, .lede, .status, .hops, .mailto, .tl .item, .row';
const HOT = 'a, button, .lang, .tilt';
const isMouse = e => e.pointerType === 'mouse' || e.pointerType === 'pen';

if (fine) {
  window.addEventListener('pointermove', e => {
    pointer.mouse = isMouse(e);
    const now = performance.now();
    const dt = (now - pointer.moved) / 1000;
    if (pointer.inside && dt > 0 && dt < 0.1) {
      const k = Math.min(dt * 20, 1);
      pointer.vx += ((e.clientX - pointer.x) / dt - pointer.vx) * k;
      pointer.vy += ((e.clientY - pointer.y) / dt - pointer.vy) * k;
    } else if (dt >= 0.1) {
      pointer.vx = pointer.vy = 0;
    }
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.inside = true;
    pointer.moved = now;
  }, { passive: true });
  /* what is under the pointer: the event target, not a hit test — no layout */
  document.addEventListener('pointerover', e => {
    const t = e.target;
    pointer.overCopy = !!(t.closest && t.closest(COPY));
    pointer.hot = !!(t.closest && t.closest(HOT));
  }, { passive: true });
  window.addEventListener('pointerdown', e => { pointer.mouse = isMouse(e); }, { passive: true });
  /* leaving the window: relatedTarget is null once the pointer is outside */
  document.addEventListener('pointerout', e => { if (!e.relatedTarget) pointer.inside = false; });
  window.addEventListener('blur', () => { pointer.inside = false; });
}

/* Once per frame: a mouse that stopped sends no more events, so its speed
   is let go here rather than left at its last value. */
export function settlePointer(dt) {
  if (performance.now() - pointer.moved < 50) return;
  const k = Math.exp(-dt * 10);
  pointer.vx *= k;
  pointer.vy *= k;
}
