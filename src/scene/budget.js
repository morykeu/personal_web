import { CanvasTexture, LinearFilter } from 'three';

/* The contrast budget: for every point of the window, how bright the scene
   may be there and still leave the text above it at 4.5:1.

   With a mouse, the lens has to show over text too — and the CSS scrims sit
   between the canvas and the text, so anything drawn in the canvas ends up
   under them. Instead of scrims, then, the scene pass (lens.js) dims itself
   under text, by exactly as much as each piece of text needs: muted copy
   allows almost nothing behind it, the white headline a fair amount, the
   violet word something in between. Everything else stays as bright as the
   scene makes it.

   Each line of text is a rectangle with a limit, worked out from its own
   colour and opacity, painted into a small canvas (a quarter of the window
   in each direction) with "darken", so overlapping lines keep the stricter
   of the two. The shader reads one texel per pixel.

   The rectangles are read from the page on events — load, resize, a
   change of language, fonts, a nav item lighting up — and re-read every
   frame only for what is moving: a section or card still sliding in. */

const SCALE = 4;               // CSS px per budget pixel
/* Around each line the full limit holds for PAD px (the magnet's pull, a
   card's tilt), then eases off over three more steps, so the dimmed area ends
   in a soft halo like the old scrims rather than a hard box. Concentric
   rectangles rather than a canvas blur filter: WebKit has no ctx.filter and
   drew hard boxes, and stepping outwards never lifts the limit over the text
   itself, where a blur did. */
const PAD = 12;
/* [further out, px; × the limit] — multiples of the luminance itself, so a
   strict limit (muted copy) eases off as gently as a lax one */
const RAMP = [[5, 1.6], [10, 2.8], [15, 5], [20, 9], [25, 16]];
const RATIO = 4.7;             // the target, a little above 4.5
/* A tilting card lays a violet sheen and its hover tint over whatever the
   canvas shows (style.css), which lifts the background by more the brighter
   it already is. Fitted against the sheen at full strength. */
const tilted = lmax => (lmax - 0.009) * 0.62;
const MOVERS = '.rv, .row, .spec li';
const LINKS = 'a, button';

const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);

