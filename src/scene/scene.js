import { Color, Group, Matrix4, PerspectiveCamera, Raycaster, Scene, Vector2, Vector3, WebGLRenderer } from 'three';
import { gsap } from 'gsap';
import { glowTexture, ringTexture } from './glow.js';
import { createGlobe } from './globe.js';
import { createNetwork } from './packets.js';
import { createLinks } from './links.js';
import { createOrbits } from './orbits.js';
import { createBeacon } from './beacon.js';
import { createStars } from './stars.js';
import { createTrace } from './trace.js';
import { heroPlacement } from './layout.js';
import { createLens, tune } from './lens.js';
import { createQuality } from './quality.js';
import { fine, pointer, flags } from '../motion/pointer.js';
import { states, forTouch, ORDER, KEYS } from './states.js';

const R = 3;                               // globe radius, world units
const CAM = 14;                            // camera distance from the globe's centre
const ELEVATION = 1.2;                     // camera height at that distance
const BASE_FOV = 45;                       // the angle point sizes were tuned at
const INTRO = 2.6;                         // seconds from reveal to the full scene
const INTRO_SPIN = -2.2;                   // world turn the intro unwinds from, rad
const BEHIND = 0.42;                       // hero brightness when the globe sits under the copy
const PARALLAX = new Vector2(0.8, 0.5);    // camera travel at the window edge, world units
/* How fast the scene follows the scroll position, 1/s. Lenis already smooths
   the scroll; this only takes the edge off a fast flick. After an anchor jump
   the scene is aimed at the destination instead, and travels there slower,
   in one move. */
const FOLLOW = 6;
const SETTLE = 2.4;

const ease = t => 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 3);
const smooth = t => t * t * (3 - 2 * t);

/* palette comes from the stylesheet, so a colour changed in :root reaches the
   scene without touching this file */
function readColors() {
  const cs = getComputedStyle(document.documentElement);
  const read = name => new Color(cs.getPropertyValue(name).trim());
  const violet = read('--violet');
  const magenta = read('--magenta');
  return {
    violet,
    magenta,
    lilac: violet.clone().lerp(read('--text'), 0.45),   // the prototype's third tone, derived
    body: read('--ink').lerp(violet, 0.06),
    white: new Color(1, 1, 1)
  };
}

/* The lens works in sRGB, like the canvas it redraws, so it takes the
   palette as plain hex rather than as three's linear colours. */
