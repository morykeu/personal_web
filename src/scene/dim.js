import { DataTexture, LinearFilter, RedFormat, UnsignedByteType, Vector2, Vector4 } from 'three';

/* The scene dims itself under text, softly. Nothing is cut out and nothing
   has an edge: every block of copy leaves a blurred low spot in the scene's
   brightness, lowest right under the words and back to full a few dozen
   pixels away. How low depends on the text: half brightness under the white
   copy, a quarter under the muted grey (which takes least behind it — the
   globe's own lines at 45 % took it under 4.5:1 a pixel or two from the
   letters), in between for violet and magenta, from each line's own colour. Contrast at the letters themselves comes from the dark aura
   every piece of text carries while the scene runs (style.css, .has-scene);
   this only keeps the scene from shouting under it.

   The mask is a small greyscale texture of the whole document (one texel per
   SCALE CSS px), so scrolling costs nothing — the shaders look it up at the
   page position under each pixel. It is redrawn only when the copy moves:
   a resize, a change of language, the fonts landing, a section's reveal
   ending. The fixed header gets the same treatment as one band across the
   top of the window, in the shader.

   Every scene material gets the same few lines appended to its fragment
   shader (apply), and the lens pass reads the same texture for the drop. */

const SCALE = 8;               // CSS px per texel
const PAD = 20;                // px the full dimming reaches past each line…
const BLUR = 2;                // …then a blur of this radius in texels, three passes
/* brightness right under text, from the brightest background the text can
   take at 4.5:1 (lmax, linear): the muted grey's 0.0153 gets the floor.
   The brightest things in the scene — points and sprites (packets, nodes,
   stars, the beacon), the glowing arcs (packets, project links) and the
   orbits — dim twice over (the square); the globe's lines and body once.
   A packet's glow, then a project link's arc, crossing a project description
   was what took the muted copy lowest otherwise. */
const LOW = 0.15, HIGH = 0.5;
const dimFor = lmax => Math.min(Math.max(LOW * Math.pow(lmax / 0.0153, 0.45), LOW), HIGH);
const HEAD = 0.6;              // under the header, which has its own veil on top
const HEAD_FADE = 40;          // px below the header's edge until it is full again

const chunk = /* glsl */`
  uniform sampler2D tKmDim;
  uniform vec4 uKmMap;   // 1 / pixel ratio, window height, scroll, header's lower edge (CSS px)
  uniform vec2 uKmDoc;   // what the texture spans, CSS px
  float kmDim() {
    vec2 css = gl_FragCoord.xy * uKmMap.x;
    float y = uKmMap.y - css.y;
    float page = texture2D(tKmDim, vec2(css.x, y + uKmMap.z) / uKmDoc).r;
    float head = mix(${HEAD.toFixed(3)}, 1.0, smoothstep(uKmMap.w, uKmMap.w + ${HEAD_FADE.toFixed(1)}, y));
    return min(page, head);
  }
`;

const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);

/* the brightest background an element's text can take at 4.5:1 */
function limit(el, styles, wrap) {
  const cs = styles(el);
  const color = (el instanceof SVGElement ? cs.fill : cs.color).match(/[\d.]+/g).map(Number);
  let op = color.length > 3 ? color[3] : 1;
  for (let e = el; e && e !== wrap; e = e.parentElement) op *= parseFloat(styles(e).opacity);
  /* not shown yet (a section before its reveal): the faintest it will be, .9 */
  if (op < 0.1) op = 0.9;
  const over = (c, ink) => c * op + ink * (1 - op);
  const L = lum(over(color[0], 5), over(color[1], 5), over(color[2], 10));
  return Math.max((L + 0.05) / 4.5 - 0.05, 0.001);
}

/* three passes of a box blur ≈ a gaussian, separable, in place */
function blur(src, w, h, r) {
  const tmp = new Float32Array(src.length);
  const pass = (from, to, n, m, stride, step) => {
    for (let j = 0; j < m; j++) {
      const base = j * stride;
      let acc = 0;
      for (let i = -r; i <= r; i++) acc += from[base + Math.min(Math.max(i, 0), n - 1) * step];
      for (let i = 0; i < n; i++) {
        to[base + i * step] = acc / (2 * r + 1);
        acc += from[base + Math.min(i + r + 1, n - 1) * step] - from[base + Math.max(i - r, 0) * step];
      }
    }
  };
  for (let k = 0; k < 3; k++) {
    pass(src, tmp, w, h, w, 1);     // rows
    pass(tmp, src, h, w, 1, w);     // columns
  }
}

