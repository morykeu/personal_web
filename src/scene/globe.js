import {
  AdditiveBlending, BackSide, BufferAttribute, BufferGeometry, DynamicDrawUsage, EdgesGeometry,
  Group, IcosahedronGeometry, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial,
  Points, PointsMaterial, ShaderMaterial, SphereGeometry, Sprite, SpriteMaterial, Vector3
} from 'three';

const NODES = 140;
const WIRE_OPACITY = 0.3;
const NODE_SIZE = 0.22;
/* how tightly a cluster gathers: each node keeps this share of its distance
   from the cluster's centre, so the cluster is a shrunken patch of the same
   even pattern rather than a random heap */
const TIGHT = 0.3;
const PING = 2.4;           // seconds per pulse of the ring around "me"
const TURN = 3;             // how firmly `face` steers, 1/s

const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const wrap = a => a - Math.PI * 2 * Math.floor((a + Math.PI) / (Math.PI * 2));

/* fibonacci sphere: an even spread without the clustering at the poles a
   latitude/longitude grid would give */
function fibonacci(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2, r = Math.sqrt(1 - y * y), th = i * GOLDEN;
    out.push(new Vector3(Math.cos(th) * r, y, Math.sin(th) * r));
  }
  return out;
}

/* Cluster centres kept off the poles (|latitude| ≤ ~50°) and spread round by
   the golden angle: seen from the camera's low angle a polar cluster would sit
   on the rim, edge-on. */
function clusterCentres(n) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const y = 0.75 * (1 - (2 * (k + 0.5)) / n), r = Math.sqrt(1 - y * y), th = k * GOLDEN;
    out.push(new Vector3(Math.cos(th) * r, y, Math.sin(th) * r));
  }
  return out;
}

/* Wireframe icosahedron over a dark body, nodes on the surface, a fresnel rim
   and the one node that stands for "me". The body is drawn first and writes
   depth, which is what hides the far half of the wireframe, the nodes and the
   arcs — without it the globe reads as a flat tangle of lines.

   Node positions are live: `cluster` slides every node between its place in
   the even spread and its place in a cluster. They are shared with the arcs
   and the project links, which rebuild whenever `version` moves. */
