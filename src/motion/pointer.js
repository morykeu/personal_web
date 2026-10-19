/* The mouse, shared by everything that follows it. One set of listeners;
   whoever needs the position reads it once per frame.

   `fine` is decided once, from the media query. A touch on a hybrid laptop
   still arrives as a pointer event, so `mouse` also tracks whether the last
   input really was a mouse — a finger has nothing to follow. */
export const fine = matchMedia('(pointer: fine)').matches;

export const pointer = {
  x: 0, y: 0,            // viewport px
  inside: false,         // within the window
  mouse: fine            // last input came from a mouse
};

const isMouse = e => e.pointerType === 'mouse' || e.pointerType === 'pen';

if (fine) {
  window.addEventListener('pointermove', e => {
    pointer.mouse = isMouse(e);
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.inside = true;
  }, { passive: true });
  window.addEventListener('pointerdown', e => { pointer.mouse = isMouse(e); }, { passive: true });
  /* leaving the window: relatedTarget is null once the pointer is outside */
  document.addEventListener('pointerout', e => { if (!e.relatedTarget) pointer.inside = false; });
  window.addEventListener('blur', () => { pointer.inside = false; });
}
