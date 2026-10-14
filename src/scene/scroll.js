import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { states, ORDER } from './states.js';

gsap.registerPlugin(ScrollTrigger);

/* How fast the scene catches up with the section being read, per second.
   Exponential, so a jump across several sections still arrives smoothly
   instead of snapping. */
const DAMPING = 3;

const numeric = s => Object.fromEntries(Object.entries(s).filter(([, v]) => typeof v === 'number'));

export function initScroll() {
  /* Lenis replaces CSS smooth scrolling while it runs (style.css switches
     scroll-behavior off for html.lenis).

     The 72px header offset for anchors is NOT passed as `offset` here. Lenis
     1.3 already subtracts the target's scroll-margin-top, and every section
     carries scroll-margin-top: var(--header-h) — an explicit offset of -72 on
     top of that was measured landing sections 144px down instead of 72. One
     source of truth, the same one the no-JS jump uses. */
  const lenis = new Lenis({ anchors: true, autoRaf: false });
  lenis.on('scroll', ScrollTrigger.update);

  /* Lenis 1.3 starts its own scroll to the anchor but leaves the click's
     default action alone, so the browser jumps there as well — and Lenis,
     mid-tween, ignores native scroll events (onNativeScroll only syncs when it
     is idle), so the next frame drags the page back to where its tween began.
     Taking the default away leaves just the smooth scroll. This listener sits
     on document and Lenis' on window, so it runs first; Lenis does not check
     defaultPrevented and still scrolls.
     What the native jump would have done is redone by hand: the hash goes into
     history, and focus moves to the section so the next Tab starts there. */
  document.addEventListener('click', e => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest && e.target.closest('a[href^="#"]');
    const target = a && document.getElementById(decodeURIComponent(a.hash.slice(1)));
    if (!target) return;
    e.preventDefault();
    if (location.hash !== a.hash) history.pushState(null, '', a.hash);
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  });
  gsap.ticker.add(time => lenis.raf(time * 1000));
  /* without this a slow frame makes GSAP stretch time and Lenis lurch */
  gsap.ticker.lagSmoothing(0);

  /* the loader locks the page; Lenis would otherwise still eat wheel input */
  const loader = document.getElementById('loader');
  if (loader && !loader.classList.contains('done')) {
    lenis.stop();
    window.addEventListener('km:ready', () => lenis.start(), { once: true });
  }

  /* --- section → scene state --------------------------------------------- */
  let active = 'hero';
  const target = numeric(states.hero);
  const current = { ...target };

  for (const key of ORDER) {
    const el = document.getElementById(key);
    if (!el) continue;
    /* ranges [top at centre, bottom at centre] tile the page, so exactly one
       section is active at a time. No pinning: pin spacers change the page
       height and would shift every anchor and the nav highlight with it. */
    ScrollTrigger.create({
      trigger: el,
      start: 'top center',
      end: 'bottom center',
      onToggle: self => {
        if (!self.isActive) return;
        active = key;
        Object.assign(target, numeric(states[key]));
      }
    });
  }

  gsap.ticker.add((time, deltaMs) => {
    const k = 1 - Math.exp(-(deltaMs / 1000) * DAMPING);
    for (const p in target) current[p] += (target[p] - current[p]) * k;
  });

  /* copy changes length with the language, and webfonts change metrics once
     they land — both move every trigger */
  window.addEventListener('km:lang', () => ScrollTrigger.refresh());
  document.fonts?.ready.then(() => ScrollTrigger.refresh());

  return {
    lenis,
    state: current,
    get active() { return active; },
    get frame() { return states[active].frame; }
  };
}
