/* The link between the globe and the traceroute in the hero: once the scene
   is in, a packet leaves the globe, arcs down to the first hop and lands on
   it, and only then does the trace start drawing.

   It is a DOM element rather than part of the WebGL scene, so it lands on
   the hop's own circle to the pixel, whatever the scene's projection does.
   Inside #hops at z-index -1 the dot is painted above the canvas and below
   every letter.

   Robust to resizing and scrolling mid-flight: both ends are read again every
   frame — the start from the globe's current place on screen, the end from
   the hop's own box — so the arc is never computed against stale geometry.

   app.js waits for `km:trace` only while <html> has data-trace-handoff, and
   for at most 2.5 s; a hidden tab, a lost context or a slow frame cannot keep
   the trace from starting. */

const LAUNCH = 0.8;      // seconds after the reveal: the globe is visible by then
const FLIGHT = 1.0;
/* the first hop pops in .15 s into the trace animation (index.html), so the
   trace starts that much before the packet arrives */
const LEAD = 0.15;
const SAG = 0.1;         // how far the arc bows below the chord, share of its length

const ease = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export function createTrace(root) {
  const hops = document.getElementById('hops');
  const hop = hops?.querySelector('.node');
  if (!hop || hops.classList.contains('ready')) return null;

  root.setAttribute('data-trace-handoff', '');
  const dot = document.createElement('i');
  dot.className = 'trace-packet';
  dot.setAttribute('aria-hidden', 'true');

  let t = -1, handed = false, done = false;
  const handOver = () => {
    if (handed) return;
    handed = true;
    window.dispatchEvent(new CustomEvent('km:trace'));
  };
  const finish = () => {
    done = true;
    handOver();
    root.removeAttribute('data-trace-handoff');
  };

  return {
    /* globe: its circle on screen, { cx, cy, r } in viewport px */
    update(dt, sinceReveal, globe) {
      if (done) return;
      /* app.js gave up waiting and started the trace itself */
      if (hops.classList.contains('ready') && !handed) { finish(); return; }
      if (t < 0) {
        if (sinceReveal < LAUNCH) return;
        t = 0;
        hops.append(dot);
      }
      t += dt / FLIGHT;

      const box = hops.getBoundingClientRect();
      const h = hop.getBoundingClientRect();
      const to = { x: h.left + h.width / 2, y: h.top + h.height / 2 };
      /* nothing to land on in view — scrolled away, or a layout without room */
      if (to.y < 0 || to.y > window.innerHeight || h.width === 0) {
        dot.remove();
        finish();
        return;
      }
      const dx = to.x - globe.cx, dy = to.y - globe.cy;
      const len = Math.hypot(dx, dy) || 1;
      const from = { x: globe.cx + (dx / len) * globe.r * 0.92, y: globe.cy + (dy / len) * globe.r * 0.92 };
      /* bow to the lower side of the chord: under the lede, over the hops */
      let px = -(to.y - from.y), py = to.x - from.x;
      if (py < 0) { px = -px; py = -py; }
      const chord = Math.hypot(px, py) || 1;
      const c = {
        x: (from.x + to.x) / 2 + (px / chord) * chord * SAG,
        y: (from.y + to.y) / 2 + (py / chord) * chord * SAG
      };
      const e = ease(Math.min(t, 1)), u = 1 - e;
      const x = u * u * from.x + 2 * u * e * c.x + e * e * to.x;
      const y = u * u * from.y + 2 * u * e * c.y + e * e * to.y;
      dot.style.transform = `translate(${(x - box.left).toFixed(1)}px,${(y - box.top).toFixed(1)}px)`;
      dot.style.opacity = String(Math.min(t / 0.15, 1));

      if (t >= 1 - LEAD / FLIGHT) handOver();
      if (t >= 1) {
        dot.classList.add('landed');
        setTimeout(() => dot.remove(), 600);
        finish();
      }
    }
  };
}
