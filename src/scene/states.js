/* What the scene does while each section is read. Keys are the sections' ids.
   Between two neighbouring sections the scene is blended by scroll position
   (scroll.js measures it, scene.js mixes), so every value except `place` has
   to be a number — anything here can be tuned without touching the renderer.

   Placement
     place     'hero': the largest circle free of the hero copy, measured from
               the page (layout.js); x / y / size are then ignored
     x, y      centre of the globe, share of the viewport width / height
     size      diameter of the globe, share of the viewport's shorter side
     fov       camera angle, degrees. The globe keeps the size above whatever
               this is, so a wider angle is a camera closer to it — the near
               side swells and the far side falls away
     parallax  pointer parallax, 0 … 1
   Light
     bright    globe, arcs and orbits; 1 full. Kept low wherever the globe sits
               behind copy: nothing dims the scene under text, so this
               is what keeps the copy over it readable (style.css :root)
     aura      fresnel rim
     stars     starfield
   Motion
     spin      globe rotation, rad/s
     wobble    nodding, rad
   Network
     packets   arcs in flight, × the base count (26; 13 on touch screens)
     speed     packet speed, ×
     lift      arc height, share of the chord
     cluster   0 nodes spread evenly … 1 gathered into one cluster per item
               in #work (counted from the page)
     links     0 … 1 highlighted connections, one per item in #projects
   The "me" node
     focus     0 … 1 lit magenta, with a pulsing ring
     face      0 … 1 how firmly it is turned to the camera
     yaw       where it is turned: 0 straight at the camera, negative to the
               left of it, rad
     beacon    0 … 1 sends a packet towards the camera every few seconds
   Orbits
     rings     opacity, ×
     spread    0 hugging the globe … 1 wide … more: wider still
     align     0 each ring on its own tilt … 1 all parallel
     stack     vertical gap between the rings once parallel, globe radii
     sats      satellite speed, × */

const base = {
  x: 0.75, y: 0.5, size: 0.6, fov: 45, parallax: 1,
  bright: 1, aura: 0.55, stars: 0.75,
  spin: 0.09, wobble: 0.08,
  packets: 1, speed: 1, lift: 0.4, cluster: 0, links: 0,
  focus: 0, face: 0, yaw: 0, beacon: 0,
  rings: 1, spread: 0, align: 0, stack: 0, sats: 1
};

export const states = {
  /* beside the headline, as large as the free space allows, full light. The
     rings hug the globe here: wide ones would cross the headline or run off
     the screen (layout.js has the numbers). */
  hero: { ...base, place: 'hero' },

  /* the camera closes in on one node — "me" — while the rest of the globe
     steps aside to the right and dims */
  about: {
    ...base, x: 0.86, y: 0.52, size: 1.3, fov: 72,
    bright: 0.36, aura: 0.35, stars: 0.6, spin: 0.02, wobble: 0,
    packets: 0.45, speed: 0.6, focus: 1, face: 1, yaw: -0.3, rings: 0.3
  },

  /* nodes gather into one cluster per item, arcs run between the clusters */
  work: {
    ...base, x: 0.8, y: 0.5, size: 0.7,
    bright: 0.6, spin: 0.07, wobble: 0.05, packets: 1.1, lift: 0.5, cluster: 1, spread: 0.3
  },

  /* a packet stream: more arcs, faster, a faster turn */
  handson: {
    ...base, x: 0.76, y: 0.5, size: 0.82,
    bright: 0.5, spin: 0.32, wobble: 0.03, packets: 1.6, speed: 2, lift: 0.55, spread: 0.45, sats: 1.6
  },

  /* the rings move apart and line up, the satellites slow down: a timeline */
  education: {
    ...base, x: 0.8, y: 0.5, size: 0.4,
    bright: 0.6, spin: 0.04, wobble: 0.02, packets: 0.4, speed: 0.6,
    rings: 1.5, spread: 1.45, align: 1, stack: 0.75, sats: 0.25
  },

  /* calm, with one highlighted connection per project */
  projects: {
    ...base, x: 0.8, y: 0.5, size: 0.62,
    bright: 0.6, spin: 0.035, wobble: 0.03, packets: 0.3, speed: 0.5, links: 1, spread: 0.5
  },

  /* centred behind the address; every few seconds the "me" node sends a
     packet towards the viewer */
  contact: {
    ...base, x: 0.5, y: 0.52, size: 0.72,
    bright: 0.3, aura: 0.45, spin: 0.025, wobble: 0, packets: 0.25, speed: 0.5,
    focus: 0.55, face: 1, yaw: 0, beacon: 1, rings: 0.6, spread: 0.7
  }
};

/* Touch screens get a simpler version of every state: the globe sits behind
   the copy, dimmer, and the camera never closes in. Element counts are already
   halved in scene.js. The hero keeps its measured placement — on a phone that
   is behind the copy anyway (layout.js). */
export function forTouch(state) {
  const out = {
    ...state, x: 0.5, y: 0.46, size: 1, fov: 45, parallax: 0,
    bright: Math.min(state.bright, 0.4), packets: Math.min(state.packets, 1)
  };
  return out;
}

/* document order — the order the sections hand the scene over in */
export const ORDER = ['hero', 'about', 'work', 'handson', 'education', 'projects', 'contact'];

/* the numeric fields, in a fixed order, so a state can travel as a plain array */
export const KEYS = Object.keys(base);