export function createBudget() {
  const wrap = document.querySelector('.wrap');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const texture = new CanvasTexture(canvas);
  texture.minFilter = texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;

  let runs = [];               // { node, el, fixed, lmax, rects }
  const moving = new Set();
  let stale = true, lastY = NaN;

  /* the brightest background this element's text can take */
  function limit(el, styles) {
    const cs = styles(el);
    const color = (el instanceof SVGElement ? cs.fill : cs.color).match(/[\d.]+/g).map(Number);
    let op = color.length > 3 ? color[3] : 1;
    for (let e = el; e && e !== wrap; e = e.parentElement) op *= parseFloat(styles(e).opacity);
    /* not shown yet (a section before its reveal): assume the faintest it
       will ever be drawn at, the traceroute labels' .9 */
    if (op < 0.1) op = 0.9;
    const over = (c, ink) => c * op + ink * (1 - op);
    const L = lum(over(color[0], 5), over(color[1], 5), over(color[2], 10));
    let lmax = (L + 0.05) / RATIO - 0.05;
    if (el.closest('.tilt')) lmax = tilted(lmax);
    return Math.max(lmax, 0.0012);
  }

  function rectsOf(node, fixed) {
    const range = document.createRange();
    range.selectNodeContents(node);
    const sy = fixed ? 0 : window.scrollY;
    const out = [];
    for (const r of range.getClientRects()) {
      if (r.width < 1 || r.height < 1) continue;
      out.push({ l: r.left, r: r.right, t: r.top + sy, b: r.bottom + sy });
    }
    return out;
  }

  function measure() {
    const cache = new Map();
    const styles = el => { let s = cache.get(el); if (!s) cache.set(el, s = getComputedStyle(el)); return s; };
    const next = [];
    const walker = document.createTreeWalker(wrap, NodeFilter.SHOW_TEXT, {
      acceptNode: n => (n.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT)
    });
    for (let n; (n = walker.nextNode()); ) {
      const el = n.parentElement;
      if (!el || el.closest('script, style, noscript')) continue;
      const fixed = !!el.closest('header');
      const rects = rectsOf(n, fixed);
      if (rects.length) next.push({ node: n, el, fixed, lmax: limit(el, styles), rects });
    }
    runs = next;
    stale = true;
  }

  let timer = 0;
  const soon = () => { clearTimeout(timer); timer = setTimeout(measure, 80); };
  new ResizeObserver(soon).observe(document.body);
  window.addEventListener('km:lang', soon);
  document.fonts?.ready.then(soon);
  /* a nav item or a language button changing colour changes its limit */
  const marks = new MutationObserver(soon);
  document.querySelectorAll('.secnav a, .lang button').forEach(el =>
    marks.observe(el, { attributes: true, attributeFilter: ['aria-current', 'aria-pressed'] }));
  /* A link changes colour under the mouse — the contact address goes from
     near-white to magenta, which takes far less behind it. While a link is
     hovered, and for a moment after while its colour eases back, its limit
     is read again every frame from the colour it has right then. */
  const hovered = new Map();   // link → time until which to keep watching
  document.addEventListener('pointerover', e => {
    const a = e.target.closest && e.target.closest(LINKS);
    if (a) hovered.set(a, Infinity);
  }, { passive: true });
  document.addEventListener('pointerout', e => {
    const a = e.target.closest && e.target.closest(LINKS);
    if (a && !(e.relatedTarget && a.contains(e.relatedTarget))) hovered.set(a, performance.now() + 500);
  }, { passive: true });
  /* sliding in: follow the text frame by frame until it settles */
  document.addEventListener('transitionrun', e => { if (e.target.matches?.(MOVERS)) moving.add(e.target); });
  const settled = e => {
    if (!moving.delete(e.target)) return;
    if (!moving.size) soon();
  };
  document.addEventListener('transitionend', settled);
  document.addEventListener('transitioncancel', settled);
  measure();

  return {
    texture,
    /* paint the budget for this frame; dy: how far the page moved since the
       last one, added to the padding so a frame of lag never uncovers text */
    update(W, H) {
      const sy = window.scrollY;
      const dy = Number.isNaN(lastY) ? 0 : Math.abs(sy - lastY);
      if (hovered.size) {
        const now = performance.now();
        const fresh = el => getComputedStyle(el);
        for (const [a, until] of hovered) {
          for (const run of runs) {
            if (!a.contains(run.el)) continue;
            const l = limit(run.el, fresh);
            if (Math.abs(l - run.lmax) > 1e-5) { run.lmax = l; stale = true; }
          }
          if (now > until) hovered.delete(a);
        }
      }
      if (moving.size) {
        for (const run of runs) {
          for (const el of moving) if (el.contains(run.el)) { run.rects = rectsOf(run.node, run.fixed); stale = true; break; }
        }
      }
      if (!stale && dy === 0) return;
      stale = false;
      lastY = sy;

      const w = Math.ceil(W / SCALE), h = Math.ceil(H / SCALE);
      /* exact, not 1/SCALE: the texture spans the canvas, which is W wide,
         and w × SCALE rounds up past it */
      const kx = w / W, ky = h / H;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        texture.dispose();      // a new size needs a new GPU texture
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      /* "darken" keeps the stricter value wherever two shapes overlap, so the
         order the rings are drawn in does not matter */
      ctx.globalCompositeOperation = 'darken';
      const pad = PAD + Math.min(dy, 60);   // plus a frame of scroll lag
      const reach = pad + RAMP[RAMP.length - 1][0];
      for (const run of runs) {
        const off = run.fixed ? 0 : sy;
        for (const r of run.rects) {
          const t = r.t - off, b = r.b - off;
          if (b < -reach || t > H + reach) continue;
          for (const [extra, times] of [[0, 1], ...RAMP]) {
            const g = Math.round(Math.sqrt(Math.min(run.lmax * times, 1)) * 255), p = pad + extra;
            ctx.fillStyle = `rgb(${g},${g},${g})`;
            ctx.fillRect((r.l - p) * kx, (t - p) * ky, (r.r - r.l + 2 * p) * kx, (b - t + 2 * p) * ky);
          }
        }
      }
      texture.needsUpdate = true;
    }
  };
}
