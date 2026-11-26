// Canyon Dawn Run — physics.js
// One job: how the aeroplane flies. Throttle, lift, banked turns, stalls,
// crosswind gusts, fuel burn and the difference between a landing and a crash.
// Pure step function: state in, state out, no drawing, no DOM.

import { PLANE, WIND, WORLD } from './config.js';
import { clamp, wrapAngle } from './random.js';
import { terrainHeight, onAnyStrip } from './world.js';

export function makePlaneState(mission) {
  return {
    // Position in metres: x east, y up, z north along the course.
    x: 0,
    y: terrainHeight(0, 0) + WORLD.groundClearance,
    z: -60,
    heading: 0, // radians, 0 = due north (+z)
    pitch: 0, // radians, positive = nose up
    roll: 0, // radians, positive = right wing down
    speed: 0, // knots
    throttle: 0, // 0..1
    fuel: mission.startFuel,
    verticalSpeed: 0, // m/s, for the landing judgement
    onGround: true,
    crashed: false,
    crashReason: '',
    landed: false,
    airborne: false,
    everAirborne: false, // true once the plane has really flown, not just rolled
    time: 0,
  };
}

// Crosswind at this moment and place: a steady westerly plus breathing gusts.
export function crosswindAt(time, z) {
  const gust =
    WIND.gustAmp *
    Math.sin(time * WIND.gustSpeed + z * 0.002) *
    Math.sin(time * 0.23 + 1.3);
  return WIND.base + gust;
}

