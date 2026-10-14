import { AdditiveBlending, BufferAttribute, BufferGeometry, Points, PointsMaterial } from 'three';

/* A shell of dust around the camera. It starts further out than in the
   prototype (22 rather than 12 units): the camera sits 14 units from the
   centre, and stars that close to it rendered as large blobs. */
export function createStars({ colors, glow, count }) {
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = 22 + Math.random() * 48;
    const u = Math.random() * 2 - 1;
    const th = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    pos[i * 3] = Math.cos(th) * s * r;
    pos[i * 3 + 1] = u * r;
    pos[i * 3 + 2] = Math.sin(th) * s * r;
    const c = Math.random() < 0.15 ? colors.magenta : (Math.random() < 0.5 ? colors.violet : colors.lilac);
    c.toArray(col, i * 3);
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setAttribute('color', new BufferAttribute(col, 3));
  const points = new Points(geo, new PointsMaterial({
    size: 0.24, map: glow, vertexColors: true, transparent: true, opacity: 0,
    blending: AdditiveBlending, depthWrite: false
  }));

  return {
    points,
    update({ time, opacity }) {
      points.rotation.y = time * 0.01;
      points.material.opacity = opacity;
    }
  };
}
