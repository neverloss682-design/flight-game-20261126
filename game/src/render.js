// Canyon Dawn Run — render.js
// One job: everything the eye sees. Dawn sky, the canyon mesh, the river,
// the glowing rings, the strips, the aeroplane in chase view and the dust
// that shows the crosswind. No game logic lives here, only projection.

import { VIEW, PALETTE, WORLD } from './config.js';
import { clamp, lerp, mulberry32, deg } from './random.js';
import {
  terrainHeight,
  riverX,
  canyonHalfWidth,
  MESAS,
  stripProps,
} from './world.js';

// ---------------------------------------------------------------------------
// Camera: a chase camera that banks part-way with the plane, so the horizon
// tilts when you bank but the camera never fights the pilot.
// ---------------------------------------------------------------------------

export function makeCamera() {
  return { x: 0, y: 60, z: -160, fwd: { x: 0, y: 0, z: 1 } };
}

function project(cam, p) {
  const vx = p.x - cam.x;
  const vy = p.y - cam.y;
  const vz = p.z - cam.z;
  const cx = vx * cam.right.x + vy * cam.right.y + vz * cam.right.z;
  const cy = vx * cam.up.x + vy * cam.up.y + vz * cam.up.z;
  const cz = vx * cam.fwd.x + vy * cam.fwd.y + vz * cam.fwd.z;
  if (cz < 2) return null;
  const f = cam.focal;
  return {
    x: VIEW.width / 2 + (cx / cz) * f,
    y: VIEW.height * 0.52 - (cy / cz) * f,
    d: cz,
    scale: f / cz,
  };
}

function updateCamera(cam, plane, dt, lift = 0) {
  const fx = Math.sin(plane.heading);
  const fz = Math.cos(plane.heading);
  // Camera sits behind and above the tail, easing into place.
  const tx = plane.x - fx * 15;
  const ty = plane.y + 4.6 + Math.sin(plane.pitch) * 4 + lift;
  const tz = plane.z - fz * 15;
  const k = 1 - Math.pow(0.0001, dt); // frame-rate independent ease
  cam.x += (tx - cam.x) * k;
  cam.y += (ty - cam.y) * k;
  cam.z += (tz - cam.z) * k;

  // Look ahead of the nose, slightly above the fuselage.
  const lx = plane.x + fx * 70;
  const ly = plane.y + 2 + Math.sin(plane.pitch) * 30;
  const lz = plane.z + fz * 70;
  let fwd = { x: lx - cam.x, y: ly - cam.y, z: lz - cam.z };
  const fl = Math.hypot(fwd.x, fwd.y, fwd.z) || 1;
  fwd = { x: fwd.x / fl, y: fwd.y / fl, z: fwd.z / fl };
  cam.fwd = fwd;

  // Basis: right and up, rolled part-way with the plane's bank.
  // right = worldUp x fwd, up = fwd x right: a right-handed basis, so east
  // (+x) appears on the right of the screen when flying north. Getting the
  // cross product backwards mirrors the whole world — the pilot would steer
  // toward a ring they see and fly away from it.
  const worldUp = { x: 0, y: 1, z: 0 };
  let right = {
    x: worldUp.y * fwd.z - worldUp.z * fwd.y,
    y: worldUp.z * fwd.x - worldUp.x * fwd.z,
    z: worldUp.x * fwd.y - worldUp.y * fwd.x,
  };
  let rl = Math.hypot(right.x, right.y, right.z) || 1;
  right = { x: right.x / rl, y: right.y / rl, z: right.z / rl };
  let up = {
    x: fwd.y * right.z - fwd.z * right.y,
    y: fwd.z * right.x - fwd.x * right.z,
    z: fwd.x * right.y - fwd.y * right.x,
  };
  // Roll the camera with the plane, at half strength — enough to feel the
  // bank, never enough to lose the horizon.
  const roll = plane.roll * 0.55;
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  const r2 = {
    x: right.x * cr + up.x * sr,
    y: right.y * cr + up.y * sr,
    z: right.z * cr + up.z * sr,
  };
  const u2 = {
    x: up.x * cr - right.x * sr,
    y: up.y * cr - right.y * sr,
    z: up.z * cr - right.z * sr,
  };
  cam.right = r2;
  cam.up = u2;
  cam.focal = (VIEW.height / 2) / Math.tan(((VIEW.fov / 2) * Math.PI) / 180);
}

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------

function hexRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mixHex(a, b, t) {
  const ca = hexRgb(a);
  const cb = hexRgb(b);
  return `rgb(${Math.round(lerp(ca[0], cb[0], t))},${Math.round(
    lerp(ca[1], cb[1], t),
  )},${Math.round(lerp(ca[2], cb[2], t))})`;
}

function fogColor(base, dist) {
  const t = clamp(dist / 1000, 0, 0.85);
  return mixHex(base, PALETTE.skyHorizon, t);
}

// Terrain colour: sand floor, banded rock walls, sunlit rims, blue river.
function groundColor(x, z, h, dist) {
  const rx = riverX(z);
  if (Math.abs(x - rx) < 20 && h < WORLD.floorBase + 8) {
    const glint = 0.5 + 0.5 * Math.sin(z * 0.11 + x * 0.4);
    return fogColor(
      mixHex(PALETTE.river, PALETTE.riverGlint, glint * 0.55),
      dist,
    );
  }
  const w = canyonHalfWidth(z);
  let base;
  if (Math.abs(x) > w + 260) base = PALETTE.rockTop;
  else if (h > 210) base = PALETTE.rockBand1;
  else if (h > 150) base = PALETTE.rockBand2;
  else if (h > 95) base = PALETTE.rockBand3;
  else {
    const n = 0.5 + 0.5 * Math.sin(x * 0.09 + z * 0.05);
    base = mixHex(PALETTE.sandShade, PALETTE.sandLit, n * 0.7 + 0.15);
  }
  // Dawn light from the east: east-facing slopes catch the sun.
  return fogColor(base, dist);
}

// ---------------------------------------------------------------------------
// Scene pieces
// ---------------------------------------------------------------------------

const STARS = (() => {
  const rng = mulberry32(777);
  const out = [];
  for (let i = 0; i < 90; i++) {
    out.push({
      az: rng() * Math.PI * 2,
      el: 0.12 + rng() * 0.85,
      r: 0.6 + rng() * 1.4,
      tw: rng() * Math.PI * 2,
    });
  }
  return out;
})();

const CLOUDS = (() => {
  const rng = mulberry32(4242);
  const out = [];
  for (let i = 0; i < 16; i++) {
    out.push({
      x: (rng() - 0.5) * 1600,
      y: 330 + rng() * 130,
      z: rng() * WORLD.courseLength,
      s: 60 + rng() * 110,
    });
  }
  return out;
})();

