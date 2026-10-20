import {
  BufferAttribute, BufferGeometry, FramebufferTexture, LinearFilter, Mesh, NoBlending,
  OrthographicCamera, Scene, ShaderMaterial, Vector2, Vector3
} from 'three';
import { pointer, flags } from '../motion/pointer.js';

/* The cursor's lens: a dark drop of glass that follows the mouse over the
   scene. Inside, the scene is refracted as through a hemisphere — offset along
   the drop's normal, with a little chromatic split — and a thin-film sheen
   runs round its rim in the site's own colours (violet, magenta, light
   lilac), dark in the middle, drifting with time and with the direction of
   travel. The system cursor stays as it is, on top.

   Motion is a spring, deliberately underdamped: the drop lags, catches up
   and settles with a small overshoot. Moving fast it stretches along its path
   and narrows across it; over a link or a card it grows and softens; a click
   sends a ring out; resting it shrinks a little; leaving the window it
   shrinks to nothing.

   Pipeline: the scene is rendered to the canvas as always, the frame copied
   into a texture, and one full-screen pass redraws the canvas from it with
   the drop on top. (A render target would have been the textbook route, but
   three renders those in linear colour and the canvas in sRGB, and the
   scene's additive glows would change look the moment the pass came on.)

   Over text it is drawn just the same: the dark disc only lowers what is
   behind the letters, and its light rim is a few pixels wide (measured
   against the thinnest copy, style.css has the numbers).

   The header is above the canvas, behind a blurred veil, and would hide the
   drop. So while the drop is over it, the drop is copied into a small canvas
   inside the header — above the veil, below the header's own text — cut to
   the drop's shape. */

/* defaults; ?debug=1 has a slider for each */
export const tune = {
  size: 80,                    // diameter, CSS px
  stiffness: 170,              // spring, 1/s²
  damping: 16,                 // 1/s — below 2√stiffness (≈26) the drop overshoots a little
  refract: 0.35,               // offset at the rim, share of the radius
  sheen: 1                     // thin-film intensity
};

const HOT = 1.35;              // scale over links, buttons, cards
const IDLE = 0.86;             // scale once the mouse has rested IDLE_AFTER
const IDLE_AFTER = 1.4;        // s
const STRETCH = 0.45;          // the most it lengthens along its path
const PULSE = 0.6;             // s a click ring runs

