import { gsap } from 'gsap';
import { fine, settlePointer } from './pointer.js';
import { createProgress } from './progress.js';
import { createNavLine } from './navline.js';
import { createReveals } from './reveal.js';
import { createTimeline } from './timeline.js';
import { createMagnets } from './magnet.js';
import { createTilt } from './tilt.js';
import { createCursor } from './cursor.js';

/* Micro-animations in the sections. Loaded by the gate (src/scene/main.js)
   for everyone except prefers-reduced-motion, with or without WebGL; nothing
   here is needed to read the page.

   Every style rule they depend on is scoped to .has-motion, set here, so a
   page without this module — no JavaScript, reduced motion, a failed import
   — is exactly the static page. Everything animates transform or opacity,
   and all per-frame work runs in one callback on GSAP's ticker, the same
   requestAnimationFrame loop Lenis and the scene already share. Boxes are read
   on events (enter, resize, a change of language), never inside the frame. */
export function initMotion(scroll) {
  const root = document.documentElement;
  root.classList.add('has-motion');

  const progress = createProgress(scroll.lenis);
  const navline = createNavLine();
  const reveals = createReveals();
  createTimeline();

  /* the mouse-driven parts only where there is a mouse */
  const magnets = fine ? createMagnets('header .mark, .secnav a, .lang, #contact .mailto, #contact .links a') : null;
  const tilt = fine ? createTilt('#work .row, #projects .row, #handson .spec li') : null;
  const cursor = fine ? createCursor() : null;

  gsap.ticker.add((_, deltaMs) => {
    const dt = Math.min(deltaMs / 1000, 0.05);
    if (fine) settlePointer(dt);
    progress.update();
    reveals.update(dt);
    if (magnets) {
      magnets.update(dt);
      navline?.follow(magnets.offsetOf(navline.active));
    }
    tilt?.update(dt);
    cursor?.update(dt);
  });

  const relayout = () => { progress.resize(); navline?.place(); };
  new ResizeObserver(relayout).observe(document.body);
  window.addEventListener('km:lang', () => { reveals.settle(); relayout(); });
  document.fonts?.ready.then(relayout);
}