function drawSky(ctx, cam, plane, time) {
  const g = ctx.createLinearGradient(0, 0, 0, VIEW.height);
  g.addColorStop(0, PALETTE.skyTop);
  g.addColorStop(0.42, PALETTE.skyMid);
  g.addColorStop(0.62, PALETTE.skyHorizon);
  g.addColorStop(0.78, PALETTE.skyLow);
  g.addColorStop(1, '#2a1c33');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);

  // Stars, fading as the dawn brightens near the horizon.
  const heading = Math.atan2(cam.fwd.x, cam.fwd.z);
  ctx.fillStyle = '#ffffff';
  for (const s of STARS) {
    const rel = s.az - heading;
    const sx = VIEW.width / 2 + rel * 520;
    const sy = VIEW.height * 0.52 - Math.tan(s.el) * 420;
    if (sx < -10 || sx > VIEW.width + 10 || sy < -10) continue;
    const a = clamp(s.el * 1.4 - 0.25, 0, 0.85) * (0.7 + 0.3 * Math.sin(time * 2 + s.tw));
    ctx.globalAlpha = a;
    ctx.fillRect(sx, sy, s.r, s.r);
  }
  ctx.globalAlpha = 1;

  // The sun, low in the east (to the pilot's right, ahead).
  const sunDir = { x: 0.82, y: 0.16, z: 0.55 };
  const sunP = project(cam, {
    x: cam.x + sunDir.x * 3000,
    y: cam.y + sunDir.y * 3000,
    z: cam.z + sunDir.z * 3000,
  });
  if (sunP) {
    const glow = ctx.createRadialGradient(sunP.x, sunP.y, 4, sunP.x, sunP.y, 190);
    glow.addColorStop(0, 'rgba(255, 243, 196, 0.95)');
    glow.addColorStop(0.18, 'rgba(255, 170, 80, 0.75)');
    glow.addColorStop(1, 'rgba(255, 138, 60, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sunP.x - 200, sunP.y - 200, 400, 400);
    ctx.fillStyle = PALETTE.sunCore;
    ctx.beginPath();
    ctx.arc(sunP.x, sunP.y, 26, 0, Math.PI * 2);
    ctx.fill();
  }

  // Far mesa silhouettes on the horizon, drifting with heading.
  // They are a band at the horizon only: closing them at the bottom of the
  // screen would paint a dark wall over the canyon floor when flying low.
  for (let layer = 0; layer < 2; layer++) {
    const baseY = VIEW.height * (0.47 + layer * 0.035);
    ctx.fillStyle = layer === 0 ? 'rgba(64, 32, 56, 0.85)' : 'rgba(94, 48, 62, 0.9)';
    ctx.beginPath();
    ctx.moveTo(0, baseY + 44);
    ctx.lineTo(0, baseY);
    const shift = -heading * (180 + layer * 120);
    for (let x = -100; x <= VIEW.width + 100; x += 90) {
      const h =
        26 *
        (0.5 + 0.5 * Math.sin((x + shift) * 0.011 + layer * 2.4)) *
        (0.6 + 0.4 * Math.sin((x + shift) * 0.004 + layer));
      ctx.lineTo(x, baseY - h);
    }
    ctx.lineTo(VIEW.width, baseY);
    ctx.lineTo(VIEW.width, baseY + 44);
    ctx.closePath();
    ctx.fill();
  }
}