export function createGlobe({ R, colors, lite, glow, ring, clusters }) {
  const core = new Group();

  const body = new Mesh(
    new SphereGeometry(R * 0.985, lite ? 32 : 48, lite ? 32 : 48),
    new MeshBasicMaterial({ color: colors.body, transparent: true, opacity: 0 })
  );
  body.renderOrder = -1;
  core.add(body);

  const wire = new LineSegments(
    new EdgesGeometry(new IcosahedronGeometry(R, 2)),
    new LineBasicMaterial({
      color: colors.violet, transparent: true, opacity: 0,
      blending: AdditiveBlending, depthWrite: false
    })
  );
  core.add(wire);

  const count = lite ? NODES / 2 : NODES;
  const dirs = fibonacci(count);

  /* "me": the node nearest a point a little above the equator, so that facing
     the camera, which looks down slightly, it sits near the middle */
  const meDir = new Vector3(0, Math.sin(0.28), Math.cos(0.28));
  let me = 0;
  dirs.forEach((d, i) => { if (d.dot(meDir) > dirs[me].dot(meDir)) me = i; });

  const n = Math.max(1, clusters);
  const centres = clusterCentres(n);
  const clusterOf = dirs.map(d => {
    let best = 0;
    centres.forEach((c, k) => { if (d.dot(c) > d.dot(centres[best])) best = k; });
    return best;
  });
  const members = centres.map((_, k) => clusterOf.flatMap((c, i) => (c === k ? [i] : [])));
  const gathered = dirs.map((d, i) => centres[clusterOf[i]].clone().lerp(d, TIGHT).normalize());

  const nodes = dirs.map(d => d.clone().multiplyScalar(R * 1.005));
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  nodes.forEach((v, i) => {
    v.toArray(pos, i * 3);
    (i === me || Math.random() < 0.25 ? colors.magenta : colors.lilac).toArray(col, i * 3);
  });
  const nodeGeo = new BufferGeometry();
  const posAttr = new BufferAttribute(pos, 3).setUsage(DynamicDrawUsage);
  nodeGeo.setAttribute('position', posAttr);
  nodeGeo.setAttribute('color', new BufferAttribute(col, 3));
  const nodePoints = new Points(nodeGeo, new PointsMaterial({
    size: 0, map: glow, vertexColors: true, transparent: true, opacity: 0,
    blending: AdditiveBlending, depthWrite: false, sizeAttenuation: true
  }));
  nodePoints.frustumCulled = false;   // positions move in place; cached bounds would go stale
  core.add(nodePoints);

  /* The "me" marker: a magenta glow and a ring that keeps pinging outwards.
     Sized in pixels rather than world units (sizeAttenuation off): with the
     camera closed in on this node, a world-sized glow swelled to a third of
     the screen. */
  const sprite = map => new Sprite(new SpriteMaterial({
    map, color: colors.magenta, transparent: true, opacity: 0,
    blending: AdditiveBlending, depthWrite: false, sizeAttenuation: false
  }));
  const meGlow = sprite(glow);
  const mePing = sprite(ring);
  core.add(meGlow, mePing);

  const aura = new Mesh(
    new SphereGeometry(R * 1.18, 64, 64),
    new ShaderMaterial({
      side: BackSide, transparent: true, depthWrite: false, blending: AdditiveBlending,
      uniforms: { c1: { value: colors.violet }, c2: { value: colors.magenta }, uStrength: { value: 0 } },
      vertexShader: /* glsl */`
        varying vec3 vN;
        varying vec3 vP;
        void main() {
          vN = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vP = mv.xyz;
          gl_Position = projectionMatrix * mv;
        }`,
      /* colors arrive in linear space (three's colour management), so the
         result has to be encoded for the sRGB canvas like built-in materials */
      fragmentShader: /* glsl */`
        uniform vec3 c1;
        uniform vec3 c2;
        uniform float uStrength;
        varying vec3 vN;
        varying vec3 vP;
        void main() {
          float d = clamp(-dot(vN, normalize(-vP)), 0.0, 1.0);
          float f = pow(d, 2.2);
          vec3 col = mix(c1, c2, clamp(vN.y * 0.5 + 0.5, 0.0, 1.0));
          gl_FragColor = vec4(col, f * uStrength);
          #include <colorspace_fragment>
        }`
    })
  );

  let version = 0;
  let clustered = -1;
  function setCluster(c) {
    if (Math.abs(c - clustered) < 1e-4) return;
    clustered = c;
    nodes.forEach((v, i) => {
      v.copy(dirs[i]).lerp(gathered[i], c).normalize().multiplyScalar(R * 1.005).toArray(pos, i * 3);
    });
    posAttr.needsUpdate = true;
    meGlow.position.copy(nodes[me]);
    mePing.position.copy(nodes[me]);
    version++;
  }
  setCluster(0);

  return {
    core,
    aura,
    nodes,
    me,
    clusterOf,
    members,
    get version() { return version; },
    /* sizes of Points do not follow their parent's scale, so the world scale
       comes in explicitly (already corrected for the camera angle) */
    /* marker: { size: glow diameter in px, px: sprite scale per px at the
       globe's own scale } */
    update({ time, dt, state, reveal, alpha, scale, auraBoost, marker }) {
      setCluster(state.cluster);

      core.rotation.y += dt * state.spin;
      /* Steering rather than setting: the spin keeps running and `face` pulls
         against it, so blending in and out of a facing state never jumps. The
         node's own longitude moves with clustering, so it is read live. */
      if (state.face > 0.001) {
        const want = state.yaw - Math.atan2(nodes[me].x, nodes[me].z);
        core.rotation.y += wrap(want - core.rotation.y) * (1 - Math.exp(-dt * TURN * state.face));
      }
      core.rotation.x = Math.sin(time * 0.2) * state.wobble;
      const grow = 0.6 + 0.4 * reveal;
      core.scale.setScalar(grow);

      body.material.opacity = 0.85 * reveal;
      /* the body dims with the rest, or a dimmed globe would still be a flat
         lit disc behind the copy */
      body.material.color.copy(colors.body).multiplyScalar(0.3 + 0.7 * Math.min(state.bright, 1));
      wire.material.opacity = WIRE_OPACITY * alpha;
      nodePoints.material.size = NODE_SIZE * reveal * scale;
      nodePoints.material.opacity = alpha;
      aura.material.uniforms.uStrength.value =
        (state.aura + Math.sin(time * 1.5) * 0.08) * alpha + auraBoost * reveal;

      /* the marker is not dimmed with the rest — it is the point of the state */
      const lit = state.focus * reveal;
      const unit = (marker.size * marker.px) / grow;
      meGlow.material.opacity = lit;
      meGlow.scale.setScalar(unit * (1 + 0.08 * Math.sin(time * 2.6)));
      const ph = (time % PING) / PING;
      mePing.material.opacity = lit * 0.9 * (1 - ph) * (1 - ph);
      mePing.scale.setScalar(unit * (0.6 + 2.6 * ph));
    }
  };
}
