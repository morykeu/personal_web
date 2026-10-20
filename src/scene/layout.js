/* Where the hero globe may sit, measured from the page rather than guessed
   from viewport fractions — the free space beside the hero copy changes with
   the font, the language and every breakpoint, so it is read from the DOM.

   Everything here is in CSS pixels of the viewport at scroll 0, which for a
   fixed canvas is the hero's own coordinate space.

   What fits (sphere diameter, share of the window height), measured on
   rendered pages:

                English        Czech
     1280×800   270px  34 %    224px  28 %
     1440×900   324px  36 %    272px  30 %
     1536×864   361px  42 %    309px  36 %
     1920×1080  518px  48 %    466px  43 %
     2560×1440  746px  52 %    709px  49 %

   The headline is the limit. Its size tops out at 5.6rem from ~1400px, so
   between 1280 and 1440 its second line runs to ~70 % of the width and leaves
   a column ~370px wide beside it (the Czech first line is longer still). A
   60 % globe would have to cover the ends of its lines. Capping the headline
   at 13ch — four lines instead of three — would free ~55 % at both sizes; that
   is a change to the design, so it is left as a proposal. */

/* clearance from the headline's letters */
const CLEAR_INK = 40;
/* clearance from the rest of the hero copy: the scene dims itself for about
   60px around text (dim.js), and the globe beside the copy stays out of that */
const CLEAR_COPY = 60;
/* from the window edges, and from the bottom of the header */
const EDGE = 16;
/* the globe's radius → the radius of everything drawn around it in the hero:
   the hugging rings (orbits.js, up to 1.14), the arcs and most of the aura,
   whose last few per cent fade to nothing */
const HALO = 1.15;
/* smaller than this share of the window's shorter side and the globe would be
   a speck beside the copy — it moves behind it instead, dimmed. Low enough
   that the Czech headline at 1280×800 still keeps it beside, bright. */
const MIN_SHARE = 0.25;
const STEP = 6;

function docRect(r, sy) {
  return { l: r.left, r: r.right, t: r.top + sy, b: r.bottom + sy };
}

/* One rectangle per line of the headline, from its ink rather than its box:
   the box is a block capped at 17ch, while the lines are ragged — the last one
   is far shorter, and a round globe can tuck in beside it. */
function inkLines(el, sy) {
  const range = document.createRange();
  range.selectNodeContents(el);
  const lines = [];
  for (const r of range.getClientRects()) {
    if (r.width < 1) continue;
    const line = lines.find(l => Math.abs(l.t - (r.top + sy)) < 8);
    if (line) {
      line.l = Math.min(line.l, r.left);
      line.r = Math.max(line.r, r.right);
      line.b = Math.max(line.b, r.bottom + sy);
    } else {
      lines.push(docRect(r, sy));
    }
  }
  return lines;
}

/* the largest circle inside the bounds that keeps every obstacle at its
   clearance — a coarse grid, then a 1px pass around the best cell */
function largestCircle(bounds, obstacles) {
  const radius = (cx, cy, best) => {
    let r = Math.min(cx - bounds.l, bounds.r - cx, cy - bounds.t, bounds.b - cy);
    for (const o of obstacles) {
      if (r <= best) return r;
      const dx = Math.max(o.l - cx, 0, cx - o.r);
      const dy = Math.max(o.t - cy, 0, cy - o.b);
      r = Math.min(r, Math.hypot(dx, dy) - o.clear);
    }
    return r;
  };
  let best = { r: 0, cx: 0, cy: 0 };
  const scan = (x0, x1, y0, y1, step) => {
    for (let cx = x0; cx <= x1; cx += step) {
      for (let cy = y0; cy <= y1; cy += step) {
        const r = radius(cx, cy, best.r);
        if (r > best.r) best = { r, cx, cy };
      }
    }
  };
  scan(bounds.minX, bounds.r, bounds.t, bounds.b, STEP);
  scan(best.cx - STEP, best.cx + STEP, best.cy - STEP, best.cy + STEP, 1);
  /* Beside a tall block of text the width is usually the limit, and then a
     whole column of centres fits the same circle; the first one found would
     be the topmost. The middle of that column is the calmer choice. */
  let y0 = best.cy, y1 = best.cy;
  while (y0 - 1 >= bounds.t && radius(best.cx, y0 - 1, -Infinity) >= best.r - 0.5) y0--;
  while (y1 + 1 <= bounds.b && radius(best.cx, y1 + 1, -Infinity) >= best.r - 0.5) y1++;
  best.cy = (y0 + y1) / 2;
  return best;
}

/* → { cx, cy, d, mode, ink }: centre and diameter of the globe in px, and the
   headline's lines in document px.
   beside  the globe has its own space next to the copy, at full light
   behind  there is no such space; it sits behind the copy, dimmed (scene.js) */
export function heroPlacement(W, H) {
  const sy = window.scrollY;
  const hero = document.getElementById('hero');
  const h1 = hero.querySelector('h1');
  const hops = document.getElementById('hops');
  const top = document.querySelector('header').getBoundingClientRect().height + EDGE;

  const copy = [hero.querySelector('.lede'), hero.querySelector('.status'), hops]
    .map(el => ({ ...docRect(el.getBoundingClientRect(), sy), clear: CLEAR_COPY }));
  const ink = inkLines(h1, sy);
  const obstacles = [...ink.map(l => ({ ...l, clear: CLEAR_INK })), ...copy];

  /* right half only: on a wide screen the margin left of the copy is free
     too, but the composition reads left to right — words, then the globe */
  const circle = largestCircle({ l: EDGE, r: W - EDGE, t: top, b: H - EDGE, minX: W / 2 }, obstacles);
  const d = (2 * circle.r) / HALO;
  if (d >= MIN_SHARE * Math.min(W, H)) {
    return { cx: circle.cx, cy: circle.cy, d, mode: 'beside', ink };
  }

  /* Behind: the largest circle inside the copy's column, above the traceroute,
     pushed to its right edge — the copy is left-aligned, so that is where the
     text is thinnest. On a phone the column is the screen width. */
  const box = hero.getBoundingClientRect();
  const cs = getComputedStyle(hero);
  const left = box.left + parseFloat(cs.paddingLeft);
  const right = box.right - parseFloat(cs.paddingRight);
  const bottom = Math.min(H - EDGE, hops.getBoundingClientRect().top + sy - 24);
  const r = Math.max(Math.min(right - left, bottom - top) / 2, 0);
  return { cx: right - r, cy: (top + bottom) / 2, d: (2 * r) / HALO, mode: 'behind', ink };
}
