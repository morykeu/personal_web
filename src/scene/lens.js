import {
  BufferAttribute, BufferGeometry, FramebufferTexture, LinearFilter, Mesh, NoBlending,
  OrthographicCamera, Scene, ShaderMaterial, Vector2, Vector4
} from 'three';
import { pointer, flags } from '../motion/pointer.js';

/* A lens that follows the mouse over the scene: it magnifies what is under
   it, splits colour into a rainbow towards its rim, and a fast move leaves
   ripples running out behind it. Inside the lens a faint lattice of nodes and
   links shows — the network the rest of the page is about — so the lens has
   a shape even over empty sky.

   Pipeline: the scene is rendered to the canvas as always, the finished frame
   is copied into a texture (copyFramebufferToTexture), and one full-screen
   triangle redraws the canvas from it through this shader. A render target
   was the other way, but three draws into render targets in linear colour
   while the canvas is drawn in sRGB, and the scene's additive glows blend
   differently in the two — the globe would change look the moment the lens
   came on. The copy keeps the frame exactly as it was.

   It runs only while the mouse is in the window over a running scene, and
   at the canvas' own buffer size, so under the same pixel-ratio cap (1.5).
   Over text it shrinks to a hint: the copy sits on scrims anyway, and the
   lens has no business making a reader chase the words. The holes mask.js
   cuts under the headline and the header are cut again after it, so it can
   never pull the scene back in under them. */

const RADIUS = 120;            // CSS px
const TRAIL = 10;              // ripple sources
const EMIT = 0.045;            // s between ripple sources while moving fast
const FAST = 350;              // px/s before a move leaves ripples
const LIFE = 1.3;              // s a ripple runs

