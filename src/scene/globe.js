import {
  AdditiveBlending, BackSide, BufferAttribute, BufferGeometry, EdgesGeometry, Group,
  IcosahedronGeometry, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial,
  Points, PointsMaterial, ShaderMaterial, SphereGeometry, Vector3
} from 'three';

const NODES = 140;
const WIRE_OPACITY = 0.3;
const NODE_SIZE = 0.22;

/* Wireframe icosahedron over a dark body, nodes on the surface and a fresnel
   rim. The body is drawn first and writes depth, which is what hides the far
   half of the wireframe, the nodes and the arcs — without it the globe reads
   as a flat tangle of lines. */
export function createGlobe({ R, colors, lite, glow }) {
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

  /* fibonacci sphere: an even spread without the clustering at the poles a
     latitude/longitude grid would give */
  const count = lite ? NODES / 2 : NODES;
  const nodes = [];
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const th = i * golden;
    const v = new Vector3(Math.cos(th) * r, y, Math.sin(th) * r).multiplyScalar(R * 1.005);
    nodes.push(v);
    v.toArray(pos, i * 3);
    (Math.random() < 0.25 ? colors.magenta : colors.lilac).toArray(col, i * 3);
  }
  const nodeGeo = new BufferGeometry();
  nodeGeo.setAttribute('position', new BufferAttribute(pos, 3));
  nodeGeo.setAttribute('color', new BufferAttribute(col, 3));
  const nodePoints = new Points(nodeGeo, new PointsMaterial({
    size: 0, map: glow, vertexColors: true, transparent: true, opacity: 0,
    blending: AdditiveBlending, depthWrite: false, sizeAttenuation: true
  }));
  core.add(nodePoints);

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

  return {
    core,
    aura,
    nodes,
    /* sizes of Points do not follow their parent's scale, so the fitted world
       scale comes in explicitly */
    update({ time, dt, state, reveal, alpha, scale }) {
      core.rotation.y += dt * state.spin;
      core.rotation.x = Math.sin(time * 0.2) * state.wobble;
      core.scale.setScalar(0.6 + 0.4 * reveal);
      body.material.opacity = 0.85 * reveal;
      wire.material.opacity = WIRE_OPACITY * alpha;
      nodePoints.material.size = NODE_SIZE * reveal * scale;
      nodePoints.material.opacity = alpha;
      aura.material.uniforms.uStrength.value = (state.aura + Math.sin(time * 1.5) * 0.08) * alpha;
    }
  };
}
