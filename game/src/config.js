// Canyon Dawn Run — config.js
// One job: every tunable number, mission definition and palette in one place,
// so the rest of the game reads like a flight plan, not a pile of magic numbers.

export const VIEW = {
  width: 1280,
  height: 720,
  fov: 74, // vertical field of view in degrees
};

export const WORLD = {
  courseLength: 5600, // metres from the start strip to the finish strip
  startStripZ: 0,
  finishStripZ: 5600,
  stripLength: 420,
  stripWidth: 26,
  // Canyon half-width breathes along the course so no two stretches look alike.
  canyonBase: 250,
  canyonAmp1: 95,
  canyonAmp2: 55,
  floorBase: 42,
  wallRise: 0.085, // steepness of the canyon walls
  wallPower: 1.35,
  ceiling: 520, // soft altitude ceiling (thin air above this)
  groundClearance: 2.6, // metres of gear below the fuselage
};

export const PLANE = {
  stallSpeed: 52, // knots: below this the wing stops flying
  maxSpeed: 205, // knots at full throttle, level flight
  cruiseSpeed: 132,
  accel: 26, // knots per second toward the throttle target
  pitchRate: 0.62, // radians per second of elevator authority
  rollRate: 1.9, // radians per second of aileron authority
  turnFactor: 0.42, // heading change per radian of bank, scaled by speed
  sinkAtStall: 9.5, // metres per second lost when stalled
  climbRate: 11, // metres per second at full power, nose up
  fuelCapacity: 100,
  fuelBurn: 0.95, // units per second at full throttle
  fuelBurnIdle: 0.22,
  fuelRingBonus: 26, // fuel a gold ring gives back
  hardLandingVs: -7.5, // vertical speed (m/s) that breaks the gear
};

export const WIND = {
  base: 9, // knots of steady crosswind from the west
  gustAmp: 12, // knots of gust on top of the base
  gustSpeed: 0.55, // how fast the gusts breathe
  push: 0.038, // lateral acceleration per knot of crosswind
  turbulence: 0.05, // roll wobble in gusts
};

// The three missions share one canyon and one course; only the goal changes.
// That is the point: one world, three different decisions.
export const MISSIONS = {
  ringrun: {
    id: 'ringrun',
    key: '1',
    name: 'RING RUN',
    tagline: 'Thread all 8 rings, then put her down on the desert strip.',
    rings: 8,
    fuelRings: [3, 6], // gold rings that refuel
    timeLimit: 360,
    startFuel: 100,
    rescue: false,
  },
  rescue: {
    id: 'rescue',
    key: '2',
    name: 'RESCUE RUN',
    tagline: 'Land on the strip, pick up the stranded hiker, fly home through 3 rings.',
    rings: 3,
    fuelRings: [1, 3],
    timeLimit: 420,
    startFuel: 100,
    rescue: true,
  },
  timetrial: {
    id: 'timetrial',
    key: '3',
    name: 'TIME TRIAL',
    tagline: 'Same canyon, 150 seconds on the clock, no fuel rings. Fly clean.',
    rings: 8,
    fuelRings: [],
    timeLimit: 150,
    startFuel: 100,
    rescue: false,
  },
};

export const RING_POINTS = 100;
export const RING_TIME_BONUS = 12; // seconds added per ring in Time Trial
export const LANDING_CENTER_BONUS = 150;
export const LANDING_SOFT_BONUS = 150;

// Dawn palette: one style for sky, rock, river and glass.
export const PALETTE = {
  skyTop: '#1b2340',
  skyMid: '#5a3a63',
  skyHorizon: '#ff9a52',
  skyLow: '#ffc27a',
  sunCore: '#fff3c4',
  sunGlow: '#ff8a3c',
  sandLit: '#d9a06a',
  sandShade: '#8a5a3d',
  rockBand1: '#7a4636',
  rockBand2: '#9c5f43',
  rockBand3: '#b97a52',
  rockTop: '#e0aa72',
  river: '#3d84c4',
  riverGlint: '#ffd27a',
  ringCyan: '#37f2e2',
  ringGold: '#ffc93c',
  ringDone: '#7dff8a',
  hudAmber: '#ffb454',
  hudGreen: '#7dff8a',
  hudRed: '#ff5a4e',
  hudCyan: '#7de8ff',
  panelBg: 'rgba(10, 12, 24, 0.82)',
  panelEdge: '#3a4668',
};
