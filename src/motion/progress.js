/* Scroll progress: a thin violet-to-magenta line along the bottom edge of the
   header, with a lit packet riding at its head. Read straight from Lenis'
   own scroll value, so it moves with the smoothed page, not ahead of it. */
export function createProgress(lenis) {
  const header = document.querySelector('header');
  const make = name => {
    const el = document.createElement('i');
    el.className = name;
    el.setAttribute('aria-hidden', 'true');
    header.append(el);
    return el;
  };
  const line = make('progress');
  const head = make('progress-head');
  let width = header.clientWidth, last = -1;

  return {
    resize() { width = header.clientWidth; last = -1; },
    update() {
      const limit = lenis.limit;
      const p = limit > 0 ? Math.min(Math.max(lenis.animatedScroll / limit, 0), 1) : 0;
      if (Math.abs(p - last) < 1e-4) return;
      last = p;
      line.style.transform = `scaleX(${p.toFixed(4)})`;
      head.style.transform = `translateX(${(p * width).toFixed(1)}px)`;
      head.style.opacity = p > 0.001 ? '1' : '0';
    }
  };
}
