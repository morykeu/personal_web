import {
  AdditiveBlending, BufferGeometry, EllipseCurve, Group, LineBasicMaterial, LineLoop,
  Sprite, SpriteMaterial, Vector3
} from 'three';

/* Rings are line loops rather than the thin ring meshes the prototype used.
   Fitted into the hero the world is scaled to roughly a third, and a 0.012-unit
   annulus would shrink below a pixel and shimmer; a line stays one pixel wide
   at any scale. */
export function createOrbits({ R, colors, glow }) {
  const defs = [
    { radius: R * 1.55, tiltX: 0.35, tiltZ: 0.2, color: colors.violet, opacity: 0.35 },
    { radius: R * 1.85, tiltX: -0.5, tiltZ: -0.4, color: colors.magenta, opacity: 0.22 },
    { radius: R * 2.25, tiltX: 0.15, tiltZ: 0.9, color: colors.lilac, opacity: 0.12 }
  ];
  const group = new Group();

  const rings = defs.map(d => {
    const pts = new EllipseCurve(0, 0, d.radius, d.radius, 0, Math.PI * 2).getPoints(160);
    const line = new LineLoop(
      new BufferGeometry().setFromPoints(pts),
      new LineBasicMaterial({
        color: d.color, transparent: true, opacity: 0,
        blending: AdditiveBlending, depthWrite: false
      })
    );
    line.rotation.set(Math.PI / 2 + d.tiltX, 0, d.tiltZ);
    line.updateMatrix();
    const sat = new Sprite(new SpriteMaterial({
      map: glow, color: d.color, transparent: true, opacity: 0,
      blending: AdditiveBlending, depthWrite: false
    }));
    sat.scale.setScalar(0.28);
    line.add(sat);
    group.add(line);
    return { line, sat, d, speed: 0.15 + Math.random() * 0.25, phase: Math.random() * Math.PI * 2 };
  });

  return {
    group,
    /* points along every ring in the group's own space, for fitting */
    hull() {
      const out = [];
      for (const { line, d } of rings) {
        for (let i = 0; i < 48; i++) {
          const a = (i / 48) * Math.PI * 2;
          /* a little past the ring, so the satellite glow counts too */
          out.push(new Vector3(Math.cos(a) * d.radius * 1.04, Math.sin(a) * d.radius * 1.04, 0).applyMatrix4(line.matrix));
        }
      }
      return out;
    },
    update({ time, alpha }) {
      for (const r of rings) {
        const ang = r.phase + time * r.speed;
        r.sat.position.set(Math.cos(ang) * r.d.radius, Math.sin(ang) * r.d.radius, 0);
        r.line.material.opacity = r.d.opacity * alpha;
        r.sat.material.opacity = alpha;
      }
    }
  };
}
