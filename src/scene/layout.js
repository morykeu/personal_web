/* Where the globe may sit, measured from the page itself rather than guessed
   from viewport fractions — the free space beside the hero copy changes with
   the font, the language and every breakpoint, so it is read from the DOM.

   Everything here is in CSS pixels in the viewport at scroll 0, which for a
   fixed canvas is the hero's own coordinate space. */

/* Clearance between the copy and the composition. It also exceeds the 58px
   reach of the scrims behind the muted copy and the traceroute (style.css), so
   none of them can bite into the globe. */
const GAP = 64;
/* The globe body stays this far inside the canvas; only the orbit rings may
   run off the edge. */
const EDGE = 16;
/* Less room than this beside the copy and the globe would be a speck, so it
   moves behind the text instead, dimmed. */
const MIN_W = 220;
const MIN_H = 260;

const docTop = el => el.getBoundingClientRect().top + window.scrollY;

/* Right edge of the ink rather than of the box. The headline is a block capped
   at 17ch, and at 1440px that box runs 75px past its longest line — space the
   globe can use, since nothing is drawn there. */
function inkRight(el) {
  const range = document.createRange();
  range.selectNodeContents(el);
  let right = -Infinity;
  for (const r of range.getClientRects()) if (r.width > 0) right = Math.max(right, r.right);
  return right;
}

export function heroFrame(canvasWidth) {
  const hero = document.getElementById('hero');
  const header = document.querySelector('header');
  const h1 = hero.querySelector('h1');
  const lede = hero.querySelector('.lede');
  const status = hero.querySelector('.status');

  const top = header.getBoundingClientRect().height + 24;
  const tracerouteTop = docTop(document.getElementById('hops'));

  /* The headline is measured by its ink: it has no scrim while the globe is
     beside it (it is the lightest text on the page and stays above 4.5:1 over
     the starfield alone — see style.css). The muted lede and status do keep a
     scrim, so their boxes count. */
  const besideLeft = Math.max(
    inkRight(h1),
    lede.getBoundingClientRect().right,
    status.getBoundingClientRect().right
  ) + GAP;
  const beside = { left: besideLeft, right: canvasWidth - EDGE, top, bottom: tracerouteTop - GAP };
  if (beside.right - beside.left >= MIN_W && beside.bottom - beside.top >= MIN_H) {
    return { ...beside, mode: 'beside' };
  }

  const cs = getComputedStyle(hero);
  return {
    left: parseFloat(cs.paddingLeft),
    right: canvasWidth - parseFloat(cs.paddingRight),
    top,
    bottom: tracerouteTop - 24,
    mode: 'behind'
  };
}
