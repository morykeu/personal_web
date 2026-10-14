/* The gate. The page is complete without anything in src/scene — this file
   decides how much of it a visitor gets, and downloads only that:

     prefers-reduced-motion   nothing: native scroll, CSS background
     save-data or no WebGL2   smooth scroll only; CSS background stays
     otherwise                smooth scroll and the 3D scene

   three.js sits behind a dynamic import, so it is a separate chunk that is
   never fetched by anyone in the first two rows.

   For those rows the fallback is the original CSS background (grid + glows),
   not a pre-rendered still of the scene: it costs nothing, needs no image, and
   is the only option that works at all without WebGL. */

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const saveData = Boolean(navigator.connection && navigator.connection.saveData);

/* three r186 is WebGL2-only, so WebGL1 support would not help. The probe
   context is released straight away rather than left for the GC. */
function hasWebGL2() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

async function start() {
  /* both requests leave together rather than one after the other */
  const scrollReady = import('./scroll.js');
  const sceneReady = !saveData && hasWebGL2() ? import('./scene.js') : null;

  const { initScroll } = await scrollReady;
  const scroll = initScroll();
  if (!sceneReady) return;

  try {
    const { initScene } = await sceneReady;
    await initScene(scroll);
  } catch (err) {
    /* the CSS background is still in place and nothing depends on the scene */
    document.querySelector('canvas.scene')?.remove();
    document.documentElement.classList.remove('has-scene');
    console.warn('[scene] disabled:', err);
  }
}

if (!reducedMotion) start();
