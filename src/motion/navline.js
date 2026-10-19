/* The active section in the nav: instead of each link's own underline, one
   line that glides from item to item. Which item is active is still decided
   by app.js (aria-current); this only watches that attribute.

   The glide is a CSS transition on transform. When nothing was lit before —
   coming down from the hero — the line appears in place rather than sliding
   in from wherever it was last. */
export function createNavLine() {
  const nav = document.querySelector('.secnav');
  if (!nav) return null;
  const links = [...nav.querySelectorAll('a')];
  const line = document.createElement('i');
  line.className = 'secnav-line';
  line.setAttribute('aria-hidden', 'true');
  nav.append(line);

  let active = null, shift = '';
  function place() {
    const a = links.find(l => l.hasAttribute('aria-current'));
    if (!a || !a.offsetWidth) {
      line.style.opacity = '0';
      active = null;
      return;
    }
    const appear = !active;
    if (appear) line.style.transition = 'none';
    line.style.transform = `translateX(${a.offsetLeft}px) scaleX(${a.offsetWidth / 100})`;
    line.style.opacity = '1';
    if (appear) requestAnimationFrame(() => { line.style.transition = ''; });
    active = a;
  }

  new MutationObserver(place).observe(nav, { subtree: true, attributes: true, attributeFilter: ['aria-current'] });
  place();

  return {
    place,
    get active() { return active; },
    /* the active link may be pulled by the magnet (magnet.js); the line
       follows it, through `translate` so it does not fight the glide */
    follow(offset) {
      const v = offset ? `${offset.x.toFixed(2)}px ${offset.y.toFixed(2)}px` : '';
      if (v !== shift) line.style.translate = shift = v;
    }
  };
}
