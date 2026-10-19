import { pointer, flags } from './pointer.js';

/* A custom cursor: a dot exactly on the mouse and a disc that follows it a
   moment later, both drawn with mix-blend-mode: difference — white inverts
   whatever is under them, text included. Over links, buttons and cards the
   disc grows.

   Only with a mouse (index.js checks pointer: fine; reduced motion never
   loads this) and only while the mouse is in the window. The native cursor
   is hidden for exactly as long as this one is shown — .has-cursor on <html>
   — and comes back the moment it is not: a touch, leaving the window, or the
   switch in ?debug=1. */
const FOLLOW = 16;             // 1/s, the disc's lag
const GROW = 2;                // disc scale over something clickable

export function createCursor() {
  const root = document.documentElement;
  const make = name => {
    const el = document.createElement('i');
    el.className = name;
    el.setAttribute('aria-hidden', 'true');
    document.body.append(el);
    return el;
  };
  const disc = make('cursor-disc');
  const dot = make('cursor-dot');
  let x = 0, y = 0, s = 1, shown = false;

  return {
    update(dt) {
      const on = flags.cursor && pointer.inside && pointer.mouse;
      if (on !== shown) {
        shown = on;
        root.classList.toggle('has-cursor', on);
        /* appearing: start on the mouse, not gliding in from where it left */
        if (on) { x = pointer.x; y = pointer.y; }
      }
      if (!on) return;
      const k = 1 - Math.exp(-dt * FOLLOW);
      x += (pointer.x - x) * k;
      y += (pointer.y - y) * k;
      s += ((pointer.hot ? GROW : 1) - s) * (1 - Math.exp(-dt * 12));
      dot.style.transform = `translate3d(${pointer.x}px,${pointer.y}px,0)`;
      disc.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) scale(${s.toFixed(3)})`;
    }
  };
}