// One simulation step. input: { pitch, roll, throttleDelta, brake } in -1..1.
// Returns nothing; mutates the plane state in place.
export function stepFlight(p, input, dt) {
  if (p.crashed || p.landed) return;
  p.time += dt;

  // --- Throttle -----------------------------------------------------------
  p.throttle = clamp(p.throttle + input.throttleDelta * dt * 0.8, 0, 1);
  if (input.brake) p.throttle = Math.max(0, p.throttle - dt * 1.4);

  // --- Speed ---------------------------------------------------------------
  const targetSpeed = 28 + p.throttle * (PLANE.maxSpeed - 28);
  const accel = p.onGround
    ? PLANE.accel * 1.35 // wheels roll freely on the strip
    : PLANE.accel * (p.pitch > 0 ? 0.55 : 1); // climbing costs speed
  p.speed += clamp(targetSpeed - p.speed, -accel * dt, accel * dt);
  if (p.onGround && input.brake) p.speed = Math.max(0, p.speed - 60 * dt);

  // --- Attitude ------------------------------------------------------------
  const authority = clamp(p.speed / 90, 0.12, 1); // controls wake up with speed
  p.roll = clamp(
    p.roll + input.roll * PLANE.rollRate * authority * dt,
    -1.15,
    1.15,
  );
  // Roll damps back toward level when the stick is centred.
  if (Math.abs(input.roll) < 0.05) p.roll *= Math.max(0, 1 - 1.6 * dt);
  p.pitch = clamp(
    p.pitch + input.pitch * PLANE.pitchRate * authority * dt,
    -0.42,
    0.5,
  );
  if (Math.abs(input.pitch) < 0.05) p.pitch *= Math.max(0, 1 - 1.1 * dt);

  // Gusts nudge the wings — the crosswind is something you fly, not a number.
  const wind = crosswindAt(p.time, p.z);
  p.roll +=
    Math.sin(p.time * 1.9 + p.z * 0.01) * WIND.turbulence * authority * dt * 8;

  // A banked turn changes heading: right wing down (positive roll) turns
  // the nose right, and the turn tightens with speed.
  p.heading = wrapAngle(
    p.heading + Math.sin(p.roll) * PLANE.turnFactor * (p.speed / 100) * dt,
  );
  // On the ground the ailerons steer the nose wheel: the plane answers
  // the stick while it is still rolling, so a crosswind cannot push it
  // off the strip before the wing takes over.
  if (p.onGround) {
    p.heading = wrapAngle(
      p.heading + input.roll * 0.55 * clamp(p.speed / 60, 0, 1) * dt,
    );
  }

  // --- Motion --------------------------------------------------------------
  const flying = p.speed > PLANE.stallSpeed;
  const climb =
    flying && !p.onGround
      ? Math.sin(p.pitch) * (p.speed / 100) * PLANE.climbRate * 2.2
      : 0;
  const stallSink = !flying && !p.onGround ? PLANE.sinkAtStall : 0;
  p.verticalSpeed = climb - stallSink;
  const forward = p.speed * 0.514444; // knots -> m/s
  const fwdX = Math.sin(p.heading);
  const fwdZ = Math.cos(p.heading);

  // The crosswind shoves the plane sideways in the air; on the ground the
  // wheels grip the strip and it barely moves.
  const windGrip = p.onGround ? 0.15 : 1;
  p.x += fwdX * forward * dt + wind * WIND.push * dt * 10 * windGrip;
  p.z += fwdZ * forward * dt;
  p.y += p.verticalSpeed * dt;

  // Soft ceiling: the air thins and the nose drops.
  if (p.y > WORLD.ceiling) {
    p.y = WORLD.ceiling;
    p.pitch = Math.min(p.pitch, 0);
  }

  // --- Fuel ------------------------------------------------------------------
  const burn =
    (PLANE.fuelBurnIdle +
      (PLANE.fuelBurn - PLANE.fuelBurnIdle) * p.throttle) *
    dt;
  p.fuel = Math.max(0, p.fuel - burn);
  if (p.fuel <= 0 && p.throttle > 0) p.throttle = 0; // flame-out: glide home

  // --- Ground ----------------------------------------------------------------
  const ground = terrainHeight(p.x, p.z) + WORLD.groundClearance;
  const strip = onAnyStrip(p.x, p.z);
  if (p.onGround) {
    // Wheels on the ground: the plane follows the strip, even where the
    // flattening fades at the strip's edge. Without this the ground drops
    // away under the wheels and the plane "falls" a metre and crashes.
    p.y = ground;
    p.verticalSpeed = 0;
  } else if (p.y <= ground) {
    p.y = ground;
    if (!p.onGround) {
      // Touchdown: judge it like a landing, not a collision. A strip is
      // bidirectional — lined up means heading north OR south along it.
      const aligned =
        Math.abs(wrapAngle(p.heading)) < 0.35 ||
        Math.abs(wrapAngle(p.heading - Math.PI)) < 0.35;
      const gentle = p.verticalSpeed > PLANE.hardLandingVs;
      const slowEnough = p.speed < 95;
      if (strip && aligned && gentle && slowEnough) {
        p.onGround = true;
        p.verticalSpeed = 0;
        p.airborne = true; // has flown at least once
      } else {
        p.crashed = true;
        p.crashReason = strip
          ? 'Hard landing — the gear folded on touchdown.'
          : 'Terrain strike — the canyon floor is not a runway.';
      }
    } else {
      p.onGround = true;
    }
  } else if (p.y > ground + 0.5) {
    p.onGround = false;
  }

  // Take-off: enough speed and a little back pressure lifts her off.
  if (p.onGround && p.speed > 62 && p.pitch > 0.06) {
    p.onGround = false;
    p.y += 0.4;
  }

  // Remember that this sortie really flew: a landing only counts after that.
  if (!p.onGround && p.y > terrainHeight(p.x, p.z) + 10) {
    p.everAirborne = true;
  }

  // Canyon walls are solid: flying into one is a crash, not a bounce.
  if (!p.onGround) {
    const wallH = terrainHeight(p.x, p.z);
    if (p.y < wallH - 2 && Math.abs(p.x) > 200) {
      p.crashed = true;
      p.crashReason = 'Cliff strike — the canyon wall wins every argument.';
    }
  }

  // Flying past the finish strip with no course left ends the sortie.
  if (p.z > WORLD.finishStripZ + 500) {
    p.crashed = true;
    p.crashReason = 'Flew off the map — the canyon ends, the desert does not.';
  }
}

// Did the plane just cross this ring's plane, and inside its circle?
export function ringCrossed(p, prevZ, ring) {
  if (ring.passed) return false;
  if (prevZ < ring.z && p.z >= ring.z) {
    const dx = p.x - ring.x;
    const dy = p.y - ring.y;
    return Math.sqrt(dx * dx + dy * dy) <= ring.radius;
  }
  return false;
}

export function distanceToRing(p, ring) {
  const dx = p.x - ring.x;
  const dy = p.y - ring.y;
  const dz = p.z - ring.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
