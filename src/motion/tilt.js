/* Cards tilt towards the mouse — at most MAX degrees — with a soft sheen that
   follows it across the card (style.css draws the sheen from --mx / --my).

   The rows in #work and #projects span the full content width, and a 6° turn
   about their vertical axis would push their far edge a long way out of the
   page, so that axis is scaled down with the card's width; the short axis
   keeps the full angle. Perspective grows with the card for the same reason.

   Once a card has settled flat its transform is removed again: a 3D
   transform left in place would keep the text on its own GPU layer, slightly
   soft, for the rest of the visit. */
const MAX = 6;                 // degrees
const EASE = 10;               // 1/s

export function createTilt(selector) {
  const items = [...document.querySelectorAll(selector)].map(el => ({
    el, rx: 0, ry: 0, tx: 0, ty: 0, mx: 50, my: 50, r: null, live: false, hover: false
  }));

  for (const it of items) {
    it.el.classList.add('tilt');
    it.el.addEventListener('pointerenter', e => {
      if (e.pointerType !== 'mouse') return;
      /* read with the transform it may still have from the last visit; the
         error is a fraction of a degree */
      it.r = it.el.getBoundingClientRect();
      it.live = it.hover = true;
      it.el.classList.add('is-tilting');
    });
    it.el.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse' || !it.hover) return;
      const nx = Math.min(Math.max((e.clientX - it.r.left) / it.r.width, 0), 1);
      const ny = Math.min(Math.max((e.clientY - it.r.top) / it.r.height, 0), 1);
      const wide = Math.min(1, 520 / it.r.width);
      it.ty = (nx - 0.5) * 2 * MAX * wide;          // about the vertical axis
      it.tx = -(ny - 0.5) * 2 * MAX;                // about the horizontal axis
      it.mx = nx * 100;
      it.my = ny * 100;
    });
    it.el.addEventListener('pointerleave', () => {
      it.tx = it.ty = 0;
      it.hover = false;
      it.el.classList.remove('is-tilting');
    });
  }

  return {
    update(dt) {
      const k = 1 - Math.exp(-dt * EASE);
      for (const it of items) {
        if (!it.live) continue;
        it.rx += (it.tx - it.rx) * k;
        it.ry += (it.ty - it.ry) * k;
        if (!it.hover && Math.abs(it.rx) < 0.02 && Math.abs(it.ry) < 0.02) {
          it.rx = it.ry = 0;
          it.live = false;
          it.r = null;
          it.el.style.transform = '';
          continue;
        }
        const persp = Math.max(900, (it.r ? it.r.width : 900) * 1.6);
        it.el.style.transform = `perspective(${persp | 0}px) rotateX(${it.rx.toFixed(3)}deg) rotateY(${it.ry.toFixed(3)}deg)`;
        it.el.style.setProperty('--mx', `${it.mx.toFixed(1)}%`);
        it.el.style.setProperty('--my', `${it.my.toFixed(1)}%`);
      }
    }
  };
}
