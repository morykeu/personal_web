/* What the scene does while each section is the one being read.
   Keys are the sections' ids. scroll.js eases between neighbours, so every
   numeric field here is safe to animate; `frame` picks a composition from
   layout.js and is not interpolated.

   Phase 1 only designs the hero. Every other section starts as a copy of it —
   replace a spread with that section's own values when it gets one. */

const hero = {
  frame: 'hero',     // where the globe sits (layout.js)
  spin: 0.09,        // core rotation, rad/s
  wobble: 0.08,      // core tilt sway, rad
  packets: 1,        // packet speed multiplier
  aura: 0.55,        // fresnel rim strength
  intensity: 1,      // overall brightness of globe, arcs and orbits
  stars: 0.75        // starfield opacity
};

export const states = {
  hero,
  about: { ...hero },
  work: { ...hero },
  handson: { ...hero },
  education: { ...hero },
  projects: { ...hero },
  contact: { ...hero }
};

/* document order — the order ScrollTrigger hands sections over in */
export const ORDER = ['hero', 'about', 'work', 'handson', 'education', 'projects', 'contact'];
