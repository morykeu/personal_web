import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { ORDER } from './states.js';

gsap.registerPlugin(ScrollTrigger);

/* A section takes the scene over while its top edge travels from 85 % to
   35 % of the window height: the hand-over starts as the section comes into
   view and is done by the time its heading is being read. Scrubbed, so it
   runs backwards just as well; between hand-overs a state simply holds.
   clamp() keeps the windows inside the scrollable range — the last section
   never reaches 35 %, and its state would otherwise never fully arrive. */
const START = 'clamp(top 85%)';
const END = 'clamp(top 35%)';

export function initScroll() {
  /* Lenis replaces CSS smooth scrolling while it runs (style.css switches
     scroll-behavior off for html.lenis). */
  const lenis = new Lenis({ autoRaf: false });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add(time => lenis.raf(time * 1000));
  /* without this a slow frame makes GSAP stretch time and Lenis lurch */
  gsap.ticker.lagSmoothing(0);

  /* --- in-page links ------------------------------------------------------
     Handled here rather than with Lenis' own `anchors` option, which leaves
     the click's default action in place: the browser jumped as well, and
     Lenis, mid-tween, ignores native scroll, so the two fought. The default is
     taken away and what the native jump would have done is redone by hand —
     the hash goes into history and focus moves to the section.

     The 72px header offset comes from each section's scroll-margin-top, which
     Lenis subtracts itself — the same value the no-JS jump uses.

     A jump is remembered while it runs, so the scene can head straight for the
     destination's state instead of playing every section in between. Lenis
     clears userData as soon as anything else scrolls — a wheel, a key — so a
     jump the reader interrupts ends there too. */
  let jump = null;
  document.addEventListener('click', e => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest && e.target.closest('a[href^="#"]');
    const target = a && document.getElementById(decodeURIComponent(a.hash.slice(1)));
    if (!target) return;
    e.preventDefault();
    if (location.hash !== a.hash) history.pushState(null, '', a.hash);
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });

    const margin = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
    const y = target.getBoundingClientRect().top + lenis.animatedScroll - margin;
    jump = { y: Math.min(Math.max(y, 0), lenis.limit), to: target.id };
    lenis.scrollTo(target, { userData: { kmJump: true }, onComplete: () => { jump = null; } });
  });

  /* the loader locks the page; Lenis would otherwise still eat wheel input */
  const loader = document.getElementById('loader');
  if (loader && !loader.classList.contains('done')) {
    lenis.stop();
    window.addEventListener('km:ready', () => lenis.start(), { once: true });
  }

  /* --- hand-overs between neighbouring sections -------------------------- */
  const segments = [];
  let prev = null;
  for (const key of ORDER) {
    const el = document.getElementById(key);
    if (!el) continue;
    if (prev) {
      /* No pinning: pin spacers change the page height and would shift every
         anchor and the nav highlight with it. These triggers only measure. */
      const st = ScrollTrigger.create({ trigger: el, start: START, end: END });
      segments.push({ from: prev, to: key, st });
    }
    prev = key;
  }

  /* copy changes length with the language, and webfonts change metrics once
     they land — both move every trigger */
  window.addEventListener('km:lang', () => ScrollTrigger.refresh());
  document.fonts?.ready.then(() => ScrollTrigger.refresh());

  return {
    lenis,
    first: segments.length ? segments[0].from : ORDER[0],
    segments: segments.map(({ from, to }) => ({ from, to })),
    get y() { return lenis.animatedScroll; },
    /* the destination's scroll position while an anchor jump runs, else null */
    get jump() {
      if (jump && !lenis.userData?.kmJump) jump = null;
      return jump;
    },
    /* progress of every hand-over at scroll position y, 0 … 1, into out */
    progress(y, out) {
      segments.forEach(({ st }, i) => {
        const span = st.end - st.start;
        out[i] = span > 0 ? Math.min(Math.max((y - st.start) / span, 0), 1) : (y >= st.end ? 1 : 0);
      });
      return out;
    }
  };
}
