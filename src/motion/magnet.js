/* Links and buttons in the header and the contact section lean towards the
   mouse, by at most MAX px, and settle back when it leaves. Through the
   `translate` property, which composes with any transform they already have.

   The element's box is read once, when the pointer enters it; every frame
   after that only moves numbers. */
const MAX = 6;
const PULL = 0.3;              // share of the pointer's offset from the centre
const EASE = 14;               // 1/s

export function createMagnets(selector) {
  const items = [...document.querySelectorAll(selector)].map(el => ({ el, x: 0, y: 0, tx: 0, ty: 0, cx: 0, cy: 0, live: false, hover: false }));
  const clamp = v => Math.max(-MAX, Math.min(MAX, v));

  for (const it of items) {
    it.el.classList.add('magnet');
    it.el.addEventListener('pointerenter', e => {
      if (e.pointerType !== 'mouse') return;
      const r = it.el.getBoundingClientRect();
      /* the box as it would be without the current pull */
      it.cx = r.left + r.width / 2 - it.x;
      it.cy = r.top + r.height / 2 - it.y;
      it.live = it.hover = true;
    });
    it.el.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse' || !it.hover) return;
      it.tx = clamp((e.clientX - it.cx) * PULL);
      it.ty = clamp((e.clientY - it.cy) * PULL);
    });
    it.el.addEventListener('pointerleave', () => { it.tx = it.ty = 0; it.hover = false; });
  }

  return {
    offsetOf(el) {
      const it = el && items.find(i => i.el === el);
      return it && it.live ? it : null;
    },
    update(dt) {
      const k = 1 - Math.exp(-dt * EASE);
      for (const it of items) {
        if (!it.live) continue;
        it.x += (it.tx - it.x) * k;
        it.y += (it.ty - it.y) * k;
        if (!it.hover && Math.abs(it.x) < 0.05 && Math.abs(it.y) < 0.05) {
          it.x = it.y = 0;
          it.live = false;
          it.el.style.translate = '';
          continue;
        }
        it.el.style.translate = `${it.x.toFixed(2)}px ${it.y.toFixed(2)}px`;
      }
    }
  };
}
