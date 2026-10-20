import { gsap } from 'gsap';

/* ?debug=1 — a small read-out of what the scene is doing: which state, how
   far through the hand-over to the next one, where the globe is placed, the
   frame time and the time the scene's frame takes on the main thread.

   Performance, for finding what slows a browser down (Safari's scrolling was
   the reason): the pixel ratio — automatic (quality.js) or fixed at 1, 1.25 or
   1.5 — and switches for the header's backdrop blur, Lenis' smooth wheel and
   the lens' full-screen pass. The header and Lenis switches only work with
   a fixed pixel ratio; in automatic mode they show what quality.js chose —
   including native scrolling under a 30 fps cap, which the quality line
   names. The frame line is measured here, from requestAnimationFrame, over
   the last second: average interval, frame rate, the worst frame and the
   share of frames over 20 ms. "measure 5 s" takes the
   same numbers over five seconds — scroll while it runs — and keeps the last
   runs, each with the settings it was taken with, so they can be compared.

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
const RATIOS = [1, 1.25, 1.5];
const SLOW = 20;                            // ms: a frame over this is counted as slow

const SECTION = 'margin-top:6px;padding-top:6px;border-top:1px solid rgba(167,139,250,.25)';
const BUTTON = 'display:block;margin-top:6px;font:inherit;color:inherit;background:rgba(167,139,250,.14);border:1px solid rgba(167,139,250,.35);padding:3px 8px;cursor:pointer';

function checkbox(name, checked, change) {
  const label = document.createElement('label');
  label.style.cssText = 'display:block;cursor:pointer';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.style.cssText = 'margin:0 6px 0 0;vertical-align:-2px';
  input.addEventListener('change', () => change(input.checked));
  label.append(input, name);
  return { label, input };
}

export function initDebug({ read, timing, quality, scroll, lens }) {
  const box = document.createElement('div');
  box.setAttribute('aria-hidden', 'true');
  Object.assign(box.style, {
    position: 'fixed', left: '12px', bottom: '12px', zIndex: '200',
    font: '11px/1.55 "JetBrains Mono", ui-monospace, monospace', color: '#ece9f6',
    background: 'rgba(5,5,10,.9)', border: '1px solid rgba(167,139,250,.35)',
    padding: '8px 11px', whiteSpace: 'pre', maxHeight: 'calc(100vh - 24px)', overflow: 'auto'
  });
  const text = document.createElement('div');
  box.append(text);
  document.body.append(box);

  /* --- performance ------------------------------------------------------- */
  const perf = document.createElement('div');
  perf.style.cssText = SECTION;
  const pick = document.createElement('label');
  pick.style.cssText = 'display:block';
  const select = document.createElement('select');
  select.style.cssText = 'margin-left:6px;font:inherit;color:inherit;background:#0a0912;border:1px solid rgba(167,139,250,.35)';
  for (const v of ['auto', ...RATIOS]) select.add(new Option(v === 'auto' ? 'auto (adaptive)' : String(v), String(v)));
  pick.append('pixel ratio', select);
  const blur = checkbox('header blur (backdrop-filter)', true, () => fixed());
  const smooth = checkbox('smooth scroll (Lenis)', scroll.smooth, on => { scroll.smooth = on; });
  perf.append(pick, blur.label, smooth.label);
  if (lens) perf.append(checkbox('lens pass (post-process)', lens.pass, on => { lens.pass = on; }).label);
  const test = document.createElement('button');
  test.type = 'button';
  test.textContent = 'measure 5 s (scroll while it runs)';
  test.style.cssText = BUTTON;
  test.addEventListener('click', () => runTest(test));
  perf.append(test);
  box.append(perf);

  /* a fixed pixel ratio hands the header switch over too */
  function fixed() {
    if (select.value === 'auto') return;
    quality.manual(Number(select.value), !blur.input.checked);
  }
  select.addEventListener('change', () => {
    if (select.value === 'auto') quality.automatic();
    else fixed();
  });

  /* --- lens --------------------------------------------------------------- */
  let result = '';
  const inputs = {};
  if (lens) {
    const { flags, tune } = lens;
    const panel = document.createElement('div');
    panel.style.cssText = SECTION;
    for (const [key, name] of Object.entries(SWITCHES)) {
      const { label, input } = checkbox(name, flags[key], on => { flags[key] = on; });
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
    ab.style.cssText = BUTTON;
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

  /* --- read-out ------------------------------------------------------------ */
  /* every frame interval of the last second, straight from rAF */
  const frames = [];
  let prev = 0, testing = null;
  function sample(now) {
    if (prev) {
      frames.push({ at: now, ms: now - prev });
      if (testing && now < testing.until) testing.ms.push(now - prev);
    }
    prev = now;
    while (frames.length && now - frames[0].at > 1000) frames.shift();
    requestAnimationFrame(sample);
  }
  requestAnimationFrame(sample);
  /* a hidden tab stops rAF; its first frame back is not a slow frame */
  document.addEventListener('visibilitychange', () => { prev = 0; frames.length = 0; });

  /* five seconds of frame intervals, labelled with what was switched on */
  const tests = [];
  function runTest(button) {
    button.disabled = true;
    const q = quality.status;
    const what = `dpr ${q.dpr}${q.auto ? ' (auto)' : ''} · header ${q.solid ? 'solid' : 'blur'} · ${scroll.smooth ? 'lenis' : 'native wheel'}` +
      (lens ? ` · lens pass ${lens.pass ? 'on' : 'off'}` : '');
    testing = { ms: [], until: performance.now() + 5000, what };
    setTimeout(() => {
      tests.unshift(`${testing.what}\n  ${testing.ms.length > 1 ? stats(testing.ms) : '—'}`);
      tests.length = Math.min(tests.length, 6);
      testing = null;
      button.disabled = false;
    }, 5000);
  }

  const frameLine = () => (frames.length < 2 ? '—' : stats(frames.map(f => f.ms)));
  function stats(ms) {
    const avg = ms.reduce((a, b) => a + b, 0) / ms.length;
    const worst = Math.max(...ms);
    const slow = ms.filter(v => v > SLOW).length / ms.length;
    return `${avg.toFixed(1)} ms · ${(1000 / avg).toFixed(0)} fps · worst ${worst.toFixed(0)} · slow ${(slow * 100).toFixed(0)} %`;
  }

  function qualityLine() {
    const q = quality.status;
    blur.input.checked = !q.solid;
    blur.input.disabled = q.auto;
    smooth.input.checked = scroll.smooth;
    smooth.input.disabled = q.auto;
    const head = q.auto ? `auto ${q.level}/${q.levels - 1}` : 'fixed';
    const up = q.up === null ? '' : ` · up in ${(q.up / 1000).toFixed(0)} s`;
    const tries = q.auto && q.failed ? ` · failed tries ${q.failed}` : '';
    const cap = q.capped ? `\n          capped at 30 fps${q.auto ? ' → native scroll' : ''}` : '';
    return `${head} · dpr ${q.dpr} · header ${q.solid ? 'solid' : 'blur'}${up}${tries}${cap}`;
  }

  let since = performance.now();
  gsap.ticker.add(() => {
    const now = performance.now();
    if (now - since < 500) return;
    since = now;
    const i = read();
    text.textContent = [
      `state     ${i.state}`,
      `blend     ${i.blend}`,
      `progress  ${i.progress}`,
      `scroll    ${i.scroll}${i.jump ? `  → jump to ${i.jump}` : ''}${scroll.smooth ? '' : '  (native wheel)'}`,
      `globe     ${i.globe}`,
      `mode      ${i.mode}`,
      `lens      ${i.lens}`,
      `frame     ${frameLine()}`,
      `scene js  ${i.cpu.toFixed(2)} ms`,
      `quality   ${qualityLine()}`,
      ...(testing ? ['', `measuring… ${Math.ceil((testing.until - now) / 1000)} s — scroll now`] : []),
      ...(tests.length ? ['', 'last 5 s runs, newest first', ...tests] : []),
      ...(result ? ['', result] : [])
    ].join('\n');
  });
}
