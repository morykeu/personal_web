import { gsap } from 'gsap';

/* ?debug=1 — a small read-out of what the scene is doing: which state, how
   far through the hand-over to the next one, where the globe is placed, and
   the frame rate. scene.js imports this file only when the parameter is in
   the URL, so without it nothing is downloaded and nothing is drawn. */
export function initDebug(read) {
  const box = document.createElement('div');
  box.setAttribute('aria-hidden', 'true');
  Object.assign(box.style, {
    position: 'fixed', left: '12px', bottom: '12px', zIndex: '200',
    font: '11px/1.55 "JetBrains Mono", ui-monospace, monospace', color: '#ece9f6',
    background: 'rgba(5,5,10,.88)', border: '1px solid rgba(167,139,250,.35)',
    padding: '8px 11px', pointerEvents: 'none', whiteSpace: 'pre'
  });
  document.body.append(box);

  let frames = 0, since = performance.now();
  gsap.ticker.add(() => {
    frames++;
    const now = performance.now();
    if (now - since < 500) return;
    const fps = (frames * 1000) / (now - since);
    frames = 0;
    since = now;
    const i = read();
    box.textContent = [
      `state     ${i.state}`,
      `blend     ${i.blend}`,
      `progress  ${i.progress}`,
      `scroll    ${i.scroll}${i.jump ? `  → jump to ${i.jump}` : ''}`,
      `globe     ${i.globe}`,
      `mode      ${i.mode}`,
      `fps       ${fps.toFixed(0)}`
    ].join('\n');
  });
}
