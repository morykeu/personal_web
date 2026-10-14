import {
  AdditiveBlending, BufferAttribute, BufferGeometry, DynamicDrawUsage, Group,
  LineSegments, Points, QuadraticBezierCurve3, ShaderMaterial, Vector3
} from 'three';

const ARCS = 26;
const SEG = 48;               // segments per arc
const LIFT = 0.45;            // arc apex height, as a share of the chord
const TRAIL = 0.35;           // trail length, as a share of the arc
const PACKET_SIZE = 0.75;

/* Furthest any arc can reach from the centre: the longest allowed chord,
   lifted. layout fitting needs it as part of the composition's hull. */
export const arcReach = R => R + 5 * LIFT;

/* All arcs live in one LineSegments and all packets in one Points, so the
   whole network is two draw calls instead of two per route. Routes are recycled
   in place — when a packet lands its arc is rewritten into the same buffer
   rather than allocating fresh geometry and a material each time. */
export function createNetwork({ R, nodes, colors, lite, glow }) {
  const count = lite ? ARCS / 2 : ARCS;
  const vPerArc = SEG * 2;

  const pos = new Float32Array(count * vPerArc * 3);
  const aT = new Float32Array(count * vPerArc);
  const aArc = new Float32Array(count * vPerArc);
  for (let a = 0; a < count; a++) {
    for (let s = 0; s < SEG; s++) {
      const i = a * vPerArc + s * 2;
      aT[i] = s / SEG;
      aT[i + 1] = (s + 1) / SEG;
      aArc[i] = aArc[i + 1] = a;
    }
  }
  const arcGeo = new BufferGeometry();
  const posAttr = new BufferAttribute(pos, 3).setUsage(DynamicDrawUsage);
  arcGeo.setAttribute('position', posAttr);
  arcGeo.setAttribute('aT', new BufferAttribute(aT, 1));
  arcGeo.setAttribute('aArc', new BufferAttribute(aArc, 1));

  const heads = new Float32Array(count);
  const arcMat = new ShaderMaterial({
    transparent: true, depthWrite: false, blending: AdditiveBlending,
    defines: { ARC_COUNT: count, TRAIL: TRAIL.toFixed(3) },
    uniforms: {
      uHeads: { value: heads },
      c1: { value: colors.violet },
      c2: { value: colors.magenta },
      uBase: { value: 0.1 },
      uAlpha: { value: 0 }
    },
    vertexShader: /* glsl */`
      attribute float aT;
      attribute float aArc;
      varying float vT;
      varying float vArc;
      void main() {
        vT = aT;
        vArc = aArc;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform float uHeads[ARC_COUNT];
      uniform vec3 c1;
      uniform vec3 c2;
      uniform float uBase;
      uniform float uAlpha;
      varying float vT;
      varying float vArc;
      void main() {
        float head = uHeads[int(vArc + 0.5)];
        float trail = smoothstep(head - TRAIL, head, vT) * step(vT, head);
        gl_FragColor = vec4(mix(c1, c2, trail), (uBase + trail * 0.95) * uAlpha);
        #include <colorspace_fragment>
      }`
  });
  const arcLines = new LineSegments(arcGeo, arcMat);
  arcLines.frustumCulled = false;   // positions change in place; the cached bounds would go stale

  const pktPos = new Float32Array(count * 3);
  const pktAlpha = new Float32Array(count);
  const pktGeo = new BufferGeometry();
  const pktPosAttr = new BufferAttribute(pktPos, 3).setUsage(DynamicDrawUsage);
  const pktAlphaAttr = new BufferAttribute(pktAlpha, 1).setUsage(DynamicDrawUsage);
  pktGeo.setAttribute('position', pktPosAttr);
  pktGeo.setAttribute('aAlpha', pktAlphaAttr);
  const pktMat = new ShaderMaterial({
    transparent: true, depthWrite: false, blending: AdditiveBlending,
    uniforms: {
      uMap: { value: glow },
      uColor: { value: colors.white },
      uSize: { value: 0 },
      uScale: { value: 1 },
      uOpacity: { value: 0 }
    },
    vertexShader: /* glsl */`
      attribute float aAlpha;
      uniform float uSize;
      uniform float uScale;
      varying float vAlpha;
      void main() {
        vAlpha = aAlpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = uSize * uScale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap;
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vAlpha;
      void main() {
        float a = texture2D(uMap, gl_PointCoord).a * vAlpha * uOpacity;
        gl_FragColor = vec4(uColor, a);
        #include <colorspace_fragment>
      }`
  });
  const packets = new Points(pktGeo, pktMat);
  packets.frustumCulled = false;

  const group = new Group();
  group.add(arcLines, packets);

  const routes = [];
  const tmp = new Vector3();

  function route(a, delay) {
    let from, to, d, tries = 0;
    do {
      from = nodes[(Math.random() * nodes.length) | 0];
      to = nodes[(Math.random() * nodes.length) | 0];
      d = from.distanceTo(to);
    } while ((d < 1.6 || d > 5) && ++tries < 50);
    const mid = from.clone().add(to).multiplyScalar(0.5).setLength(R + d * LIFT);
    const pts = new QuadraticBezierCurve3(from, mid, to).getPoints(SEG);
    const base = a * vPerArc * 3;
    for (let s = 0; s < SEG; s++) {
      pts[s].toArray(pos, base + s * 6);
      pts[s + 1].toArray(pos, base + s * 6 + 3);
    }
    posAttr.needsUpdate = true;
    routes[a] = { pts, t: -Math.random() * delay, speed: 0.35 + Math.random() * 0.35 };
  }
  for (let a = 0; a < count; a++) route(a, 3);

  return {
    group,
    update({ dt, speed, running, alpha, scale, pointScale }) {
      arcMat.uniforms.uAlpha.value = alpha;
      pktMat.uniforms.uOpacity.value = alpha;
      pktMat.uniforms.uSize.value = PACKET_SIZE * scale;
      pktMat.uniforms.uScale.value = pointScale;
      for (let a = 0; a < count; a++) {
        const r = routes[a];
        if (running) r.t += dt * r.speed * speed;
        heads[a] = r.t;
        if (r.t >= 0 && r.t <= 1) {
          const f = r.t * SEG, i = Math.min(f | 0, SEG - 1);
          tmp.lerpVectors(r.pts[i], r.pts[i + 1], f - i).toArray(pktPos, a * 3);
          pktAlpha[a] = 1;
        } else {
          pktAlpha[a] = 0;
        }
        if (r.t > 1 + TRAIL) route(a, 1.5);
      }
      pktPosAttr.needsUpdate = true;
      pktAlphaAttr.needsUpdate = true;
    }
  };
}