export function createLens({ renderer, mask, colors }) {
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const trail = Array.from({ length: TRAIL }, () => ({ x: 0, y: 0, age: LIFE, amp: 0 }));
  const uniforms = {
    tScene: { value: null },
    uRes: { value: new Vector2() },
    uMouse: { value: new Vector2() },
    uRadius: { value: RADIUS },
    uPr: { value: 1 },
    uPower: { value: 0 },
    uAberr: { value: 1 },
    uRipple: { value: 1 },
    uTrail: { value: trail.map(() => new Vector4()) },
    uTint: { value: colors.violet },
    uTime: { value: 0 }
  };
  const material = new ShaderMaterial({
    uniforms,
    defines: { TRAIL },
    depthTest: false,
    depthWrite: false,
    blending: NoBlending,
    vertexShader: /* glsl */`
      void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tScene;
      uniform vec2 uRes;
      uniform vec2 uMouse;
      uniform float uRadius;
      uniform float uPr;
      uniform float uPower;
      uniform float uAberr;
      uniform float uRipple;
      uniform vec4 uTrail[TRAIL];
      uniform vec3 uTint;
      uniform float uTime;

      /* hue 0 … 1 → rgb: red through violet */
      vec3 spectrum(float h) {
        return clamp(vec3(abs(h * 6.0 - 3.0) - 1.0, 2.0 - abs(h * 6.0 - 2.0), 2.0 - abs(h * 6.0 - 4.0)), 0.0, 1.0);
      }
      /* closeness to the nearest line of one family of parallel lines */
      float lineFamily(vec2 p, vec2 n, float gap, float width) {
        float d = abs(fract(dot(p, n) / gap + 0.5) - 0.5) * gap;
        return 1.0 - smoothstep(0.0, width, d);
      }

      void main() {
        vec2 p = gl_FragCoord.xy;
        vec2 d = p - uMouse;
        float dist = length(d);
        float r = dist / (uRadius * uPr);
        float inside = (1.0 - smoothstep(0.82, 1.0, r)) * uPower;

        /* ripples: rings running out from where a fast move passed */
        vec2 wave = vec2(0.0);
        for (int i = 0; i < TRAIL; i++) {
          vec4 t = uTrail[i];
          if (t.w < 0.002) continue;
          vec2 q = p - t.xy;
          float l = length(q);
          float front = t.z * 380.0 * uPr;
          float band = exp(-pow((l - front) / (30.0 * uPr), 2.0));
          wave += (l > 0.5 ? q / l : vec2(0.0)) * band * sin((l - front) / (6.0 * uPr)) * t.w * 7.0 * uPr;
        }
        wave *= uRipple;

        vec4 outCol;
        if (inside < 0.002 && dot(wave, wave) < 0.0025) {
          outCol = texture2D(tScene, p / uRes);
        } else {
          /* a convex lens: sample nearer the centre, most at the centre */
          float bend = inside * (1.0 - r * r);
          vec2 off = -d * 0.3 * bend + wave;
          /* the rainbow: split along the radius, strongest towards the rim
             and in the ripples */
          vec2 dir = dist > 0.5 ? d / dist : vec2(0.0);
          float rim = smoothstep(0.3, 0.95, r) * inside;
          float spread = uAberr * (rim * 16.0 * uPr + length(wave) * 0.9);
          vec3 acc = vec3(0.0), wsum = vec3(0.0);
          float alpha = 0.0;
          for (int k = 0; k < 7; k++) {
            float t = float(k) / 6.0;
            vec3 w = spectrum(t * 0.82);
            vec4 s = texture2D(tScene, (p + off + dir * (t - 0.5) * spread) / uRes);
            acc += s.rgb * w;
            wsum += w;
            alpha += s.a;
          }
          vec3 col = acc / wsum;
          alpha /= 7.0;

          /* the lattice: three families of lines 60° apart, nodes where they
             cross; strongest in the ring between centre and rim */
          vec2 lp = p / uPr;
          float gap = 30.0;
          float a1 = lineFamily(lp, vec2(0.0, 1.0), gap, 0.9);
          float a2 = lineFamily(lp, vec2(0.866, 0.5), gap, 0.9);
          float a3 = lineFamily(lp, vec2(0.866, -0.5), gap, 0.9);
          float nodes = lineFamily(lp, vec2(0.0, 1.0), gap, 2.2) * lineFamily(lp, vec2(0.866, 0.5), gap, 2.2);
          float lattice = (max(a1, max(a2, a3)) * 0.5 + nodes) * inside * smoothstep(0.15, 0.6, r);
          col += uTint * lattice * 0.16;
          alpha += lattice * 0.16;

          /* the rim: a thin ring whose colour runs round the spectrum, so the
             lens has an edge even where there is nothing to bend */
          float edge = exp(-pow((r - 0.93) / 0.035, 2.0)) * uPower;
          vec3 hue = spectrum(fract(atan(d.y, d.x) / 6.2832 + 0.5 + uTime * 0.05) * 0.82);
          col += hue * edge * (0.14 + 0.1 * uAberr);
          alpha += edge * (0.14 + 0.1 * uAberr);

          /* the canvas holds premultiplied colour; keep it valid */
          alpha = min(max(alpha, max(col.r, max(col.g, col.b))), 1.0);
          outCol = vec4(col, alpha);
        }
        gl_FragColor = outCol;
      }`
  });
  mask.apply(material, true);
  const quad = new Mesh(geo, material);
  quad.frustumCulled = false;
  const scene = new Scene();
  scene.add(quad);
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

  let tex = null;
  const buffer = new Vector2();
  let emit = 0, power = 0, time = 0;

  function fit() {
    renderer.getDrawingBufferSize(buffer);
    if (tex && tex.image.width === buffer.x && tex.image.height === buffer.y) return;
    tex?.dispose();
    tex = new FramebufferTexture(buffer.x, buffer.y);
    tex.minFilter = tex.magFilter = LinearFilter;
    uniforms.tScene.value = tex;
    uniforms.uRes.value.copy(buffer);
  }

  return {
    get power() { return power; },
    /* → whether the lens has anything to draw this frame */
    update(dt, H) {
      const on = flags.lens && pointer.inside && pointer.mouse;
      const want = on ? (pointer.overCopy ? 0.3 : 1) : 0;
      power += (want - power) * (1 - Math.exp(-dt * 6));

      const pr = renderer.getPixelRatio();
      time += dt;
      uniforms.uTime.value = time;
      emit += dt;
      const speed = Math.hypot(pointer.vx, pointer.vy);
      if (on && flags.ripple && speed > FAST && emit > EMIT) {
        emit = 0;
        const t = trail.reduce((a, b) => (b.age > a.age ? b : a));
        t.x = pointer.x; t.y = pointer.y; t.age = 0;
        t.amp = Math.min(speed / 2600, 1);
      }
      let rippling = false;
      trail.forEach((t, i) => {
        t.age += dt;
        const amp = t.age < LIFE ? t.amp * (1 - t.age / LIFE) : 0;
        if (amp > 0.002) rippling = true;
        uniforms.uTrail.value[i].set(t.x * pr, (H - t.y) * pr, t.age, amp);
      });

      uniforms.uMouse.value.set(pointer.x * pr, (H - pointer.y) * pr);
      uniforms.uPr.value = pr;
      uniforms.uPower.value = power;
      uniforms.uAberr.value = flags.aberration ? 1 : 0;
      uniforms.uRipple.value = flags.ripple ? 1 : 0;
      return power > 0.002 || (flags.ripple && rippling);
    },
    /* right after the scene was drawn to the canvas */
    render() {
      fit();
      renderer.copyFramebufferToTexture(tex);
      const clear = renderer.autoClear;
      renderer.autoClear = false;
      renderer.render(scene, camera);
      renderer.autoClear = clear;
    }
  };
}