export function createLens({ renderer, colors }) {
  const header = document.querySelector('header');
  const canvas = renderer.domElement;

  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const srgb = hex => {
    const n = parseInt(hex.replace('#', ''), 16);
    return new Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  };
  const uniforms = {
    tScene: { value: null },
    uRes: { value: new Vector2() },
    uPos: { value: new Vector2() },
    uRadius: { value: 0 },
    uAxis: { value: new Vector2(1, 1) },
    uAngle: { value: 0 },
    uSoft: { value: 0.04 },
    uRefract: { value: tune.refract },
    uAberr: { value: 1 },
    uSheen: { value: tune.sheen },
    uPhase: { value: 0 },
    uDir: { value: new Vector2(1, 0) },
    uPulse: { value: -1 },
    cDisc: { value: srgb(colors.disc) },
    cViolet: { value: srgb(colors.violet) },
    cMagenta: { value: srgb(colors.magenta) },
    cLilac: { value: srgb(colors.lilac) }
  };
  const material = new ShaderMaterial({
    uniforms,
    depthTest: false,
    depthWrite: false,
    blending: NoBlending,
    vertexShader: /* glsl */`
      void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    /* everything here is in sRGB, like the canvas the pixels came from */
    fragmentShader: /* glsl */`
      uniform sampler2D tScene;
      uniform vec2 uRes;
      uniform vec2 uPos;
      uniform float uRadius;
      uniform vec2 uAxis;
      uniform float uAngle;
      uniform float uSoft;
      uniform float uRefract;
      uniform float uAberr;
      uniform float uSheen;
      uniform float uPhase;
      uniform vec2 uDir;
      uniform float uPulse;
      uniform vec3 cDisc;
      uniform vec3 cViolet;
      uniform vec3 cMagenta;
      uniform vec3 cLilac;

      /* the film: violet → magenta → lilac and round again, never a rainbow */
      vec3 film(float t) {
        t = fract(t) * 3.0;
        float f = smoothstep(0.0, 1.0, fract(t));
        if (t < 1.0) return mix(cViolet, cMagenta, f);
        if (t < 2.0) return mix(cMagenta, cLilac, f);
        return mix(cLilac, cViolet, f);
      }

      void main() {
        vec2 p = gl_FragCoord.xy;
        vec4 col = texture2D(tScene, p / uRes);

        if (uRadius > 0.5) {
          /* into the drop's own frame: x along its path, y across */
          vec2 q = p - uPos;
          float ca = cos(uAngle), sa = sin(uAngle);
          vec2 e = vec2(ca * q.x + sa * q.y, -sa * q.x + ca * q.y) / (uRadius * uAxis);
          float r = length(e);
          float disc = 1.0 - smoothstep(1.0 - uSoft, 1.0 + uSoft * 0.5, r);
          float ring = 0.0;
          if (uPulse >= 0.0) {
            float at = 1.0 + uPulse * 0.75;
            ring = exp(-pow((r - at) / 0.06, 2.0)) * (1.0 - uPulse) * (1.0 - uPulse);
          }
          if (disc > 0.001 || ring > 0.001) {
            /* the hemisphere's normal, and back to screen axes for the offset */
            vec2 n = r < 1.0 ? e : e / r;
            float nz = sqrt(max(1.0 - dot(n, n), 0.0));
            vec2 ns = vec2(ca * n.x - sa * n.y, sa * n.x + ca * n.y);
            vec2 off = -ns * uRefract * uRadius * (1.0 - nz);
            vec2 at = p + off;
            float split = 0.07 * uAberr;
            vec4 sg = texture2D(tScene, at / uRes);
            float red = texture2D(tScene, (at + off * split) / uRes).r;
            float blue = texture2D(tScene, (at - off * split) / uRes).b;
            /* dark glass, the refracted scene seen through it */
            vec3 glass = cDisc * (1.0 - sg.a * 0.6) + vec3(red, sg.g, blue) * 0.72;
            /* thin film: strongest at the rim, dark in the middle; the hue runs
               round the rim, drifts with time and leans into the direction of
               travel */
            float fres = pow(1.0 - nz, 1.6);
            float round = atan(ns.y, ns.x) / 6.2832;
            float hue = fres * 1.1 + round + dot(normalize(ns + 1e-5), uDir) * 0.22 + uPhase;
            vec3 sheen = film(hue) * fres * (0.45 + 0.55 * fres) * uSheen * 1.25;
            /* a fainter pearly band further in, a third of the way round the
               palette from the rim */
            float band = smoothstep(0.3, 0.55, fres) * (1.0 - smoothstep(0.55, 0.8, fres));
            sheen += film(hue + 0.33) * band * 0.22 * uSheen;
            /* a soft pearly highlight, up and to the left */
            float spec = pow(max(dot(vec3(n.x, n.y, nz), normalize(vec3(-0.45, 0.55, 0.7))), 0.0), 16.0);
            vec3 drop = glass + sheen * 0.85 + cLilac * spec * 0.3 * uSheen;
            /* the drop is opaque; the canvas holds premultiplied colour */
            col.rgb = mix(col.rgb, drop, disc) + cMagenta * ring * 0.45;
            col.a = min(col.a + (1.0 - col.a) * disc + ring * 0.45, 1.0);
          }
        }
        gl_FragColor = col;
      }`
  });
  const quad = new Mesh(geo, material);
  quad.frustumCulled = false;
  const scene = new Scene();
  scene.add(quad);
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

  /* the copy in the header */
  const copy = document.createElement('canvas');
  copy.className = 'lens-copy';
  copy.setAttribute('aria-hidden', 'true');
  header.append(copy);
  const cctx = copy.getContext('2d');
  let copied = null;

  let tex = null;
  const buffer = new Vector2();
  /* spring state, CSS px */
  let x = 0, y = 0, vx = 0, vy = 0;
  let g = 0, gv = 0;                // scale and its velocity
  let s = 0, sv = 0;                // stretch and its velocity
  let angle = 0, phase = 0, pulse = -1, seenClick = 0;
  const dir = new Vector2(1, 0);
  let appeared = false;

  function fit() {
    renderer.getDrawingBufferSize(buffer);
    if (!tex || tex.image.width !== buffer.x || tex.image.height !== buffer.y) {
      tex?.dispose();
      tex = new FramebufferTexture(buffer.x, buffer.y);
      tex.minFilter = tex.magFilter = LinearFilter;
      uniforms.tScene.value = tex;
      uniforms.uRes.value.copy(buffer);
    }
    const w = header.clientWidth, h = header.clientHeight, pr = renderer.getPixelRatio();
    if (copy.width !== Math.round(w * pr) || copy.height !== Math.round(h * pr)) {
      copy.width = Math.round(w * pr);
      copy.height = Math.round(h * pr);
    }
  }

  return {
    get visible() { return g > 0.01; },
    update(dt, W, H) {
      const now = performance.now();
      const on = flags.lens && pointer.inside && pointer.mouse;
      if (on && !appeared) { x = pointer.x; y = pointer.y; vx = vy = 0; appeared = true; }
      if (!on && g < 0.01) appeared = false;

      /* position: a spring, in a few sub-steps so a stiff one stays stable */
      const steps = 4, h = dt / steps;
      for (let i = 0; i < steps; i++) {
        vx += (tune.stiffness * (pointer.x - x) - tune.damping * vx) * h;
        vy += (tune.stiffness * (pointer.y - y) - tune.damping * vy) * h;
        x += vx * h;
        y += vy * h;
      }
      /* size: grows over targets, shrinks at rest, gone outside */
      const rest = now - pointer.moved > IDLE_AFTER * 1000;
      const want = on ? (pointer.hot ? HOT : rest ? IDLE : 1) : 0;
      if (pointer.clicked !== seenClick) {
        seenClick = pointer.clicked;
        if (on) { pulse = 0; gv -= 2.4; }          // a squash, then the ring
      }
      for (let i = 0; i < steps; i++) {
        gv += (220 * (want - g) - 20 * gv) * h;
        g = Math.max(g + gv * h, 0);
      }
      if (pulse >= 0) { pulse += dt / PULSE; if (pulse >= 1) pulse = -1; }

      /* stretch along the path, as its own wobbly spring */
      const speed = Math.hypot(vx, vy);
      const sw = Math.min(speed / 2000, STRETCH);
      for (let i = 0; i < steps; i++) {
        sv += (300 * (sw - s) - 16 * sv) * h;
        s += sv * h;
      }
      if (speed > 40) {
        const a = Math.atan2(-vy, vx);           // gl y points up
        let d = a - angle;
        d -= Math.PI * 2 * Math.round(d / (Math.PI * 2));
        angle += d * Math.min(dt * 18, 1);
        dir.set(Math.cos(a), Math.sin(a));
      }
      phase += dt * (0.05 + speed * 0.00012);

      const pr = renderer.getPixelRatio();
      const along = 1 + Math.max(s, -0.2), across = 1 / Math.sqrt(along);
      uniforms.uPos.value.set(x * pr, (H - y) * pr);
      uniforms.uRadius.value = (tune.size / 2) * g * pr;
      uniforms.uAxis.value.set(along, across);
      uniforms.uAngle.value = angle;
      uniforms.uSoft.value = 0.04 + 0.1 * Math.max(0, Math.min((g - 1) / (HOT - 1), 1));
      uniforms.uRefract.value = tune.refract;
      uniforms.uAberr.value = flags.aberration ? 1 : 0;
      uniforms.uSheen.value = tune.sheen;
      uniforms.uPhase.value = phase;
      uniforms.uDir.value.copy(dir);
      uniforms.uPulse.value = pulse;
    },
    /* right after the scene was drawn to the canvas */
    render() {
      fit();
      renderer.copyFramebufferToTexture(tex);
      const clear = renderer.autoClear;
      renderer.autoClear = false;
      renderer.render(scene, camera);
      renderer.autoClear = clear;

      /* the header's copy: only the drop, only while it is up there */
      const pr = renderer.getPixelRatio();
      const reach = (tune.size / 2) * g * (1 + STRETCH) * 1.2 + 4;
      if (copied) { cctx.clearRect(copied.x, copied.y, copied.w, copied.h); copied = null; }
      if (g > 0.01 && y - reach < header.clientHeight) {
        const bx = Math.floor((x - reach) * pr), by = Math.floor((y - reach) * pr);
        const bs = Math.ceil(reach * 2 * pr);
        cctx.drawImage(canvas, bx, by, bs, bs, bx, by, bs, bs);
        cctx.save();
        cctx.globalCompositeOperation = 'destination-in';
        cctx.translate(x * pr, y * pr);
        cctx.rotate(-angle);
        const along = 1 + Math.max(s, -0.2);
        cctx.scale(uniforms.uRadius.value * along, uniforms.uRadius.value / Math.sqrt(along));
        const soft = uniforms.uSoft.value;
        const grad = cctx.createRadialGradient(0, 0, 0, 0, 0, 1 + soft);
        grad.addColorStop(0, '#000');
        grad.addColorStop((1 - soft) / (1 + soft), '#000');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        cctx.fillStyle = grad;
        cctx.fillRect(-2, -2, 4, 4);
        cctx.restore();
        copied = { x: bx - 2, y: by - 2, w: bs + 4, h: bs + 4 };
      }
    },
    /* ?debug=1 can switch the whole pass off; the drop's copy in the
       header goes with it */
    set active(on) {
      if (!on && copied) { cctx.clearRect(copied.x, copied.y, copied.w, copied.h); copied = null; }
    },
    dispose() { copy.remove(); }
  };
}