export function createDim() {
  const wrap = document.querySelector('.wrap');
  const uniforms = {
    tKmDim: { value: null },
    uKmMap: { value: new Vector4(1, 1, 0, 0) },
    uKmDoc: { value: new Vector2(1, 1) }
  };
  let texture = null;

  function measure() {
    const docW = document.documentElement.clientWidth;
    const docH = document.documentElement.scrollHeight;
    const w = Math.ceil(docW / SCALE), h = Math.ceil(docH / SCALE);
    const dark = new Float32Array(w * h);   // 1 − brightness, the stricter wins
    const sy = window.scrollY;
    const cache = new Map();
    const styles = el => { let s = cache.get(el); if (!s) cache.set(el, s = getComputedStyle(el)); return s; };
    const walker = document.createTreeWalker(wrap, NodeFilter.SHOW_TEXT, {
      acceptNode: n => (n.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT)
    });
    const range = document.createRange();
    for (let n; (n = walker.nextNode()); ) {
      const el = n.parentElement;
      if (!el || el.closest('header, script, style, noscript')) continue;
      range.selectNodeContents(n);
      const d = 1 - dimFor(limit(el, styles, wrap));
      for (const r of range.getClientRects()) {
        if (r.width < 1 || r.height < 1) continue;
        const x0 = Math.max(Math.floor((r.left - PAD) / SCALE), 0);
        const x1 = Math.min(Math.ceil((r.right + PAD) / SCALE), w);
        const y0 = Math.max(Math.floor((r.top + sy - PAD) / SCALE), 0);
        const y1 = Math.min(Math.ceil((r.bottom + sy + PAD) / SCALE), h);
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = y * w + x; if (dark[i] < d) dark[i] = d; }
      }
    }
    blur(dark, w, h, BLUR);
    /* a lone line comes out of the blur at ~0.85 of its value in its middle;
       lifting the whole thing by that keeps the full dimming under every line
       and only softens the outside */
    const data = new Uint8Array(w * h);
    for (let i = 0; i < data.length; i++) data[i] = Math.round((1 - Math.min(dark[i] / 0.85, 1 - LOW)) * 255);
    if (!texture || texture.image.width !== w || texture.image.height !== h) {
      texture?.dispose();
      texture = new DataTexture(data, w, h, RedFormat, UnsignedByteType);
      texture.minFilter = texture.magFilter = LinearFilter;
      texture.unpackAlignment = 1;
      uniforms.tKmDim.value = texture;
    } else {
      texture.image.data.set(data);
    }
    texture.needsUpdate = true;
    uniforms.uKmDoc.value.set(w * SCALE, h * SCALE);
  }

  let timer = 0;
  const soon = () => { clearTimeout(timer); timer = setTimeout(measure, 80); };
  new ResizeObserver(soon).observe(document.body);
  window.addEventListener('km:lang', soon);
  document.fonts?.ready.then(soon);
  /* a section slides 22px into place as it is revealed: the mask is redrawn
     once it has arrived, not while it moves */
  document.addEventListener('transitionend', e => { if (e.target.classList?.contains('rv')) soon(); });
  measure();

  return {
    uniforms,
    chunk,
    apply(material, bright = false) {
      material.onBeforeCompile = shader => {
        Object.assign(shader.uniforms, uniforms);
        const fs = shader.fragmentShader;
        const end = fs.lastIndexOf('}');
        const dim = bright ? '  float kmD = kmDim();\n  gl_FragColor.a *= kmD * kmD;\n' : '  gl_FragColor.a *= kmDim();\n';
        shader.fragmentShader = chunk + fs.slice(0, end) + dim + '}' + fs.slice(end + 1);
      };
    },
    /* per frame: where the page is, and where the header ends */
    update(scrollY, H, pr, headerBottom) {
      uniforms.uKmMap.value.set(1 / pr, H, scrollY, headerBottom);
    }
  };
}
