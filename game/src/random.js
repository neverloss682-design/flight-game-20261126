// Canyon Dawn Run — random.js
// One job: a tiny seeded generator so the canyon, the gusts and every
// screenshot are exactly reproducible from one seed number.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Deterministic value-noise: smooth, repeatable, no lookup tables.
export function noise1(seed, x) {
  const xi = Math.floor(x);
  const xf = x - xi;
  const s = mulberry32((seed ^ (xi * 374761393 + 668265263)) >>> 0);
  const a = s();
  const b = mulberry32((seed ^ ((xi + 1) * 374761393 + 668265263)) >>> 0)();
  const u = xf * xf * (3 - 2 * xf); // smoothstep
  return a + (b - a) * u;
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function deg(rad) {
  return (rad * 180) / Math.PI;
}

export function rad(deg) {
  return (deg * Math.PI) / 180;
}

// Format helpers the HUD and the end screen share.
export function pad2(n) {
  return String(n).padStart(2, '0');
}

export function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return pad2(Math.floor(s / 60)) + ':' + pad2(s % 60);
}

export function formatHeading(radians) {
  let d = Math.round(deg(radians)) % 360;
  if (d < 0) d += 360;
  return String(d).padStart(3, '0');
}
