import {
  AdditiveBlending, BufferAttribute, BufferGeometry, DynamicDrawUsage, Group,
  LineSegments, Points, ShaderMaterial, Vector3
} from 'three';

const BASE = 26;              // arcs in flight at `packets: 1`
const POOL = 42;              // enough for the busiest state (handson asks for 1.6×)
const SEG = 40;               // segments per arc
const TRAIL = 0.35;           // trail length, as a share of the arc
const PACKET_SIZE = 0.75;
/* the mouse: a packet within REACH of the ray under it runs up to RUSH× faster */
const REACH = 1.1;
const RUSH = 1.8;

/* Arcs between nodes, each carrying a packet with a glowing trail. All arcs
   live in one LineSegments and all packets in one Points, so the whole network
   is two draw calls. Routes are recycled in place rather than allocated.

   An arc stores the two node indices it joins, not their positions: the nodes
   move (clustering), and the arc is rebuilt from them whenever they do, so the
   ends stay attached. Arcs beyond the count the state asks for finish their
   flight and then park, collapsed to a point, until they are wanted again. */
export function createNetwork({ R, globe, colors, lite, glow }) {
  const base = lite ? BASE / 2 : BASE;
  const count = lite ? BASE / 2 : POOL;     // touch: never more than Phase 1 had
  const { nodes, members } = globe;
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

  const heads = new Float32Array(count).fill(-1);
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

  const arcs = Array.from({ length: count }, () => ({ a: 0, b: 0, t: 0, speed: 1, live: false }));
  const ctrl = Array.from({ length: count }, () => new Vector3());
  const _p = new Vector3();
  let lift = 0.4, seenVersion = -1, primed = false, dirty = false;

  const any = () => (Math.random() * nodes.length) | 0;
  const from = list => list[(Math.random() * list.length) | 0];

  /* With clustering on, an arc joins two different clusters — the whole point
     of that state is traffic between them. Otherwise any two nodes whose chord
     is neither trivially short nor straight through the globe. */
  function pick(r, cluster) {
    if (members.length > 1 && Math.random() < cluster) {
      const k = (Math.random() * members.length) | 0;
      const j = (k + 1 + ((Math.random() * (members.length - 1)) | 0)) % members.length;
      r.a = from(members[k]);
      r.b = from(members[j]);
      return;
    }
    let tries = 0, d;
    do {
      r.a = any();
      r.b = any();
      d = nodes[r.a].distanceTo(nodes[r.b]) / R;
    } while ((d < 0.53 || d > 1.67) && ++tries < 50);
  }

  const point = (i, t, out) => {
    const r = arcs[i], u = 1 - t;
    return out.copy(nodes[r.a]).multiplyScalar(u * u)
      .addScaledVector(ctrl[i], 2 * u * t)
      .addScaledVector(nodes[r.b], t * t);
  };

  /* quadratic bezier lifted off the surface by a share of its chord */
  function build(i) {
    const r = arcs[i];
    const d = nodes[r.a].distanceTo(nodes[r.b]);
    ctrl[i].addVectors(nodes[r.a], nodes[r.b]).multiplyScalar(0.5).setLength(R + d * lift);
    const o = i * vPerArc * 3;
    for (let s = 0; s < SEG; s++) {
      point(i, s / SEG, _p).toArray(pos, o + s * 6);
      point(i, (s + 1) / SEG, _p).toArray(pos, o + s * 6 + 3);
    }
  }

  function park(i) {
    arcs[i].live = false;
    heads[i] = -1;
    pktAlpha[i] = 0;
    pos.fill(0, i * vPerArc * 3, (i + 1) * vPerArc * 3);
    dirty = true;
  }

  function route(i, delay, cluster) {
    const r = arcs[i];
    pick(r, cluster);
    r.t = -Math.random() * delay;
    r.speed = 0.35 + Math.random() * 0.35;
    r.live = true;
    build(i);
    dirty = true;
  }

  for (let i = 0; i < count; i++) park(i);

  return {
    group,
    update({ dt, packets: wanted, speed, lift: nextLift, cluster, running, alpha, scale, pointScale, probe }) {
      const near = probe && probe.s > 0.001;
      arcMat.uniforms.uAlpha.value = alpha;
      pktMat.uniforms.uOpacity.value = alpha;
      pktMat.uniforms.uSize.value = PACKET_SIZE * scale;
      pktMat.uniforms.uScale.value = pointScale;

      const want = Math.min(count, Math.round(wanted * base));
      const rebuild = globe.version !== seenVersion || Math.abs(nextLift - lift) > 1e-4;
      seenVersion = globe.version;
      lift = nextLift;

      for (let i = 0; i < count; i++) {
        const r = arcs[i];
        if (!r.live) {
          if (i >= want) continue;
          route(i, primed ? 1.2 : 3, cluster);   // the first batch staggered wider
        } else if (rebuild) {
          build(i);
          dirty = true;
        }
        let rush = 1;
        if (near && pktAlpha[i] > 0) {
          /* last frame's position is close enough to judge by */
          _p.fromArray(pktPos, i * 3).sub(probe.o);
          const t = _p.dot(probe.d);
          const d = _p.addScaledVector(probe.d, -t).length();
          if (d < REACH) rush += RUSH * probe.s * (1 - d / REACH);
        }
        if (running) r.t += dt * r.speed * speed * rush;
        if (r.t > 1 + TRAIL) {
          if (i < want) route(i, 0.6, cluster);
          else { park(i); continue; }
        }
        heads[i] = r.t;
        if (r.t >= 0 && r.t <= 1) {
          point(i, r.t, _p).toArray(pktPos, i * 3);
          pktAlpha[i] = 1;
        } else {
          pktAlpha[i] = 0;
        }
      }
      primed = true;
      if (dirty) posAttr.needsUpdate = true;
      dirty = false;
      pktPosAttr.needsUpdate = true;
      pktAlphaAttr.needsUpdate = true;
    }
  };
}
