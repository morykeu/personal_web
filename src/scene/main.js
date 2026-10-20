/* The gate. The page is complete without anything in src/scene — this file
   decides how much of it a visitor gets, and downloads only that:

     prefers-reduced-motion   nothing: native scroll, CSS background
     save-data, no WebGL2     smooth scroll and the section micro-animations
     or no GPU for it         (src/motion); CSS background stays
     otherwise                all of that and the 3D scene

   three.js sits behind a dynamic import, so it is a separate chunk that is
   never fetched by anyone in the first two rows.

   For those rows the fallback is the original CSS background (grid + glows),
   not a pre-rendered still of the scene: it costs nothing, needs no image, and
   is the only option that works at all without WebGL. */

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const saveData = Boolean(navigator.connection && navigator.connection.saveData);

/* The probe is the scene's own context. three r186 is WebGL2-only, so WebGL1
   would not help, and failIfMajorPerformanceCaveat turns away a context the
   browser would draw in software — no GPU, hardware acceleration switched
   off, a blocklisted driver. The scene would run there, but in stutters, and
   the CSS background is the better page.

   Creating a WebGL context is the most expensive single call on the page:
   the first one sets up the channel to the GPU, ~100 ms on a fast desktop
   and the bulk of the blocking time Lighthouse measures on a phone. The
   probe used to be thrown away and the renderer made a second one; now the
   probe is made with the attributes the renderer needs and handed to it
   (scene.js), so that cost is paid once. */
const ATTRIBUTES = {
  alpha: true, antialias: true, depth: true, stencil: false,
  premultipliedAlpha: true, preserveDrawingBuffer: false,
  powerPreference: 'default', failIfMajorPerformanceCaveat: true
};
function createContext() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2', ATTRIBUTES);
    return gl ? { canvas, gl } : null;
  } catch {
    return null;
  }
}

/* Two frames: the first runs just before the browser's first paint, the
   second just after it. */
const afterFirstPaint = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

async function start() {
  const root = document.documentElement;
  /* scroll and motion are small and leave together straight away */
  const scrollReady = import('./scroll.js');
  const motionReady = import('../motion/index.js');
  /* Three.js is by far the largest download on the page, so it waits until
     the page has painted once: it used to leave at ~140 ms and share the
     line with the fonts while the headline was still unpainted (~315 ms).
     The loader covers the gap; the shaders still compile under it. */
  const sceneReady = !saveData
    ? afterFirstPaint().then(() => {
      const context = createContext();
      return context && import('./scene.js').then(mod => ({ mod, context }), err => {
        context.gl.getExtension('WEBGL_lose_context')?.loseContext();
        throw err;
      });
    })
    : null;

  /* The loader (app.js) holds at 100 % while this class is on, so the shaders
     compile under it — but for 1.2 s at most; a slow scene fades in after the
     reveal instead of keeping the page covered. scene.js takes the class off
     and announces km:scene once it is ready. */
  if (sceneReady) root.classList.add('scene-pending');
  const settle = () => {
    if (!root.classList.contains('scene-pending')) return;
    root.classList.remove('scene-pending');
    window.dispatchEvent(new CustomEvent('km:scene'));
  };

  const { initScroll } = await scrollReady;
  const scroll = initScroll();
  /* the page reads fine without them, so a failure stays a warning */
  try {
    (await motionReady).initMotion(scroll);
  } catch (err) {
    document.documentElement.classList.remove('has-motion');
    console.warn('[motion] disabled:', err);
  }
  if (!sceneReady) return;

  try {
    const ready = await sceneReady;
    if (!ready) return;                  // no WebGL2, or none with a GPU behind it
    await ready.mod.initScene(scroll, ready.context);
  } catch (err) {
    /* the CSS background is still in place and nothing depends on the scene */
    document.querySelector('canvas.scene')?.remove();
    root.classList.remove('has-scene', 'scene-behind');
    root.removeAttribute('data-trace-handoff');
    window.dispatchEvent(new CustomEvent('km:trace'));
    console.warn('[scene] disabled:', err);
  } finally {
    settle();
  }
}

if (!reducedMotion) start();
