import { AdditiveBlending, Sprite, SpriteMaterial, Vector3 } from 'three';

const PERIOD = 4.2;           // seconds between packets
const FLIGHT = 2.2;           // seconds each one travels
const REACH = 0.62;           // how far towards the camera it gets before it is gone
const SIZE = 0.3;             // world units at scale 1
const PULSE = 0.3;            // aura flare as a packet leaves

/* The contact state's closing gesture: every few seconds the "me" node sends a
   packet towards the viewer, and the aura flares softly as it leaves.

   The packet travels along the line from the node to the camera, which every
   point of projects onto the same spot on screen — so on screen it does not
   cross anything, it only grows and fades where the node is. A slight lift
   keeps it from looking like a node that merely swelled. It fades out well
   before it would fill the view. */
export function createBeacon({ colors, glow }) {
  const pool = [0, 1].map(() => {
    const sprite = new Sprite(new SpriteMaterial({
      map: glow, color: colors.magenta, transparent: true, opacity: 0,
      blending: AdditiveBlending, depthWrite: false, depthTest: false
    }));
    sprite.visible = false;
    return { sprite, t: -1, from: new Vector3(), to: new Vector3() };
  });
  let clock = PERIOD - 1, last = -Infinity, time = 0;
  const lift = new Vector3();

  return {
    sprites: pool.map(p => p.sprite),
    /* → the aura flare for this frame */
    update({ dt, beacon, origin, camera, scale, reveal }) {
      time += dt;
      clock += dt;
      if (beacon > 0.5 && reveal > 0.9 && clock >= PERIOD) {
        const p = pool.find(q => q.t < 0);
        if (p) {
          clock = 0;
          last = time;
          p.t = 0;
          p.from.copy(origin);
          lift.set(0, 0.5 * scale, 0);
          p.to.copy(origin).lerp(camera.position, REACH).add(lift);
        }
      }
      for (const p of pool) {
        if (p.t < 0) continue;
        p.t += dt / FLIGHT;
        if (p.t >= 1) { p.t = -1; p.sprite.visible = false; continue; }
        const e = p.t * p.t;                                  // eases away from the node
        p.sprite.visible = true;
        p.sprite.position.lerpVectors(p.from, p.to, e);
        p.sprite.scale.setScalar(SIZE * scale);
        const env = Math.min(p.t / 0.12, 1) * (1 - Math.max(0, (p.t - 0.45) / 0.55));
        p.sprite.material.opacity = env * beacon * reveal;
      }
      const since = time - last;
      return PULSE * beacon * Math.exp(-(since * since) / 0.5);
    }
  };
}
