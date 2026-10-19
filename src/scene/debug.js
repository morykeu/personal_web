import { gsap } from 'gsap';

/* ?debug=1 — a small read-out of what the scene is doing: which state, how
   far through the hand-over to the next one, where the globe is placed, the
   frame rate and the time the scene's frame takes on the main thread.

   With a mouse it also carries a switch for each cursor effect, and an A/B
   button: two seconds with every effect off, two with every effect on, the
   frame rate and frame time of both side by side. The frame rate tops out at
   the display's refresh rate, so the frame time is the number that shows a
   difference on a fast machine — and during the A/B it waits for the GPU to
   finish (gl.finish), so it covers the lens' full-screen pass as well.

   scene.js imports this file only when the parameter is in the URL, so
   without it nothing is downloaded and nothing is drawn. */
const LABELS = {
  cursor: 'cursor (DOM)',
  lens: 'lens',
  aberration: 'chromatic aberration',
  ripple: 'ripples',
  attract: 'nodes & packets follow'
};

export function initDebug(read, flags, timing) {
  const box = document.createElement('div');
  box.setAttribute('aria-hidden', 'true');
  Object.assign(box.style, {
    position: 'fixed', left: '12px', bottom: '12px', zIndex: '200',
    font: '11px/1.55 "JetBrains Mono", ui-monospace, monospace', color: '#ece9f6',
    background: 'rgba(5,5,10,.9)', border: '1px solid rgba(167,139,250,.35)',
    padding: '8px 11px', whiteSpace: 'pre', pointerEvents: flags ? 'auto' : 'none'
  });
  const text = document.createElement('div');
  box.append(text);
  document.body.append(box);

  let result = '';
  const inputs = {};
  if (flags) {
    const panel = document.createElement('div');
    panel.style.cssText = 'margin-top:6px;padding-top:6px;border-top:1px solid rgba(167,139,250,.25)';
    for (const key of Object.keys(LABELS)) {
      const label = document.createElement('label');
      label.style.cssText = 'display:block;cursor:pointer';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = flags[key];
      input.style.cssText = 'margin:0 6px 0 0;vertical-align:-2px';
      input.addEventListener('change', () => { flags[key] = input.checked; });
      label.append(input, LABELS[key]);
      panel.append(label);
      inputs[key] = input;
    }
    const ab = document.createElement('button');
    ab.type = 'button';
    ab.textContent = 'A/B: effects off vs on (4 s)';
    ab.style.cssText = 'margin-top:6px;font:inherit;color:inherit;background:rgba(167,139,250,.14);border:1px solid rgba(167,139,250,.35);padding:3px 8px;cursor:pointer';
    ab.addEventListener('click', () => runAB(ab));
    panel.append(ab);
    box.append(panel);
  }

  /* frame rate and scene frame time, over whatever window is asked for */
  let frames = 0, since = performance.now(), fps = 0;
  const measure = ms => new Promise(resolve => {
    let n = 0, cpu = 0;
    const t0 = performance.now();
    const probe = () => {
      n++;
      cpu += read().cpu;
      if (performance.now() - t0 < ms) return;
      gsap.ticker.remove(probe);
      resolve({ fps: (n * 1000) / (performance.now() - t0), ms: cpu / n });
    };
    gsap.ticker.add(probe);
  });
  const setAll = on => {
    for (const key of Object.keys(LABELS)) {
      flags[key] = on;
      inputs[key].checked = on;
    }
  };
  async function runAB(button) {
    button.disabled = true;
    const before = Object.fromEntries(Object.keys(LABELS).map(k => [k, flags[k]]));
    result = 'measuring…';
    timing.sync = true;
    setAll(false);
    await measure(400);                  // let the effects fade out first
    const off = await measure(2000);
    setAll(true);
    await measure(400);
    const on = await measure(2000);
    timing.sync = false;
    for (const [k, v] of Object.entries(before)) { flags[k] = v; inputs[k].checked = v; }
    const f = r => `${r.fps.toFixed(0)} fps · ${r.ms.toFixed(2)} ms`;
    result = `frame incl. GPU\noff  ${f(off)}\non   ${f(on)}`;
    button.disabled = false;
  }

  gsap.ticker.add(() => {
    frames++;
    const now = performance.now();
    if (now - since < 500) return;
    fps = (frames * 1000) / (now - since);
    frames = 0;
    since = now;
    const i = read();
    text.textContent = [
      `state     ${i.state}`,
      `blend     ${i.blend}`,
      `progress  ${i.progress}`,
      `scroll    ${i.scroll}${i.jump ? `  → jump to ${i.jump}` : ''}`,
      `globe     ${i.globe}`,
      `mode      ${i.mode}`,
      `lens      ${i.lens}`,
      `fps       ${fps.toFixed(0)}  · scene ${i.cpu.toFixed(2)} ms`,
      ...(result ? ['', result] : [])
    ].join('\n');
  });
}
