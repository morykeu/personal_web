import { gsap } from 'gsap';

/* ?debug=1 — a small read-out of what the scene is doing: which state, how
   far through the hand-over to the next one, where the globe is placed, the
   frame rate and the time the scene's frame takes on the main thread.

   With a mouse it also carries the lens' controls: a switch per effect, a
   slider per tuning value (lens.js `tune`, changed live), and an A/B button —
   two seconds with the effects off, two with them on, frame rate and frame
   time of both side by side. The frame rate tops out at the display's refresh
   rate, so the frame time is the number that shows a difference on a fast
   machine; during the A/B it waits for the GPU to finish (gl.finish), so it
   includes the full-screen pass.

   scene.js imports this file only when the parameter is in the URL, so
   without it nothing is downloaded and nothing is drawn. */
const SWITCHES = {
  lens: 'lens',
  aberration: 'chromatic aberration',
  attract: 'nodes & packets follow'
};
const SLIDERS = [
  ['size', 'size (px)', 40, 160, 1],
  ['stiffness', 'spring stiffness', 40, 600, 5],
  ['damping', 'spring damping', 4, 40, 0.5],
  ['refract', 'refraction', 0, 1, 0.01],
  ['sheen', 'sheen', 0, 2, 0.05]
];

export function initDebug(read, controls, timing) {
  const box = document.createElement('div');
  box.setAttribute('aria-hidden', 'true');
  Object.assign(box.style, {
    position: 'fixed', left: '12px', bottom: '12px', zIndex: '200',
    font: '11px/1.55 "JetBrains Mono", ui-monospace, monospace', color: '#ece9f6',
    background: 'rgba(5,5,10,.9)', border: '1px solid rgba(167,139,250,.35)',
    padding: '8px 11px', whiteSpace: 'pre', pointerEvents: controls ? 'auto' : 'none'
  });
  const text = document.createElement('div');
  box.append(text);
  document.body.append(box);

  let result = '';
  const inputs = {};
  if (controls) {
    const { flags, tune } = controls;
    const panel = document.createElement('div');
    panel.style.cssText = 'margin-top:6px;padding-top:6px;border-top:1px solid rgba(167,139,250,.25)';
    for (const [key, name] of Object.entries(SWITCHES)) {
      const label = document.createElement('label');
      label.style.cssText = 'display:block;cursor:pointer';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = flags[key];
      input.style.cssText = 'margin:0 6px 0 0;vertical-align:-2px';
      input.addEventListener('change', () => { flags[key] = input.checked; });
      label.append(input, name);
      panel.append(label);
      inputs[key] = input;
    }
    for (const [key, name, min, max, step] of SLIDERS) {
      const label = document.createElement('label');
      label.style.cssText = 'display:grid;grid-template-columns:118px 110px 44px;align-items:center;gap:6px;margin-top:3px';
      const input = document.createElement('input');
      Object.assign(input, { type: 'range', min, max, step, value: tune[key] });
      input.style.cssText = 'width:110px;margin:0;accent-color:#e879f9';
      const value = document.createElement('span');
      const show = () => { value.textContent = String(tune[key]); };
      input.addEventListener('input', () => { tune[key] = Number(input.value); show(); });
      show();
      label.append(name, input, value);
      panel.append(label);
    }
    const ab = document.createElement('button');
    ab.type = 'button';
    ab.textContent = 'A/B: effects off vs on (4 s)';
    ab.style.cssText = 'margin-top:6px;font:inherit;color:inherit;background:rgba(167,139,250,.14);border:1px solid rgba(167,139,250,.35);padding:3px 8px;cursor:pointer';
    ab.addEventListener('click', () => runAB(ab, flags));
    panel.append(ab);
    box.append(panel);
  }

  /* frame rate and scene frame time, over whatever window is asked for */
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
  const setAll = (flags, on) => {
    for (const key of Object.keys(SWITCHES)) {
      flags[key] = on;
      inputs[key].checked = on;
    }
  };
  async function runAB(button, flags) {
    button.disabled = true;
    const before = Object.fromEntries(Object.keys(SWITCHES).map(k => [k, flags[k]]));
    result = 'measuring…';
    timing.sync = true;
    setAll(flags, false);
    await measure(400);                  // let the drop shrink away first
    const off = await measure(2000);
    setAll(flags, true);
    await measure(400);
    const on = await measure(2000);
    timing.sync = false;
    for (const [k, v] of Object.entries(before)) { flags[k] = v; inputs[k].checked = v; }
    const f = r => `${r.fps.toFixed(0)} fps · ${r.ms.toFixed(2)} ms`;
    result = `frame incl. GPU\noff  ${f(off)}\non   ${f(on)}`;
    button.disabled = false;
  }

  let frames = 0, since = performance.now();
  gsap.ticker.add(() => {
    frames++;
    const now = performance.now();
    if (now - since < 500) return;
    const fps = (frames * 1000) / (now - since);
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
