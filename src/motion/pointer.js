/* The mouse, shared by everything that follows it: the magnetic links, the
   tilting cards and the lens in the 3D scene. One set of listeners; whoever
   needs the position reads it once per frame.

   `fine` is decided once, from the media query. A touch on a hybrid laptop
   still arrives as a pointer event, so `mouse` also tracks whether the last
   input really was a mouse — a finger has nothing to follow. */
export const fine = matchMedia('(pointer: fine)').matches;

export const pointer = {
  x: 0, y: 0,            // viewport px
  inside: false,         // within the window
  mouse: fine,           // last input came from a mouse
  hot: false,            // over something clickable or a card
  moved: 0,              // performance.now() of the last move
  clicked: 0             // performance.now() of the last press
};

/* What the lens effects may be switched between; ?debug=1 flips them. */
export const flags = { lens: true, aberration: true, attract: true };

const HOT = 'a, button, .lang, .tilt';
const isMouse = e => e.pointerType === 'mouse' || e.pointerType === 'pen';

if (fine) {
  window.addEventListener('pointermove', e => {
    pointer.mouse = isMouse(e);
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.inside = true;
    pointer.moved = performance.now();
  }, { passive: true });
  /* what is under the pointer: the event target, not a hit test — no layout */
  document.addEventListener('pointerover', e => {
    pointer.hot = !!(e.target.closest && e.target.closest(HOT));
  }, { passive: true });
  window.addEventListener('pointerdown', e => {
    pointer.mouse = isMouse(e);
    if (pointer.mouse && e.button === 0) pointer.clicked = performance.now();
  }, { passive: true });
  /* leaving the window: relatedTarget is null once the pointer is outside */
  document.addEventListener('pointerout', e => { if (!e.relatedTarget) pointer.inside = false; });
  window.addEventListener('blur', () => { pointer.inside = false; });
}
