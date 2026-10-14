import {
  Color, Euler, Group, Matrix4, PerspectiveCamera, Quaternion, Scene, Vector2, Vector3, WebGLRenderer
} from 'three';
import { gsap } from 'gsap';
import { glowTexture } from './glow.js';
import { createGlobe } from './globe.js';
import { createNetwork, arcReach } from './packets.js';
import { createOrbits } from './orbits.js';
import { createStars } from './stars.js';
import { heroFrame } from './layout.js';

const R = 3;                               // globe radius, world units
const BASE = new Vector3(0, 1.2, 14);      // camera rest pose
const INTRO = 2.6;                         // seconds from reveal to the full scene
const INTRO_SPIN = -2.2;                   // world turn the intro unwinds from, rad
const BEHIND = 0.42;                       // brightness when the globe sits under the copy
const PARALLAX = new Vector2(0.8, 0.5);    // camera travel at the window edge, world units

/* one entry per composition a state can ask for (states.js `frame`) */
const FRAMES = { hero: heroFrame };

const ease = t => 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 3);

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

function fibonacciSphere(radius, n) {
  const out = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2, r = Math.sqrt(1 - y * y), th = i * golden;
    out.push(new Vector3(Math.cos(th) * r, y, Math.sin(th) * r).multiplyScalar(radius));
  }
  return out;
}

