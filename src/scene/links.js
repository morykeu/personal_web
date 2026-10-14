import {
  AdditiveBlending, BufferAttribute, BufferGeometry, DynamicDrawUsage, Group,
  LineSegments, Points, PointsMaterial, ShaderMaterial, Vector3
} from 'three';

const SEG = 64;
const LIFT = 0.6;             // higher than the traffic arcs, so they read as separate
const SPEED = 0.16;           // laps per second of the light running along each link
const END_SIZE = 0.75;
const PACKET_SIZE = 1.1;

/* The highlighted connections of the projects state: one per project, steady
   rather than recycled, with lit ends and a packet that keeps running along.
   The ends are fixed nodes picked once, spread round the globe and away from
   "me", so every link stays a different, readable arc. */
export function createLinks({ R, globe, count, colors, glow }) {
  const { nodes, me } = globe;
  const used = new Set([me]);
  const nearest = (lat, lon) => {
    const want = new Vector3(Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon));
    let best = -1;
    nodes.forEach((v, i) => {
      if (!used.has(i) && (best < 0 || v.dot(want) > nodes[best].dot(want))) best = i;
    });
    used.add(best);
    return best;
  };
  const pairs = Array.from({ length: count }, (_, k) => {
    const lon = (k / count) * Math.PI * 2 + 0.4;
    const lat = (k % 2 ? -1 : 1) * 0.38;
    return [nearest(lat, lon), nearest(-lat * 0.7, lon + 1.45)];
  });

  const vPer = SEG * 2;
  const pos = new Float32Array(count * vPer * 3);
  const aT = new Float32Array(count * vPer);
  const aLink = new Float32Array(count * vPer);
  for (let k = 0; k < count; k++) {
    for (let s = 0; s < SEG; s++) {
      const i = k * vPer + s * 2;
      aT[i] = s / SEG;
      aT[i + 1] = (s + 1) / SEG;
      aLink[i] = aLink[i + 1] = k;
    }
  }
  const geo = new BufferGeometry();
  const posAttr = new BufferAttribute(pos, 3).setUsage(DynamicDrawUsage);
  geo.setAttribute('position', posAttr);
  geo.setAttribute('aT', new BufferAttribute(aT, 1));
  geo.setAttribute('aLink', new BufferAttribute(aLink, 1));

  const heads = new Float32Array(Math.max(count, 1));
  const lineMat = new ShaderMaterial({
    transparent: true, depthWrite: false, blending: AdditiveBlending,
    defines: { LINK_COUNT: Math.max(count, 1) },
    uniforms: {
      uHeads: { value: heads },
      c1: { value: colors.magenta },
      c2: { value: colors.white },
      uAlpha: { value: 0 }
    },
    vertexShader: /* glsl */`
      attribute float aT;
      attribute float aLink;
      varying float vT;
      varying float vLink;
      void main() {
        vT = aT;
        vLink = aLink;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform float uHeads[LINK_COUNT];
      uniform vec3 c1;
      uniform vec3 c2;
      uniform float uAlpha;
      varying float vT;
      varying float vLink;
      void main() {
        float head = uHeads[int(vLink + 0.5)];
        float glow = smoothstep(head - 0.3, head, vT) * step(vT, head);
        gl_FragColor = vec4(mix(c1, c2, glow * 0.7), (0.55 + glow * 0.45) * uAlpha);
        #include <colorspace_fragment>
      }`
  });
  const lines = new LineSegments(geo, lineMat);
  lines.frustumCulled = false;

  const endPos = new Float32Array(count * 2 * 3);
  const endGeo = new BufferGeometry();
  const endAttr = new BufferAttribute(endPos, 3).setUsage(DynamicDrawUsage);
  endGeo.setAttribute('position', endAttr);
  const ends = new Points(endGeo, new PointsMaterial({
    size: 0, map: glow, color: colors.magenta, transparent: true, opacity: 0,
    blending: AdditiveBlending, depthWrite: false
  }));
  ends.frustumCulled = false;

  const pktPos = new Float32Array(count * 3);
  const pktGeo = new BufferGeometry();
  const pktAttr = new BufferAttribute(pktPos, 3).setUsage(DynamicDrawUsage);
  pktGeo.setAttribute('position', pktAttr);
  const pkts = new Points(pktGeo, new PointsMaterial({
    size: 0, map: glow, color: colors.white, transparent: true, opacity: 0,
    blending: AdditiveBlending, depthWrite: false
  }));
  pkts.frustumCulled = false;

  const group = new Group();
  group.add(lines, ends, pkts);

  const ctrl = pairs.map(() => new Vector3());
  const _p = new Vector3();
  const point = (k, t, out) => {
    const [a, b] = pairs[k], u = 1 - t;
    return out.copy(nodes[a]).multiplyScalar(u * u).addScaledVector(ctrl[k], 2 * u * t).addScaledVector(nodes[b], t * t);
  };
  let seenVersion = -1;
  function build() {
    pairs.forEach(([a, b], k) => {
      ctrl[k].addVectors(nodes[a], nodes[b]).multiplyScalar(0.5).setLength(R + nodes[a].distanceTo(nodes[b]) * LIFT);
      const o = k * vPer * 3;
      for (let s = 0; s < SEG; s++) {
        point(k, s / SEG, _p).toArray(pos, o + s * 6);
        point(k, (s + 1) / SEG, _p).toArray(pos, o + s * 6 + 3);
      }
      nodes[a].toArray(endPos, k * 6);
      nodes[b].toArray(endPos, k * 6 + 3);
    });
    posAttr.needsUpdate = true;
    endAttr.needsUpdate = true;
  }

  return {
    group,
    update({ time, alpha, scale }) {
      group.visible = alpha > 0.002;
      if (!group.visible) return;
      if (globe.version !== seenVersion) { seenVersion = globe.version; build(); }
      lineMat.uniforms.uAlpha.value = alpha;
      ends.material.opacity = alpha;
      ends.material.size = END_SIZE * scale;
      pkts.material.opacity = alpha;
      pkts.material.size = PACKET_SIZE * scale;
      for (let k = 0; k < count; k++) {
        /* each link on its own phase; the head runs past the end so the
           trail can drain before the next lap */
        heads[k] = ((time * SPEED + k * 0.37) % 1) * 1.3;
        point(k, Math.min(heads[k], 1), _p).toArray(pktPos, k * 3);
      }
      pktAttr.needsUpdate = true;
    }
  };
}