function drawTerrain(ctx, cam) {
  // Rows of the mesh, near to far in world z, drawn far to near.
  const zStart = Math.max(-260, Math.floor(cam.z) - 80);
  const zEnd = cam.z + 980;
  const rows = [];
  let z = zStart;
  while (z < zEnd) {
    rows.push(z);
    const ahead = z - cam.z;
    z += ahead < 120 ? 42 : ahead < 320 ? 62 : ahead < 600 ? 85 : 110;
  }
  const xs = [];
  for (let x = -820; x <= 820; x += 56) xs.push(x);

  for (let ri = rows.length - 1; ri >= 0; ri--) {
    const z0 = rows[ri];
    const z1 = rows[ri + 1] !== undefined ? rows[ri + 1] : z0 + 80;
    for (let xi = 0; xi < xs.length - 1; xi++) {
      const x0 = xs[xi];
      const x1 = xs[xi + 1];
      const h00 = terrainHeight(x0, z0);
      const h10 = terrainHeight(x1, z0);
      const h01 = terrainHeight(x0, z1);
      const h11 = terrainHeight(x1, z1);
      const p00 = project(cam, { x: x0, y: h00, z: z0 });
      const p10 = project(cam, { x: x1, y: h10, z: z0 });
      const p01 = project(cam, { x: x0, y: h01, z: z1 });
      const p11 = project(cam, { x: x1, y: h11, z: z1 });
      if (!p00 || !p10 || !p01 || !p11) continue;
      const midH = (h00 + h10 + h01 + h11) / 4;
      const midX = (x0 + x1) / 2;
      const midZ = (z0 + z1) / 2;
      const dist = Math.hypot(midX - cam.x, midZ - cam.z);
      ctx.fillStyle = groundColor(midX, midZ, midH, dist);
      ctx.beginPath();
      ctx.moveTo(p00.x, p00.y);
      ctx.lineTo(p10.x, p10.y);
      ctx.lineTo(p11.x, p11.y);
      ctx.lineTo(p01.x, p01.y);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function drawStrip(ctx, cam, stripZ, isFinish, time) {
  const hw = WORLD.stripWidth / 2;
  const hl = WORLD.stripLength / 2;
  const y = WORLD.floorBase + 2.2;
  const corners = [
    project(cam, { x: -hw, y, z: stripZ - hl }),
    project(cam, { x: hw, y, z: stripZ - hl }),
    project(cam, { x: hw, y, z: stripZ + hl }),
    project(cam, { x: -hw, y, z: stripZ + hl }),
  ];
  if (corners.some((c) => !c)) return;
  const blink = 0.65 + 0.35 * Math.sin(time * 4);
  // Asphalt, light enough to read as a runway at dawn.
  ctx.fillStyle = '#4a4653';
  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  corners.slice(1).forEach((c) => ctx.lineTo(c.x, c.y));
  ctx.closePath();
  ctx.fill();
  // White edge stripes down both sides, so the strip reads from far away.
  ctx.fillStyle = 'rgba(245, 233, 200, 0.9)';
  for (const side of [-1, 1]) {
    const a = project(cam, { x: side * (hw - 1.2), y: y + 0.15, z: stripZ - hl });
    const b = project(cam, { x: side * (hw - 3.4), y: y + 0.15, z: stripZ - hl });
    const c = project(cam, { x: side * (hw - 3.4), y: y + 0.15, z: stripZ + hl });
    const d = project(cam, { x: side * (hw - 1.2), y: y + 0.15, z: stripZ + hl });
    if (!a || !b || !c || !d) continue;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(d.x, d.y);
    ctx.closePath();
    ctx.fill();
  }
  // Blue edge lights, one every 40 metres, so the strip glows at dawn.
  for (const side of [-1, 1]) {
    for (let dz = -hl + 10; dz < hl; dz += 40) {
      const p = project(cam, { x: side * (hw - 0.5), y: y + 0.6, z: stripZ + dz });
      if (!p) continue;
      ctx.fillStyle = `rgba(125, 200, 255, ${blink})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1.5, p.scale * 1.1), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Centreline dashes.
  ctx.fillStyle = '#f5e9c8';
  for (let dz = -hl + 30; dz < hl - 10; dz += 44) {
    const a = project(cam, { x: -1.6, y: y + 0.15, z: stripZ + dz });
    const b = project(cam, { x: 1.6, y: y + 0.15, z: stripZ + dz });
    const c = project(cam, { x: 1.6, y: y + 0.15, z: stripZ + dz + 22 });
    const d = project(cam, { x: -1.6, y: y + 0.15, z: stripZ + dz + 22 });
    if (!a || !b || !c || !d) continue;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(d.x, d.y);
    ctx.closePath();
    ctx.fill();
  }
  // Threshold lights: green at the near end, red at the far end.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const lx = side * (hw - 2) + (i - 2) * 0;
      const near = project(cam, { x: lx + (i - 2) * 3.4, y: y + 0.6, z: stripZ - hl + 4 });
      const far = project(cam, { x: lx + (i - 2) * 3.4, y: y + 0.6, z: stripZ + hl - 4 });
      if (near) {
        ctx.fillStyle = `rgba(125, 255, 138, ${blink})`;
        ctx.beginPath();
        ctx.arc(near.x, near.y, Math.max(2, near.scale * 1.4), 0, Math.PI * 2);
        ctx.fill();
      }
      if (far) {
        ctx.fillStyle = `rgba(255, 90, 78, ${blink})`;
        ctx.beginPath();
        ctx.arc(far.x, far.y, Math.max(2, far.scale * 1.4), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  // Strip name painted big on the asphalt, readable on final.
  const label = isFinish ? 'RED ROCK' : 'DAWN FIELD';
  const lp = project(cam, { x: 0, y: y + 0.3, z: stripZ + hl * 0.55 });
  if (lp && lp.d < 700) {
    ctx.save();
    ctx.translate(lp.x, lp.y);
    ctx.fillStyle = 'rgba(245, 233, 200, 0.85)';
    ctx.font = `bold ${Math.max(10, lp.scale * 9)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(label, 0, 0);
    ctx.restore();
  }
}

function drawProps(ctx, cam, stripZ, wind) {
  for (const prop of stripProps(stripZ)) {
    const gy = terrainHeight(prop.x, prop.z);
    if (prop.kind === 'hangar') {
      const a = project(cam, { x: prop.x - 16, y: gy, z: prop.z - 10 });
      const b = project(cam, { x: prop.x + 16, y: gy, z: prop.z - 10 });
      const c = project(cam, { x: prop.x + 16, y: gy + 12, z: prop.z - 10 });
      const d = project(cam, { x: prop.x - 16, y: gy + 12, z: prop.z - 10 });
      if (!a || !b || !c || !d) continue;
      ctx.fillStyle = '#6b4a3a';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.lineTo(d.x, d.y);
      ctx.closePath();
      ctx.fill();
      const roof = project(cam, { x: prop.x, y: gy + 17, z: prop.z - 10 });
      if (roof) {
        ctx.fillStyle = '#8a5a44';
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(c.x, c.y);
        ctx.lineTo(roof.x, roof.y);
        ctx.closePath();
        ctx.fill();
      }
    } else if (prop.kind === 'windsock') {
      const base = project(cam, { x: prop.x, y: gy, z: prop.z });
      const top = project(cam, { x: prop.x, y: gy + 9, z: prop.z });
      if (!base || !top) continue;
      ctx.strokeStyle = '#d8d2c4';
      ctx.lineWidth = Math.max(1, top.scale * 0.8);
      ctx.beginPath();
      ctx.moveTo(base.x, base.y);
      ctx.lineTo(top.x, top.y);
      ctx.stroke();
      // The sock streams downwind: east when the wind is westerly.
      const dir = wind > 0 ? 1 : -1;
      const len = clamp(Math.abs(wind) / 3, 1.5, 6);
      const tip = project(cam, { x: prop.x + dir * len, y: gy + 8.4, z: prop.z });
      if (tip) {
        ctx.strokeStyle = '#ff7a3c';
        ctx.lineWidth = Math.max(2, top.scale * 1.6);
        ctx.beginPath();
        ctx.moveTo(top.x, top.y);
        ctx.lineTo(tip.x, tip.y);
        ctx.stroke();
      }
    } else {
      const p = project(cam, { x: prop.x, y: gy + 1.2, z: prop.z });
      if (!p) continue;
      ctx.fillStyle = '#c23b2e';
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1.5, p.scale * 1.1), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawRing(ctx, cam, ring, isNext, time) {
  if (ring.z < cam.z - 30 || ring.z > cam.z + 1300) return;
  const pts = [];
  for (let i = 0; i <= 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    const p = project(cam, {
      x: ring.x + Math.cos(a) * ring.radius,
      y: ring.y + Math.sin(a) * ring.radius,
      z: ring.z,
    });
    if (p) pts.push(p);
  }
  if (pts.length < 4) return;
  const pulse = isNext ? 0.75 + 0.25 * Math.sin(time * 5) : 1;
  const color = ring.passed
    ? PALETTE.ringDone
    : ring.fuel
      ? PALETTE.ringGold
      : PALETTE.ringCyan;
  ctx.save();
  ctx.globalAlpha = (ring.passed ? 0.55 : 0.95) * pulse;
  ctx.strokeStyle = color;
  ctx.lineWidth = isNext ? 7 : 5;
  ctx.shadowColor = color;
  ctx.shadowBlur = isNext ? 26 : 14;
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.stroke();
  // Number plate above the ring.
  const top = project(cam, { x: ring.x, y: ring.y + ring.radius + 9, z: ring.z });
  if (top) {
    ctx.globalAlpha = 1;
    ctx.fillStyle = color;
    // Cap the label size: a ring 60 m ahead would otherwise paint a
    // house-sized number over the HUD.
    ctx.font = `bold ${Math.min(46, Math.max(13, top.scale * 14))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(ring.fuel ? `⛽ ${ring.index + 1}` : `${ring.index + 1}`, top.x, top.y);
  }
  ctx.restore();
}

function drawClouds(ctx, cam) {
  ctx.save();
  for (const c of CLOUDS) {
    if (c.z < cam.z - 40 || c.z > cam.z + 1400) continue;
    const p = project(cam, { x: c.x, y: c.y, z: c.z });
    if (!p) continue;
    const s = c.s * p.scale * 0.02;
    if (s < 4) continue;
    ctx.fillStyle = 'rgba(255, 214, 180, 0.16)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, s * 2.2, s * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 190, 150, 0.12)';
    ctx.beginPath();
    ctx.ellipse(p.x - s, p.y + s * 0.2, s * 1.4, s * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// The aeroplane, seen from behind in chase view: tail, wings, fin and the
// red/green nav lights. It banks with the roll and bobs with the air.
function drawPlane(ctx, plane, time, crashed) {
  const cx = VIEW.width / 2;
  const cy = VIEW.height * 0.6 + Math.sin(plane.pitch) * 26;
  const bob = Math.sin(time * 2.2) * 2.2 * clamp(plane.speed / 120, 0, 1);
  const scale = 1 + clamp(plane.speed / 400, 0, 0.12);
  ctx.save();
  ctx.translate(cx, cy + bob);
  ctx.rotate(plane.roll * 0.85);
  ctx.scale(scale, scale);
  if (crashed) ctx.rotate(0.35);

  // Wings: long, slightly swept, cream with red tips.
  ctx.fillStyle = '#f2ead8';
  ctx.beginPath();
  ctx.moveTo(-14, -6);
  ctx.lineTo(-172, 26);
  ctx.lineTo(-172, 38);
  ctx.lineTo(-14, 16);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(14, -6);
  ctx.lineTo(172, 26);
  ctx.lineTo(172, 38);
  ctx.lineTo(14, 16);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#c23b2e';
  ctx.fillRect(-172, 26, 22, 12);
  ctx.fillRect(150, 26, 22, 12);

  // Nav lights: red port, green starboard, white strobe blinking.
  const strobe = Math.sin(time * 9) > 0.6;
  ctx.fillStyle = '#ff2e2e';
  ctx.shadowColor = '#ff2e2e';
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.arc(-172, 32, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2eff5e';
  ctx.shadowColor = '#2eff5e';
  ctx.beginPath();
  ctx.arc(172, 32, 5, 0, Math.PI * 2);
  ctx.fill();
  if (strobe) {
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 22;
    ctx.beginPath();
    ctx.arc(0, -34, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;

  // Fuselage, seen from the tail: tapering toward the nose (up-screen).
  ctx.fillStyle = '#f6efdc';
  ctx.beginPath();
  ctx.moveTo(-13, 30);
  ctx.quadraticCurveTo(-20, -10, -11, -50);
  ctx.quadraticCurveTo(0, -58, 11, -50);
  ctx.quadraticCurveTo(20, -10, 13, 30);
  ctx.quadraticCurveTo(0, 38, -13, 30);
  ctx.closePath();
  ctx.fill();
  // Red cheatline and tail cone.
  ctx.fillStyle = '#c23b2e';
  ctx.beginPath();
  ctx.moveTo(-13, 18);
  ctx.lineTo(13, 18);
  ctx.lineTo(11, 30);
  ctx.lineTo(-11, 30);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#8a2a20';
  ctx.beginPath();
  ctx.ellipse(0, 30, 10, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Vertical fin with red tip.
  ctx.fillStyle = '#f2ead8';
  ctx.beginPath();
  ctx.moveTo(-8, -44);
  ctx.lineTo(-4, -78);
  ctx.lineTo(6, -78);
  ctx.lineTo(10, -44);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#c23b2e';
  ctx.fillRect(-4, -78, 10, 12);

  // Horizontal stabiliser.
  ctx.fillStyle = '#e8ddc4';
  ctx.beginPath();
  ctx.moveTo(-10, -34);
  ctx.lineTo(-62, -18);
  ctx.lineTo(-62, -10);
  ctx.lineTo(-10, -24);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(10, -34);
  ctx.lineTo(62, -18);
  ctx.lineTo(62, -10);
  ctx.lineTo(10, -24);
  ctx.closePath();
  ctx.fill();

  // Exhaust glow when the throttle is open.
  if (plane.throttle > 0.15 && !crashed) {
    ctx.fillStyle = `rgba(255, 150, 60, ${0.25 + plane.throttle * 0.5})`;
    ctx.beginPath();
    ctx.ellipse(-6, 33, 4, 3 + plane.throttle * 5, 0, 0, Math.PI * 2);
    ctx.ellipse(6, 33, 4, 3 + plane.throttle * 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// Ground shadow under the plane when low — it sells the height.
function drawPlaneShadow(ctx, cam, plane) {
  if (plane.onGround) return;
  const gy = terrainHeight(plane.x, plane.z);
  const hAbove = plane.y - gy;
  if (hAbove > 160) return;
  const p = project(cam, { x: plane.x, y: gy + 0.5, z: plane.z });
  if (!p) return;
  const a = clamp(0.4 - hAbove / 400, 0.06, 0.4);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = '#1a0f14';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, 26 * p.scale * 0.06 + 8, 7 * p.scale * 0.06 + 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Dust streaks near the ground show the crosswind's direction and strength.
const DUST = (() => {
  const rng = mulberry32(99);
  const out = [];
  for (let i = 0; i < 42; i++) {
    out.push({ dx: (rng() - 0.5) * 500, dy: rng() * 60, dz: rng() * 500, s: 1 + rng() * 2 });
  }
  return out;
})();

function drawWindDust(ctx, cam, plane, wind, time) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 220, 170, 0.35)';
  ctx.lineWidth = 1.4;
  for (const d of DUST) {
    const wx = plane.x + d.dx + wind * ((time * 6 + d.dz) % 60);
    const wy = terrainHeight(wx, plane.z + d.dz) + 3 + d.dy;
    const p = project(cam, { x: wx, y: wy, z: plane.z + d.dz });
    if (!p || p.d > 420) continue;
    const len = clamp(Math.abs(wind) * 0.9, 3, 26);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + (wind > 0 ? len : -len), p.y);
    ctx.stroke();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Main scene entry point.
// ---------------------------------------------------------------------------

export function renderScene(ctx, scene) {
  const { cam, plane, rings, nextRing, time, wind, state, camLift } = scene;
  updateCamera(cam, plane, 1 / 60, camLift || 0);
  drawSky(ctx, cam, plane, time);
  drawClouds(ctx, cam);
  drawTerrain(ctx, cam);
  drawStrip(ctx, cam, WORLD.startStripZ, false, time);
  drawStrip(ctx, cam, WORLD.finishStripZ, true, time);
  drawProps(ctx, cam, WORLD.startStripZ, wind);
  drawProps(ctx, cam, WORLD.finishStripZ, wind);
  for (const ring of rings) drawRing(ctx, cam, ring, ring === nextRing, time);
  drawWindDust(ctx, cam, plane, wind, time);
  drawPlaneShadow(ctx, cam, plane);
  if (state !== 'title') drawPlane(ctx, plane, time, plane.crashed);
  else drawPlane(ctx, plane, time, false);

  // Soft vignette so the panel and HUD sit on the picture.
  const vg = ctx.createRadialGradient(
    VIEW.width / 2,
    VIEW.height / 2,
    VIEW.height * 0.42,
    VIEW.width / 2,
    VIEW.height / 2,
    VIEW.height * 0.95,
  );
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(8, 6, 18, 0.42)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
}
