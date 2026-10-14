import { CanvasTexture } from 'three';

/* The soft round falloff every point and sprite is drawn with. Painted once on
   a 2D canvas rather than shipped as an image: no extra request, and nothing
   that would need blob: or data: in the CSP. */
export function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.18, 'rgba(255,255,255,.85)');
  grd.addColorStop(0.45, 'rgba(255,255,255,.18)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return new CanvasTexture(c);
}
