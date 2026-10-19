import { Vector4 } from 'three';

/* Holes in the whole scene: under the hero headline's letters, and under the
   fixed header.

   Every other piece of text has a scrim (style.css); the headline does not
   while the globe sits beside it — its 17ch box runs well past its last
   letter, and a scrim on the box would black out the globe's own space. So
   nothing may be drawn under the letters instead: a random star behind the
   violet word was measured taking it down to 4.6:1, and while the globe
   travels to the about state it crosses the headline outright.

   The hole is cut per line of ink (layout.js measures them), a few pixels
   wider and with a short feather — well inside the 40px the globe keeps from
   the letters, so it never bites into the globe in the hero.

   The header has a veil (70 % of the page colour, blurred), but its 11px nav
   and language labels are muted, and with the globe sliding under it on its
   way to the about state they were measured down to 4.54:1. The scene simply
   stops at the header's lower edge instead.

   Every material gets the same few lines appended to its fragment shader. */
const MAX = 10;
const PAD = 4;
const FEATHER = 14;
const NOWHERE = -1e5;

export function createCopyMask() {
  const holes = Array.from({ length: MAX }, () => new Vector4(NOWHERE, NOWHERE, NOWHERE, NOWHERE));
  const uniforms = { uHoles: { value: holes }, uFeather: { value: FEATHER } };
  const chunk = /* glsl */`
    uniform vec4 uHoles[${MAX}];
    uniform float uFeather;
    float kmHole() {
      float m = 1.0;
      for (int i = 0; i < ${MAX}; i++) {
        vec2 d = max(uHoles[i].xy - gl_FragCoord.xy, gl_FragCoord.xy - uHoles[i].zw);
        m = min(m, smoothstep(0.0, uFeather, max(d.x, d.y)));
      }
      return m;
    }
  `;

  return {
    /* premultiplied: the material writes colour already multiplied by its
       alpha (the lens, which copies the finished frame), so the hole has to
       take the colour away too, not only the alpha */
    apply(material, premultiplied = false) {
      const cut = premultiplied ? 'gl_FragColor *= kmHole();' : 'gl_FragColor.a *= kmHole();';
      material.onBeforeCompile = shader => {
        Object.assign(shader.uniforms, uniforms);
        const fs = shader.fragmentShader;
        const end = fs.lastIndexOf('}');
        shader.fragmentShader = chunk + fs.slice(0, end) + `  ${cut}\n}` + fs.slice(end + 1);
      };
    },
    /* `page` in document px, moving with the scroll; `fixed` in viewport px.
       gl_FragCoord is in buffer pixels from the bottom-left, so both are
       flipped and scaled. */
    update({ page, fixed }, scrollY, H, pr) {
      uniforms.uFeather.value = FEATHER * pr;
      const rects = [...fixed, ...page.map(l => ({ l: l.l, r: l.r, t: l.t - scrollY, b: l.b - scrollY }))];
      for (let i = 0; i < MAX; i++) {
        const l = rects[i];
        if (!l) { holes[i].set(NOWHERE, NOWHERE, NOWHERE, NOWHERE); continue; }
        holes[i].set((l.l - PAD) * pr, (H - l.b - PAD) * pr, (l.r + PAD) * pr, (H - l.t + PAD) * pr);
      }
    }
  };
}