function lensColors() {
  const cs = getComputedStyle(document.documentElement);
  const rgb = name => {
    const n = parseInt(cs.getPropertyValue(name).trim().replace('#', ''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const mix = (a, b, t) => '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');
  const violet = rgb('--violet'), magenta = rgb('--magenta'), text = rgb('--text'), ink = rgb('--ink');
  return {
    violet: mix(violet, violet, 0),
    magenta: mix(magenta, magenta, 0),
    lilac: mix(violet, text, 0.45),
    disc: mix(ink, violet, 0.05)
  };
}

/* `canvas` and `gl` come from the gate (main.js), which created the context
   to find out whether there is a GPU for it at all — with the attributes the
   renderer needs, so that one is used rather than a second one made here. */
export async function initScene(scroll, { canvas, gl }) {
  const root = document.documentElement;
  const lite = matchMedia('(pointer: coarse)').matches;
  const parallax = matchMedia('(pointer: fine)').matches;

  canvas.className = 'scene';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);

  const renderer = new WebGLRenderer({ canvas, context: gl });
  renderer.setClearColor(0x000000, 0);
  const cap = Math.min(window.devicePixelRatio || 1, lite ? 1 : 1.5);
  renderer.setPixelRatio(cap);
  const quality = createQuality({ renderer, cap, root, scroll });

  const scene = new Scene();
  const camera = new PerspectiveCamera(BASE_FOV, 1, 0.1, 200);
  const colors = readColors();
  const glow = glowTexture();

  /* counts come from the page, so a fifth project gets a fifth link */
  const clusters = document.querySelectorAll('#work .row').length;
  const projects = document.querySelectorAll('#projects .row').length;

  const world = new Group();
  scene.add(world);
  const globe = createGlobe({ R, colors, lite, glow, ring: ringTexture(), clusters });
  const network = createNetwork({ R, globe, colors, lite, glow });
  const links = createLinks({ R, globe, count: projects, colors, glow });
  globe.core.add(network.group, links.group);
  const orbits = createOrbits({ R, colors, glow });
  world.add(globe.core, globe.aura, orbits.group);
  const beacon = createBeacon({ colors, glow });
  scene.add(...beacon.sprites);
  const stars = createStars({ colors, glow, count: lite ? 900 : 1800 });
  scene.add(stars.points);
  /* The lens and the pull towards the mouse exist only with a mouse. If the
     lens cannot be set up, nothing is lost but the drop.
     passes.lens is ?debug=1's switch for the whole full-screen pass. */
  let lens = null;
  const passes = { lens: true };
  if (fine && !lite) {
    try {
      lens = createLens({ renderer, colors: lensColors() });
    } catch (err) {
      console.warn('[lens] disabled:', err);
    }
  }

  /* --- states as vectors ------------------------------------------------- */

  /* Every state becomes a plain array in KEYS order, so blending is a loop.
     The hero's placement is filled in from the page by fit(). */
  const IX = Object.fromEntries(KEYS.map((k, i) => [k, i]));
  const vectors = {};
  for (const key of ORDER) {
    const s = lite ? forTouch(states[key]) : states[key];
    vectors[key] = Float64Array.from(KEYS, k => s[k]);
  }
  const heroBright = vectors.hero[IX.bright];
  const segments = scroll.segments;        // progress() fills one value per segment, in this order
  const progress = new Float64Array(segments.length);
  const target = new Float64Array(KEYS.length);
  const current = new Float64Array(KEYS.length);
  const S = {};                            // `current` with names, for the parts

  /* The state at scroll position y. Hand-overs are applied in order, each
     mixing towards its section by its own progress — where two windows
     overlap (a short section, a tall window), the result is still continuous. */
  function aim(y) {
    scroll.progress(y, progress);
    target.set(vectors[scroll.first]);
    segments.forEach((s, i) => {
      const t = smooth(progress[i]);
      if (t <= 0) return;
      const v = vectors[s.to];
      for (let k = 0; k < target.length; k++) target[k] += (v[k] - target[k]) * t;
    });
  }

  /* --- placement ---------------------------------------------------------- */

  let W = 0, H = 0, hero = null, scale = 1, fovK = 1;


  /* measured hero placement → the hero's vector, in the same viewport
     fractions every other state is written in */
  function fit() {
    hero = heroPlacement(W, H);
    const v = vectors.hero;
    v[IX.x] = hero.cx / W;
    v[IX.y] = hero.cy / H;
    v[IX.size] = hero.d / Math.min(W, H);
    v[IX.bright] = heroBright * (hero.mode === 'beside' ? 1 : BEHIND);
    /* the mode where the globe is under the copy (style.css keys on it) */
    root.classList.toggle('scene-behind', hero.mode !== 'beside');
  }

  /* The canvas is 100lvh tall (style.css), which does not change when a mobile
     URL bar slides in or out — so a change in its box is a real resize, and the
     buffer is reallocated only then. */
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w === W && h === H) return false;
    W = w; H = h;
    renderer.setSize(W, H, false);
    return true;
  }

  const pointer = new Vector2(), mouse = new Vector2();
  if (parallax) {
    window.addEventListener('pointermove', e => {
      pointer.set((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
    }, { passive: true });
  }

  /* Places the globe from the state: centre at (x, y) of the window, diameter
     `size` of its shorter side. The world is scaled until the sphere subtends
     exactly that on screen at the current camera angle, then the lens is
     shifted (setViewOffset) to move it there. A lens shift keeps the globe
     seen head-on wherever it lands; moving it off-axis would show it from the
     side. With the size held, a wider angle can only mean a camera closer to
     the globe — which is how `fov` zooms in. */
  function frame(dt) {
    const fov = S.fov;
    const tanHalf = Math.tan((fov * Math.PI) / 360);
    const d = S.size * Math.min(W, H);
    const theta = Math.atan((d / H) * tanHalf);
    scale = (Math.hypot(CAM, ELEVATION) * Math.sin(theta)) / R;
    fovK = Math.tan((BASE_FOV * Math.PI) / 360) / tanHalf;
    world.scale.setScalar(scale);

    mouse.lerp(pointer, 1 - Math.exp(-dt * 3));
    const p = S.parallax;
    camera.position.set(mouse.x * PARALLAX.x * p, ELEVATION - mouse.y * PARALLAX.y * p, CAM);
    camera.lookAt(0, 0, 0);
    camera.fov = fov;
    camera.aspect = W / H;
    camera.setViewOffset(W, H, -(S.x * W - W / 2), -(S.y * H - H / 2), W, H);   // also updates the projection
  }

  /* --- frame loop -------------------------------------------------------- */

  let time = 0, revealedAt = -1, snap = true;
  const origin = new Vector3();
  let trace = null;

  /* The ray under the mouse, in the globe's own space, for the nodes and
     packets that react to it; `s` eases in and out so they never snap. */
  const probe = { o: new Vector3(), d: new Vector3(), s: 0 };
  const raycaster = new Raycaster(), ndc = new Vector2(), inverse = new Matrix4();
  function aimProbe(dt) {
    const live = fine && !lite && flags.attract && revealedAt >= 0 && pointer.inside && pointer.mouse;
    probe.s += ((live ? 1 : 0) - probe.s) * (1 - Math.exp(-dt * 5));
    if (probe.s < 0.001) return;
    camera.updateMatrixWorld();
    ndc.set((pointer.x / W) * 2 - 1, -(pointer.y / H) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    inverse.copy(globe.core.matrixWorld).invert();
    probe.o.copy(raycaster.ray.origin).applyMatrix4(inverse);
    probe.d.copy(raycaster.ray.direction).transformDirection(inverse);
  }

  function step(dt) {
    time += dt;
    const reveal = revealedAt < 0 ? 0 : ease((time - revealedAt) / INTRO);

    const jump = scroll.jump;
    aim(jump ? jump.y : scroll.y);
    const k = snap ? 1 : 1 - Math.exp(-dt * (jump ? SETTLE : FOLLOW));
    snap = false;
    for (let i = 0; i < current.length; i++) {
      current[i] += (target[i] - current[i]) * k;
      S[KEYS[i]] = current[i];
    }

    frame(dt);
    world.rotation.y = (1 - reveal) * INTRO_SPIN;
    const alpha = reveal * S.bright;
    const pointScale = H * renderer.getPixelRatio() * 0.5 * fovK;

    world.updateMatrixWorld();
    aimProbe(dt);
    origin.copy(globe.nodes[globe.me]).applyMatrix4(globe.core.matrixWorld);
    const flare = beacon.update({ dt, beacon: S.beacon, origin, camera, scale, reveal });

    /* the marker follows the globe's size on screen, within limits */
    const rpx = (S.size * Math.min(W, H)) / 2;
    const marker = {
      size: Math.min(Math.max(rpx * 0.16, 36), 90),
      px: (2 * Math.tan((S.fov * Math.PI) / 360)) / (H * scale)
    };
    globe.update({ time, dt, state: S, reveal, alpha, scale: scale * fovK, auraBoost: flare, marker, probe });
    network.update({
      dt, packets: S.packets, speed: S.speed, lift: S.lift, cluster: S.cluster,
      running: reveal > 0.6, alpha, scale, pointScale, probe
    });
    /* the highlighted links stand out of a dimmed globe */
    links.update({ time, alpha: reveal * S.links * Math.min(1, S.bright * 1.6), scale: scale * fovK });
    orbits.update({ dt, alpha: alpha * S.rings, spread: S.spread, align: S.align, stack: S.stack, sats: S.sats });
    stars.update({ time, opacity: S.stars * reveal, size: fovK });

    if (trace && revealedAt >= 0) {
      trace.update(dt, time - revealedAt, { cx: S.x * W, cy: S.y * H, r: (S.size * Math.min(W, H)) / 2 });
    }
    renderer.render(scene, camera);
    if (lens && passes.lens && revealedAt >= 0) { lens.update(dt, W, H); lens.render(); }
  }

  /* Watching the canvas box rather than window resize: the scrollbar appearing
     when the loader unlocks the page narrows the canvas by its width without
     firing a resize event, and the buffer would be left stretched. */
  let resizeDirty = false, layoutDirty = false, cpu = 0;
  const timing = { sync: false };
  new ResizeObserver(() => { resizeDirty = true; }).observe(canvas);
  window.addEventListener('km:lang', () => { layoutDirty = true; });   // copy length moves the free space
  document.fonts?.ready.then(() => { layoutDirty = true; });

  function tick(_, deltaMs) {
    if (document.hidden) return;
    /* the A/B below waits for the GPU on purpose; those frames say nothing */
    if (!timing.sync) quality.frame(deltaMs, cpu);
    if (resizeDirty) {
      resizeDirty = false;
      /* a resize jumps straight to the new placement — easing it would
         leave the globe trailing behind the window's edge */
      if (resize()) { layoutDirty = true; snap = true; }
    }
    if (layoutDirty) { layoutDirty = false; fit(); }
    const t0 = performance.now();
    step(Math.min(deltaMs / 1000, 0.05));
    /* ?debug=1's A/B waits for the GPU too, or a fast machine would only
       ever show the JavaScript side of the frame */
    if (timing.sync) renderer.getContext().finish();
    cpu += (performance.now() - t0 - cpu) * 0.05;
  }

  /* A lost context takes the scene down cleanly: the CSS background comes back
     and nothing else on the page notices. */
  canvas.addEventListener('webglcontextlost', () => {
    gsap.ticker.remove(tick);
    lens?.dispose();
    root.classList.remove('has-scene', 'header-solid');
    canvas.classList.remove('is-on');
  }, { once: true });

  /* --- start: build and compile under the loader, reveal after it -------- */

  resize();
  fit();
  /* Points sizes, the beacon and the links are all hidden until the reveal,
     so the first pass puts every part on screen at least once: each material
     gets its program compiled now, under the loader, not on first sight. */
  links.group.visible = true;
  await renderer.compileAsync(scene, camera);
  step(0);

  function reveal() {
    revealedAt = time;
    snap = true;
    root.classList.add('has-scene');
    canvas.classList.add('is-on');
    gsap.ticker.add(tick);
  }

  const debug = new URLSearchParams(location.search).has('debug');
  const dominant = () => {
    let key = scroll.first;
    segments.forEach((s, i) => { if (progress[i] >= 0.5) key = s.to; });
    return key;
  };
  const read = () => {
    const i = segments.findIndex((_, j) => progress[j] > 0 && progress[j] < 1);
    const jump = scroll.jump;
    return {
      state: dominant(),
      blend: i < 0 ? '—' : `${segments[i].from} → ${segments[i].to}`,
      progress: i < 0 ? 'hold' : progress[i].toFixed(2),
      scroll: Math.round(scroll.y),
      jump: jump && jump.to,
      globe: `${Math.round(S.x * W)}, ${Math.round(S.y * H)}  ⌀${Math.round(S.size * Math.min(W, H))}px`,
      mode: `${lite ? 'touch' : 'pointer'} · hero ${hero.mode} · fov ${S.fov.toFixed(0)}`,
      lens: !lens ? 'off (no mouse)' : !passes.lens ? 'pass off' : lens.visible ? 'on' : 'hidden',
      cpu
    };
  };
  if (debug) {
    import('./debug.js').then(m => m.initDebug({
      read, timing, quality, scroll,
      lens: lens && {
        flags, tune,
        get pass() { return passes.lens; },
        set pass(on) { passes.lens = on; lens.active = on; }
      }
    }));
  }

  if (import.meta.env.DEV) {
    /* dev-only handle for stepping and inspecting frames; compiled out of the
       production build because import.meta.env.DEV is replaced with false */
    window.__kmScene = {
      renderer, camera, world, stars: stars.points, lenis: scroll.lenis,
      get hero() { return hero; },
      get state() { return { ...S }; },
      get scale() { return scale; },
      read,
      reveal,
      advance(seconds, fps = 60) { for (let i = 0; i < seconds * fps; i++) step(1 / fps); },
      refit() { resize(); fit(); snap = true; }
    };
  }

  /* ready: lets the loader go (main.js / app.js) */
  root.classList.remove('scene-pending');
  window.dispatchEvent(new CustomEvent('km:scene'));

  const loader = document.getElementById('loader');
  if (loader && !loader.classList.contains('done')) {
    trace = createTrace(root);
    await new Promise(resolve => window.addEventListener('km:ready', resolve, { once: true }));
  }
  reveal();
}

