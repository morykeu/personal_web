import { CanvasTexture } from 'three';

/* Textures are painted once on a 2D canvas rather than shipped as images: no
   extra request, and nothing that would need blob: or data: in the CSP. */
function paint(draw) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  draw(c.getContext('2d'));
  return new CanvasTexture(c);
}

/* the soft round falloff every point and sprite is drawn with */
export function glowTexture() {
  return paint(g => {
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.18, 'rgba(255,255,255,.85)');
    grd.addColorStop(0.45, 'rgba(255,255,255,.18)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
  });
}

/* a thin ring with a soft edge, for the ping around the "me" node */
export function ringTexture() {
  return paint(g => {
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0.72, 'rgba(255,255,255,0)');
    grd.addColorStop(0.84, 'rgba(255,255,255,1)');
    grd.addColorStop(0.96, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
  });
}
