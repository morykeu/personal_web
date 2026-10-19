import { gsap } from 'gsap';

/* Everything that happens when a section is revealed. app.js still decides
   when that is — it adds .in to a .rv section — and the section's own fade
   stays a CSS transition. GSAP never touches a .rv element; it only drives the
   terminal caret, which is new.

     cards     rows in #work and #projects arrive one after another: a CSS
               transition on the row, delayed by its index (--i, set here)
     numbers   the section number scrambles for ~400 ms before it settles
     hands-on  the items print like terminal output, a caret riding the line
               being written

   Sections already revealed when this runs (a reload halfway down) are left
   as they are. */

const DECODE = 0.4;            // seconds
const FLICKER = 0.04;          // seconds between scrambled frames
const GLYPHS = '0123456789ABCDEF#%/<>';
const STEP = 70;               // ms between printed lines
const DELAY = 220;             // ms before the first line

export function createReveals() {
  for (const sel of ['#work .row', '#projects .row', '#handson .spec li']) {
    document.querySelectorAll(sel).forEach((el, i) => el.style.setProperty('--i', i));
  }
  const handson = document.getElementById('handson');
  if (handson) {
    handson.style.setProperty('--step', `${STEP}ms`);
    handson.style.setProperty('--delay', `${DELAY}ms`);
  }

  /* --- section numbers --------------------------------------------------- */
  const scrambling = new Map();
  function decode(span) {
    const text = span.textContent;
    if (!scrambling.has(span)) scrambling.set(span, { text, t: 0, next: 0 });
  }
  /* Only the numbers change text, and they carry no data-cs — setLang never
     rewrites them. Still, a language switch ends every scramble at once. */
  function settle() {
    for (const [span, s] of scrambling) span.textContent = s.text;
    scrambling.clear();
  }

  /* --- the hands-on caret ------------------------------------------------ */
  function print(section) {
    const list = section.querySelector('.spec');
    if (!list) return;
    const box = section.getBoundingClientRect();
    /* the end of each item's text, from its ink — the items are grid cells,
       far wider than their words */
    const ends = [...list.children].map(li => {
      const range = document.createRange();
      range.selectNodeContents(li);
      const rects = range.getClientRects();
      const r = rects[rects.length - 1];
      return r ? { x: r.right - box.left + 5, y: r.top - box.top, h: r.height } : null;
    });
    const caret = document.createElement('i');
    caret.className = 'term-caret';
    caret.setAttribute('aria-hidden', 'true');
    section.append(caret);
    const tl = gsap.timeline({ onComplete: () => caret.remove() });
    ends.forEach((e, i) => {
      if (!e) return;
      /* a frame after its line, so it never shows ahead of the text */
      tl.set(caret, { x: e.x, y: e.y, height: e.h, opacity: 1 }, (DELAY + i * STEP + 34) / 1000);
    });
    /* a few blinks on the last line, then gone */
    for (let k = 0; k < 3; k++) {
      tl.set(caret, { opacity: 0 }, `+=0.4`);
      tl.set(caret, { opacity: 1 }, `+=0.4`);
    }
    tl.to(caret, { opacity: 0, duration: 0.3 }, '+=0.4');
  }

  /* --- watching for reveals ---------------------------------------------- */
  const pending = [...document.querySelectorAll('section.rv')].filter(s => !s.classList.contains('in'));
  const done = new Set();
  const reveal = section => {
    if (done.has(section)) return;
    done.add(section);
    const num = section.querySelector('.eyebrow > span[aria-hidden="true"]');
    if (num) decode(num);
    if (section.id === 'handson') print(section);
  };
  const watcher = new MutationObserver(records => {
    for (const r of records) if (r.target.classList.contains('in')) reveal(r.target);
  });
  pending.forEach(s => watcher.observe(s, { attributes: true, attributeFilter: ['class'] }));

  return {
    settle,
    update(dt) {
      for (const [span, s] of scrambling) {
        s.t += dt;
        if (s.t >= DECODE) {
          span.textContent = s.text;
          scrambling.delete(span);
          continue;
        }
        if (s.t < s.next) continue;
        s.next = s.t + FLICKER;
        /* characters settle left to right; the rest keep flickering */
        const fixed = Math.floor((s.t / DECODE) * s.text.length);
        let out = '';
        for (let i = 0; i < s.text.length; i++) {
          out += i < fixed ? s.text[i] : GLYPHS[(Math.random() * GLYPHS.length) | 0];
        }
        span.textContent = out;
      }
    }
  };
}
