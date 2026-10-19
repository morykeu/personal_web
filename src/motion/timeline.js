import { ScrollTrigger } from 'gsap/ScrollTrigger';

/* Education: a rail down the left margin of the timeline, drawn by the
   scroll — scrubbed, so it retracts on the way back up. Each entry has a node
   on the rail that lights up as the line reaches it, and a packet rides the
   head of the line, as on the traceroute in the hero.

   The rail is new: without this module (no JavaScript, reduced motion) the
   timeline is the plain list it always was. */
export function createTimeline() {
  const tl = document.querySelector('#education .tl');
  if (!tl) return null;
  const items = [...tl.querySelectorAll('.item')];
  const make = name => {
    const el = document.createElement('i');
    el.className = name;
    el.setAttribute('aria-hidden', 'true');
    tl.append(el);
    return el;
  };
  const rail = make('tl-rail');
  const head = make('tl-head');

  let height = 0, marks = [];
  /* where each entry's node sits along the rail, 0 … 1 — read from the node
     itself (style.css places it), so CSS stays the one source */
  function measure() {
    height = tl.offsetHeight;
    marks = items.map(it => (it.offsetTop + parseFloat(getComputedStyle(it, '::before').top)) / height);
  }
  function draw(p) {
    rail.style.transform = `scaleY(${p.toFixed(4)})`;
    head.style.transform = `translateY(${(p * height).toFixed(1)}px)`;
    head.style.opacity = p > 0.001 && p < 0.999 ? '1' : '0';
    items.forEach((it, i) => it.classList.toggle('lit', p >= marks[i] - 0.002));
  }

  measure();
  ScrollTrigger.create({
    trigger: tl,
    start: 'top 72%',
    end: 'bottom 55%',
    onUpdate: self => draw(self.progress),
    onRefresh: self => { measure(); draw(self.progress); }
  });
  return null;
}
