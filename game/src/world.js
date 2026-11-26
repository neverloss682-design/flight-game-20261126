// Canyon Dawn Run — world.js
// One job: the canyon itself. Terrain height, the river, the mesas, the two
// airstrips and the ring course — all pure functions of (x, z) and the seed,
// so the world the screenshots show is the world the physics flies in.

import { WORLD, MISSIONS } from './config.js';
import { mulberry32, noise1, clamp, lerp } from './random.js';

// Fixed mesa landmarks: flat-topped buttes the pilot can navigate by.
// Each is [x, z, radius, height] in metres.
export const MESAS = [
  [-420, 900, 190, 210],
  [430, 1500, 210, 240],
  [-390, 2300, 170, 185],
  [410, 3100, 230, 265],
  [-440, 3900, 200, 225],
  [380, 4600, 190, 200],
  [-300, 5200, 160, 170],
];

export function riverX(z) {
  return 62 * Math.sin(z * 0.0016 + 0.5) + 18 * Math.sin(z * 0.0041 + 2.1);
}

export function canyonHalfWidth(z) {
  // A wide turning bowl around the finish strip: the rescue mission has to
  // turn 180 degrees there, and a 180-degree turn needs room to swing in.
  const bowl = 130 * Math.exp(-(((z - WORLD.finishStripZ) / 420) ** 2));
  return (
    WORLD.canyonBase +
    WORLD.canyonAmp1 * Math.sin(z * 0.0011) +
    WORLD.canyonAmp2 * Math.sin(z * 0.00037 + 1.7) +
    bowl
  );
}

// Height of the ground in metres at world (x, z).
export function terrainHeight(x, z) {
  // Rolling desert floor.
  let h =
    WORLD.floorBase +
    16 * Math.sin(x * 0.02 + z * 0.008) +
    9 * Math.sin(x * 0.047 - z * 0.013) +
    5 * noise1(11, z * 0.01) * 2;

  // The river carves a shallow channel through the floor.
  const rx = riverX(z);
  const dRiver = Math.abs(x - rx);
  h -= 13 * Math.exp(-((dRiver / 26) * (dRiver / 26)));

  // Canyon walls rise beyond the half-width.
  const ax = Math.abs(x);
  const w = canyonHalfWidth(z);
  if (ax > w) {
    const over = ax - w;
    h += 130 + Math.pow(over, WORLD.wallPower) * WORLD.wallRise;
    // Strata steps on the wall face.
    h += 14 * Math.sin(over * 0.045 + z * 0.002);
  }

  // Flat-topped mesas punch through the floor.
  for (let i = 0; i < MESAS.length; i++) {
    const m = MESAS[i];
    const dx = x - m[0];
    const dz = z - m[1];
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < m[2]) {
      const t = 1 - d / m[2];
      const top = m[3] * (0.55 + 0.45 * t * t);
      h = Math.max(h, WORLD.floorBase + top - 30 * (1 - t));
    }
  }

  // Flatten the ground under both airstrips so a landing is fair.
  h = flattenStrip(h, x, z, WORLD.startStripZ);
  h = flattenStrip(h, x, z, WORLD.finishStripZ);
  return h;
}

// The strip itself is dead flat; the ground blends back to desert over 80 m
// outside its rectangle, so a takeoff or landing is never judged by a bump.
function flattenStrip(h, x, z, stripZ) {
  const dz = Math.abs(z - stripZ) - WORLD.stripLength / 2;
  const dx = Math.abs(x) - WORLD.stripWidth / 2;
  const d = Math.max(dz, dx);
  if (d < 80) {
    const w = d <= 0 ? 1 : 1 - d / 80;
    return lerp(h, WORLD.floorBase + 2, w * w);
  }
  return h;
}

export function onStrip(x, z, stripZ) {
  return (
    Math.abs(x) < WORLD.stripWidth / 2 &&
    Math.abs(z - stripZ) < WORLD.stripLength / 2
  );
}

export function onAnyStrip(x, z) {
  return onStrip(x, z, WORLD.startStripZ) || onStrip(x, z, WORLD.finishStripZ);
}

// The ring course: one ring after another down the canyon, weaving across
// the river so the pilot banks left and right the whole way.
export function buildRings(mission) {
  const rng = mulberry32(20261126);
  const rings = [];
  const count = mission.rings;
  for (let i = 0; i < count; i++) {
    const t = (i + 1) / (count + 1);
    const z = 500 + t * (WORLD.finishStripZ - 900);
    const rx = riverX(z);
    // Alternate sides of the river; the last ring sits over the finish strip.
    const side = i % 2 === 0 ? -1 : 1;
    const spread = 60 + rng() * 70;
    const x = i === count - 1 ? 0 : rx + side * spread * 0.5;
    const y = 125 + 55 * Math.sin(i * 1.3 + 0.8) + rng() * 25;
    rings.push({
      index: i,
      x,
      y,
      z,
      radius: 26,
      fuel: mission.fuelRings.includes(i + 1),
      passed: false,
    });
  }
  return rings;
}

// A windsock, a hangar and a fuel drum at each strip — landmarks the pilot
// recognises on final approach.
export function stripProps(stripZ) {
  return [
    { kind: 'windsock', x: 34, z: stripZ + 120 },
    { kind: 'hangar', x: -52, z: stripZ + 60 },
    { kind: 'hangar', x: -52, z: stripZ + 110 },
    { kind: 'drum', x: 30, z: stripZ + 150 },
    { kind: 'drum', x: 36, z: stripZ + 158 },
  ];
}

export function missionById(id) {
  return MISSIONS[id] || MISSIONS.ringrun;
}
