import {
  AdditiveBlending, BufferGeometry, Euler, EllipseCurve, Group, LineBasicMaterial, LineLoop,
  Matrix4, Quaternion, Sprite, SpriteMaterial, Vector3
} from 'three';

/* Rings are line loops rather than the thin ring meshes the prototype used: a
   line stays one pixel wide at any scale, where a thin annulus would shrink
   below a pixel and shimmer.

   Every ring is drawn as a unit circle and given its radius, tilt and height
   through its matrix each frame, so the states can move them freely:
     spread  0 hugging the globe … 1 the prototype's wide orbits … beyond
     align   0 each ring on its own tilt … 1 all parallel
     stack   vertical gap between the rings, globe radii
   In the hero they hug: the free space beside the headline is a circle, and a
   wide ring would either cross the headline or leave the screen. */
const ALIGNED = { tiltX: 0.32, tiltZ: 0 };

export function createOrbits({ R, colors, glow }) {
  const defs = [
    { hug: 1.06, wide: 1.55, tiltX: 0.35, tiltZ: 0.2, color: colors.violet, opacity: 0.35 },
    { hug: 1.1, wide: 1.85, tiltX: -0.5, tiltZ: -0.4, color: colors.magenta, opacity: 0.22 },
    { hug: 1.14, wide: 2.25, tiltX: 0.15, tiltZ: 0.9, color: colors.lilac, opacity: 0.12 }
  ];
  const group = new Group();
  const circle = new BufferGeometry().setFromPoints(new EllipseCurve(0, 0, 1, 1, 0, Math.PI * 2).getPoints(160));

  const rings = defs.map((d, i) => {
    const line = new LineLoop(circle, new LineBasicMaterial({
      color: d.color, transparent: true, opacity: 0,
      blending: AdditiveBlending, depthWrite: false
    }));
    line.matrixAutoUpdate = false;
    const sat = new Sprite(new SpriteMaterial({
      map: glow, color: d.color, transparent: true, opacity: 0,
      blending: AdditiveBlending, depthWrite: false
    }));
    sat.scale.setScalar(0.28);
    group.add(line, sat);
    return { line, sat, d, level: i - 1, speed: 0.15 + Math.random() * 0.25, phase: Math.random() * Math.PI * 2 };
  });

  const _q = new Quaternion(), _e = new Euler(), _o = new Vector3(), _s = new Vector3();
  const mix = (a, b, t) => a + (b - a) * t;

  return {
    group,
    update({ dt, alpha, spread, align, stack, sats }) {
      for (const r of rings) {
        const { d } = r;
        const radius = R * mix(d.hug, d.wide, spread);
        _e.set(Math.PI / 2 + mix(d.tiltX, ALIGNED.tiltX, align), 0, mix(d.tiltZ, ALIGNED.tiltZ, align));
        r.line.matrix.compose(_o.set(0, r.level * stack * R * align, 0), _q.setFromEuler(_e), _s.setScalar(radius));
        r.line.matrixWorldNeedsUpdate = true;

        r.phase += dt * r.speed * sats;
        r.sat.position.set(Math.cos(r.phase), Math.sin(r.phase), 0).applyMatrix4(r.line.matrix);
        r.line.material.opacity = Math.min(d.opacity * alpha, 1);
        r.sat.material.opacity = Math.min(alpha, 1);
      }
    }
  };
}