export async function initScene(scroll) {
  const root = document.documentElement;
  const lite = matchMedia('(pointer: coarse)').matches;
  const parallax = matchMedia('(pointer: fine)').matches;

  const canvas = document.createElement('canvas');
  canvas.className = 'scene';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);

  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lite ? 1 : 1.5));

  const scene = new Scene();
  const camera = new PerspectiveCamera(45, 1, 0.1, 200);
  const colors = readColors();
  const glow = glowTexture();

  const world = new Group();
  scene.add(world);
  const globe = createGlobe({ R, colors, lite, glow });
  const network = createNetwork({ R, nodes: globe.nodes, colors, lite, glow });
  globe.core.add(network.group);
  const orbits = createOrbits({ R, colors, glow });
  world.add(globe.core, globe.aura, orbits.group);
  const stars = createStars({ colors, glow, count: lite ? 900 : 1800 });
  scene.add(stars.points);

  /* --- fitting the composition into the free space ----------------------- */

  /* Outline of everything that can be drawn around the globe: the reach of
     the tallest arc (which also covers the aura) and the orbit rings. The core
     is the globe with its aura — the part that has to stay fully on screen. */
  const hull = [...fibonacciSphere(arcReach(R), 96), ...orbits.hull()];
  const coreHull = fibonacciSphere(R * 1.18, 64);
  /* the intro turns the world through these angles; fitting all of them keeps
     the rings clear of the copy while they swing into place */
  const angles = [0, INTRO_SPIN / 3, (2 * INTRO_SPIN) / 3, INTRO_SPIN];

  const _m = new Matrix4(), _q = new Quaternion(), _e = new Euler();
  const _v = new Vector3(), _s = new Vector3(), _o = new Vector3();
  let W = 0, H = 0, fitScale = 1, frameIntensity = 1, placed = null;

  function bounds(points, scale) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const ry of angles) {
      _m.compose(_o, _q.setFromEuler(_e.set(0, ry, 0)), _s.setScalar(scale));
      for (const p of points) {
        _v.copy(p).applyMatrix4(_m).project(camera);
        const x = ((_v.x + 1) / 2) * W, y = ((1 - _v.y) / 2) * H;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    return { x0, x1, y0, y1, w: x1 - x0, h: y1 - y0 };
  }

  /* Scale the world until its outline fits the frame, then shift the lens
     (setViewOffset) so the outline lands on the frame. A lens shift keeps the
     globe seen head-on wherever it ends up on screen; moving the globe
     off-axis instead would show it from the side.

     beside: the outline's left edge sits on the frame's left edge, and the
             globe body must end before the frame's right edge (the canvas
             edge). The rings are wide and flat, so letting them run off the
             right side is what buys the globe a usable size.
     behind: the whole outline fits the frame, pushed to its right edge. The
             copy is left-aligned, so the right side is where the space is —
             centred, half the globe would sit under the headline's scrim.
             On a phone the outline fills the width and this is a no-op. */
  function fit() {
    const frame = (FRAMES[scroll.frame] || heroFrame)(W);
    camera.clearViewOffset();
    camera.aspect = W / H;
    camera.position.copy(BASE);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();

    const fw = frame.right - frame.left, fh = frame.bottom - frame.top;
    const beside = frame.mode === 'beside';
    let s = 1;
    for (let i = 0; i < 4; i++) {           // perspective makes size non-linear in scale
      const full = bounds(hull, s);
      const across = beside ? bounds(coreHull, s).x1 - full.x0 : full.w;
      s *= Math.min(fw / across, fh / full.h);
    }
    const b = bounds(hull, s);
    const core = bounds(coreHull, s);       // both measured before the lens shift below
    const cx = beside ? frame.left + b.w / 2 : frame.right - b.w / 2;
    const cy = (frame.top + frame.bottom) / 2;
    const dx = cx - (b.x0 + b.x1) / 2, dy = cy - (b.y0 + b.y1) / 2;
    camera.setViewOffset(W, H, -dx, -dy, W, H);

    world.scale.setScalar(s);
    fitScale = s;
    frameIntensity = beside ? 1 : BEHIND;
    /* the headline only needs its own scrim when the globe is under it */
    root.classList.toggle('scene-behind', !beside);
    placed = {
      frame,
      outline: { left: b.x0 + dx, right: b.x1 + dx, top: b.y0 + dy, bottom: b.y1 + dy },
      globe: { left: core.x0 + dx, right: core.x1 + dx, top: core.y0 + dy, bottom: core.y1 + dy }
    };
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

  /* --- frame loop -------------------------------------------------------- */

  let time = 0, revealedAt = -1;
  const pointer = new Vector2(), mouse = new Vector2();
  if (parallax) {
    window.addEventListener('pointermove', e => {
      pointer.set((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
    }, { passive: true });
  }

  function step(dt) {
    time += dt;
    const reveal = revealedAt < 0 ? 0 : ease((time - revealedAt) / INTRO);
    const st = scroll.state;
    const alpha = reveal * st.intensity * frameIntensity;

    mouse.lerp(pointer, 1 - Math.exp(-dt * 3));
    camera.position.set(BASE.x + mouse.x * PARALLAX.x, BASE.y - mouse.y * PARALLAX.y, BASE.z);
    camera.lookAt(0, 0, 0);
    world.rotation.y = (1 - reveal) * INTRO_SPIN;

    globe.update({ time, dt, state: st, reveal, alpha, scale: fitScale });
    network.update({
      dt, speed: st.packets, running: reveal > 0.6, alpha, scale: fitScale,
      pointScale: H * renderer.getPixelRatio() * 0.5
    });
    orbits.update({ time, alpha });
    stars.update({ time, opacity: st.stars * reveal });
    renderer.render(scene, camera);
  }

  /* Watching the canvas box rather than window resize: the scrollbar appearing
     when the loader unlocks the page narrows the canvas by its width without
     firing a resize event, and the buffer would be left stretched. */
  let resizeDirty = false, layoutDirty = false;
  new ResizeObserver(() => { resizeDirty = true; }).observe(canvas);
  window.addEventListener('km:lang', () => { layoutDirty = true; });   // copy length moves the free space
  document.fonts?.ready.then(() => { layoutDirty = true; });

  function tick(_, deltaMs) {
    if (document.hidden) return;
    if (resizeDirty) { resizeDirty = false; if (resize()) layoutDirty = true; }
    if (layoutDirty) { layoutDirty = false; fit(); }
    step(Math.min(deltaMs / 1000, 0.05));
  }

  /* A lost context takes the scene down cleanly: the CSS background comes back
     and nothing else on the page notices. */
  canvas.addEventListener('webglcontextlost', () => {
    gsap.ticker.remove(tick);
    root.classList.remove('has-scene');
    canvas.classList.remove('is-on');
  }, { once: true });

  /* --- start: build and compile under the loader, reveal after it -------- */

  resize();
  fit();
  await renderer.compileAsync(scene, camera);
  step(0);

  function reveal() {
    revealedAt = time;
    root.classList.add('has-scene');
    canvas.classList.add('is-on');
    gsap.ticker.add(tick);
  }

  if (import.meta.env.DEV) {
    /* dev-only handle for stepping and inspecting frames; compiled out of the
       production build because import.meta.env.DEV is replaced with false */
    window.__kmScene = {
      renderer, camera, world, stars: stars.points, lenis: scroll.lenis,
      get placed() { return placed; },
      get scale() { return fitScale; },
      reveal,
      advance(seconds, fps = 60) { for (let i = 0; i < seconds * fps; i++) step(1 / fps); },
      refit() { resize(); fit(); }
    };
  }

  const loader = document.getElementById('loader');
  if (loader && !loader.classList.contains('done')) {
    await new Promise(resolve => window.addEventListener('km:ready', resolve, { once: true }));
  }
  reveal();
}
