// Canyon Dawn Run — main.js
// One job: the game itself. States (title, flying, over), the three missions,
// the score, and the loop that ties physics, rendering, instruments, sound
// and input together. Everything else is a module this file conducts.

import { VIEW, PALETTE, MISSIONS, RING_POINTS, RING_TIME_BONUS, LANDING_CENTER_BONUS, LANDING_SOFT_BONUS, WORLD } from './config.js';
import { clamp, formatTime } from './random.js';
import { buildRings, missionById } from './world.js';
import { makePlaneState, stepFlight, ringCrossed, crosswindAt, distanceToRing } from './physics.js';
import { makeCamera, renderScene } from './render.js';
import { drawInstruments } from './instruments.js';
import { makeAudio, startAudio, updateAudio, playRingChime, playThud, playCrash, playClick } from './audio.js';
import { makeInput, attachInput, wasPressed, readStick, readThrottleDelta, endFrameInput } from './input.js';
import { applyShot, SHOT_NAMES } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = VIEW.width;
canvas.height = VIEW.height;

const params = new URLSearchParams(window.location.search);
const seedParam = parseInt(params.get('seed') || '7', 10);
const shotParam = params.get('shot');

const game = {
  mission: MISSIONS.ringrun,
  plane: null,
  rings: [],
  cam: makeCamera(),
  audio: makeAudio(),
  input: makeInput(),
  state: 'title', // title | fly | over
  overKind: '', // landed | crashed | timeout
  overReason: '',
  score: 0,
  scoreLines: [],
  timeLeft: 0,
  elapsed: 0,
  wind: 9,
  rescuePhase: 'outbound', // outbound | pickup | home (rescue mission only)
  pickupTimer: 0,
  rescueDone: false,
  landingHandled: false,
  paused: false,
  shotMode: false,
  showHelpUntil: 0,
  shake: 0,
};

function startMission(missionId) {
  game.mission = missionById(missionId);
  game.plane = makePlaneState(game.mission);
  game.rings = buildRings(game.mission);
  game.state = 'fly';
  game.overKind = '';
  game.overReason = '';
  game.score = 0;
  game.scoreLines = [];
  game.timeLeft = game.mission.timeLimit;
  game.elapsed = 0;
  game.rescuePhase = 'outbound';
  game.pickupTimer = 0;
  game.rescueDone = false;
  game.landingHandled = false;
  game.paused = false;
  game.showHelpUntil = 12;
  game.shake = 0;
  startAudio(game.audio);
  playClick(game.audio);
}

function nextRing() {
  return game.rings.find((r) => !r.passed) || null;
}

function endSortie(kind, reason) {
  if (game.state !== 'fly') return;
  game.state = 'over';
  game.overKind = kind;
  game.overReason = reason;
  if (kind === 'crashed') {
    playCrash(game.audio);
    game.shake = 14;
  } else if (kind === 'landed') {
    playThud(game.audio);
  }
}

// Landing quality: centreline and softness decide the bonus.
function scoreLanding() {
  const p = game.plane;
  const centre = 1 - clamp(Math.abs(p.x) / (WORLD.stripWidth / 2), 0, 1);
  const soft = clamp(1 - Math.abs(p.verticalSpeed) / 7.5, 0, 1);
  const centreBonus = Math.round(LANDING_CENTER_BONUS * centre);
  const softBonus = Math.round(LANDING_SOFT_BONUS * soft);
  const timeBonus = Math.round(game.timeLeft * 2);
  game.score += centreBonus + softBonus + timeBonus;
  game.scoreLines.push(`Centreline landing  +${centreBonus}`);
  game.scoreLines.push(`Soft touchdown  +${softBonus}`);
  game.scoreLines.push(`Time remaining  +${timeBonus}`);
}

function update(dt) {
  const p = game.plane;
  if (!p) return;
  game.wind = crosswindAt(p.time, p.z);

  // On the title screen the dawn still breathes, even though nobody flies.
  if (game.state === 'title') {
    p.time += dt;
    return;
  }

  if (game.state === 'fly' && !game.paused) {
    game.elapsed += dt;
    game.timeLeft -= dt;
    if (game.timeLeft <= 0) {
      game.timeLeft = 0;
      endSortie('timeout', 'Out of time — the dawn patrol flew on without you.');
      return;
    }

    const stick = readStick(game.input);
    const prevZ = p.z;
    stepFlight(
      p,
      {
        pitch: stick.pitch,
        roll: stick.roll,
        throttleDelta: readThrottleDelta(game.input, dt),
        brake: game.input.keys.has(' ') || game.input.keys.has('b'),
      },
      dt,
    );

    // Ring crossings: only count them while flying the outbound leg.
    const rescueOutbound = game.mission.rescue && game.rescuePhase === 'outbound';
    const normalRun = !game.mission.rescue;
    if ((normalRun || rescueOutbound) && !p.onGround) {
      for (const ring of game.rings) {
        if (ringCrossed(p, prevZ, ring)) {
          ring.passed = true;
          const speedBonus = Math.round(clamp((p.speed - 90) / 90, 0, 1) * 50);
          const gained = RING_POINTS + speedBonus;
          game.score += gained;
          game.scoreLines.push(`Ring ${ring.index + 1}  +${gained}`);
          if (ring.fuel) {
            p.fuel = clamp(p.fuel + 26, 0, 100);
            game.scoreLines.push(`Fuel ring  +26 fuel`);
          }
          if (game.mission.id === 'timetrial') {
            game.timeLeft += RING_TIME_BONUS;
            game.scoreLines.push(`Time trial  +${RING_TIME_BONUS}s`);
          }
          playRingChime(game.audio, ring.fuel);
        }
      }
    }

    // Crash / landing outcomes from the physics step.
    if (p.crashed) {
      endSortie('crashed', p.crashReason);
      return;
    }

    // Touchdown handling: what the landing MEANS depends on the mission.
    // everAirborne plus a latch (cleared on every take-off) so a plane that
    // rolls to a stop on a strip is judged once, however long it sits there.
    if (!p.onGround) game.landingHandled = false;
    if (p.onGround && p.everAirborne && p.speed < 30 && !game.landingHandled) {
      const onFinish = Math.abs(p.z - WORLD.finishStripZ) < WORLD.stripLength / 2;
      const onStart = Math.abs(p.z - WORLD.startStripZ) < WORLD.stripLength / 2;
      if (game.mission.rescue && game.rescuePhase === 'outbound' && onFinish) {
        game.rescuePhase = 'pickup';
        game.pickupTimer = 3;
        game.landingHandled = true;
        playThud(game.audio);
      } else if (game.mission.rescue && game.rescuePhase === 'home' && onStart) {
        game.rescueDone = true;
        game.landingHandled = true;
        scoreLanding();
        endSortie('landed', 'Hiker home safe. The canyon keeps its secret, you keep the story.');
      } else if (!game.mission.rescue && onFinish && nextRing() === null) {
        game.landingHandled = true;
        scoreLanding();
        endSortie('landed', 'Down on Red Rock strip. Every ring flown, every litre counted.');
      } else if (!game.mission.rescue && onFinish) {
        game.landingHandled = true;
        // Landed early on the finish strip with rings left: a field decision.
        endSortie('landed', 'Down early on Red Rock strip — the rings you skipped keep flying without you.');
        game.score = Math.round(game.score * 0.5);
      } else if (onStart) {
        // Back on the home strip mid-sortie: just parked, take off again.
        p.throttle = 0;
      }
    }

    // Rescue pickup: three seconds on the strip, then the hiker is aboard.
    if (game.rescuePhase === 'pickup') {
      game.pickupTimer -= dt;
      if (game.pickupTimer <= 0) {
        game.rescuePhase = 'home';
        game.score += 200;
        game.scoreLines.push('Hiker aboard  +200');
        playRingChime(game.audio, false);
      }
    }

    // Home leg: the objective is the start strip, 5.6 km south.
    if (game.mission.rescue && game.rescuePhase === 'home') {
      // Nothing to do here — the compass and the strip do the talking.
    }
  }

  updateAudio(game.audio, p);
  if (game.shake > 0) game.shake = Math.max(0, game.shake - dt * 30);
}

// --- Title screen -------------------------------------------------------------

const MISSION_CARDS = [
  { id: 'ringrun', x: 140, w: 320 },
  { id: 'rescue', x: 480, w: 320 },
  { id: 'timetrial', x: 820, w: 320 },
];

function drawTitle() {
  ctx.fillStyle = 'rgba(8, 8, 20, 0.45)';
  ctx.fillRect(0, 0, VIEW.width, 330);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff3c4';
  ctx.font = 'bold 64px system-ui, sans-serif';
  ctx.fillText('CANYON DAWN RUN', VIEW.width / 2, 92);
  ctx.fillStyle = '#ffb454';
  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.fillText('A RING RACE THROUGH RED ROCK CANYON — AT FIRST LIGHT', VIEW.width / 2, 128);
  ctx.fillStyle = '#e8e2d2';
  ctx.font = '17px system-ui, sans-serif';
  ctx.fillText(
    'Thread the glowing rings. Mind the crosswind. Mind the fuel. Put her down on the strip.',
    VIEW.width / 2,
    160,
  );

  // Mission cards.
  for (const card of MISSION_CARDS) {
    const m = MISSIONS[card.id];
    const y = 190;
    const h = 118;
    const hover =
      game.input.mouseX * VIEW.width > card.x &&
      game.input.mouseX * VIEW.width < card.x + card.w &&
      game.input.mouseY * VIEW.height > y &&
      game.input.mouseY * VIEW.height < y + h;
    ctx.fillStyle = hover ? 'rgba(255, 180, 84, 0.22)' : 'rgba(10, 12, 24, 0.78)';
    ctx.fillRect(card.x, y, card.w, h);
    ctx.strokeStyle = hover ? PALETTE.hudAmber : '#3a4668';
    ctx.lineWidth = 2;
    ctx.strokeRect(card.x, y, card.w, h);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillText(`${m.key} — ${m.name}`, card.x + card.w / 2, y + 34);
    ctx.fillStyle = '#c9d2e8';
    ctx.font = '15px system-ui, sans-serif';
    wrapText(m.tagline, card.x + card.w / 2, y + 62, card.w - 28, 20);
    ctx.fillStyle = '#9aa5c4';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillText(
      `${m.rings} RINGS · ${formatTime(m.timeLimit)} ON THE CLOCK`,
      card.x + card.w / 2,
      y + h - 12,
    );
  }

  // Controls, on a dark pill so they read over bright dawn terrain.
  ctx.fillStyle = 'rgba(10, 12, 24, 0.72)';
  ctx.fillRect(VIEW.width / 2 - 430, 322, 860, 52);
  ctx.strokeStyle = PALETTE.panelEdge;
  ctx.strokeRect(VIEW.width / 2 - 430, 322, 860, 52);
  ctx.fillStyle = '#e8e2d2';
  ctx.font = '15px system-ui, sans-serif';
  ctx.fillText(
    'FLY:  ↑ ↓ pitch · ← → bank · SHIFT / CTRL throttle · mouse steers · wheel throttle · SPACE brake',
    VIEW.width / 2,
    342,
  );
  ctx.fillStyle = '#9aa5c4';
  ctx.fillText('P pause · M mute · R restart · click a mission or press 1 / 2 / 3', VIEW.width / 2, 364);
}

function wrapText(text, cx, y, maxW, lineH) {
  const words = text.split(' ');
  let line = '';
  let yy = y;
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, cx, yy);
      line = w;
      yy += lineH;
    } else {
      line = test;
    }
  }
  ctx.fillText(line, cx, yy);
}

// --- End screen -----------------------------------------------------------------

function drawOver() {
  ctx.fillStyle = 'rgba(8, 8, 20, 0.62)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  const title =
    game.overKind === 'landed'
      ? 'SORTIE COMPLETE'
      : game.overKind === 'timeout'
        ? 'OUT OF TIME'
        : 'AIRCRAFT DOWN';
  ctx.textAlign = 'center';
  ctx.fillStyle = game.overKind === 'landed' ? '#7dff8a' : '#ff5a4e';
  ctx.font = 'bold 52px system-ui, sans-serif';
  ctx.fillText(title, VIEW.width / 2, 150);
  ctx.fillStyle = '#e8e2d2';
  ctx.font = '20px system-ui, sans-serif';
  ctx.fillText(game.overReason, VIEW.width / 2, 192);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 44px "SF Mono", Consolas, monospace';
  ctx.fillText(`SCORE  ${game.score}`, VIEW.width / 2, 262);
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillStyle = '#c9d2e8';
  const ringsDone = game.rings.filter((r) => r.passed).length;
  ctx.fillText(
    `Rings ${ringsDone}/${game.rings.length}  ·  Time ${formatTime(game.elapsed)}  ·  Fuel ${Math.round(
      game.plane.fuel,
    )}% left  ·  ${game.mission.name}`,
    VIEW.width / 2,
    300,
  );
  let yy = 344;
  ctx.font = '15px system-ui, sans-serif';
  for (const line of game.scoreLines.slice(-8)) {
    ctx.fillStyle = '#9aa5c4';
    ctx.fillText(line, VIEW.width / 2, yy);
    yy += 24;
  }
  ctx.fillStyle = '#ffb454';
  ctx.font = 'bold 18px system-ui, sans-serif';
  ctx.fillText('R — fly again      T — choose another mission', VIEW.width / 2, 580);
}

// --- Help strip during the first seconds of flight --------------------------------

function drawHelp() {
  if (game.elapsed > game.showHelpUntil || game.state !== 'fly') return;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(10, 12, 24, 0.72)';
  const msg =
    game.plane.onGround && game.plane.speed < 60
      ? 'HOLD SHIFT — build speed, ease the nose up at 65 kt'
      : '↑ ↓ pitch · ← → bank · SHIFT throttle · gold rings refuel · watch the crosswind arrow';
  ctx.font = '15px system-ui, sans-serif';
  const w2 = ctx.measureText(msg).width;
  ctx.fillRect(VIEW.width / 2 - w2 / 2 - 14, 108, w2 + 28, 28);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(msg, VIEW.width / 2, 127);
}

// --- Input edges ---------------------------------------------------------------------

function handleKeys() {
  const inp = game.input;
  if (wasPressed(inp, 'm') || wasPressed(inp, 'M')) {
    game.audio.muted = !game.audio.muted;
  }
  if (game.state === 'title') {
    if (wasPressed(inp, '1')) startMission('ringrun');
    if (wasPressed(inp, '2')) startMission('rescue');
    if (wasPressed(inp, '3')) startMission('timetrial');
  } else if (game.state === 'fly') {
    if (wasPressed(inp, 'p') || wasPressed(inp, 'P') || wasPressed(inp, 'Escape')) {
      game.paused = !game.paused;
    }
    if (wasPressed(inp, 'r') || wasPressed(inp, 'R')) startMission(game.mission.id);
    if (wasPressed(inp, 't') || wasPressed(inp, 'T')) game.state = 'title';
  } else if (game.state === 'over') {
    if (wasPressed(inp, 'r') || wasPressed(inp, 'R')) startMission(game.mission.id);
    if (wasPressed(inp, 't') || wasPressed(inp, 'T')) {
      game.state = 'title';
      game.plane = makePlaneState(game.mission);
      game.rings = buildRings(game.mission);
    }
  }
}

canvas.addEventListener('click', (e) => {
  if (game.state !== 'title') return;
  const rect = canvas.getBoundingClientRect();
  const mx = ((e.clientX - rect.left) / rect.width) * VIEW.width;
  const my = ((e.clientY - rect.top) / rect.height) * VIEW.height;
  for (const card of MISSION_CARDS) {
    if (mx > card.x && mx < card.x + card.w && my > 190 && my < 308) {
      startMission(card.id);
      return;
    }
  }
  startAudio(game.audio);
});

// --- Main loop -------------------------------------------------------------------------

attachInput(game.input, canvas);

function boot() {
  game.plane = makePlaneState(game.mission);
  game.rings = buildRings(game.mission);
  game.timeLeft = game.mission.timeLimit;
  if (shotParam && SHOT_NAMES.includes(shotParam)) {
    applyShot(game, shotParam);
    // Settle the chase camera before the first frame is ever shown.
    for (let i = 0; i < 90; i++) {
      renderScene(ctx, {
        cam: game.cam,
        plane: game.plane,
        rings: game.rings,
        nextRing: nextRing(),
        time: game.plane.time,
        wind: game.wind,
        state: game.state,
        camLift: game.camLift || 0,
      });
    }
  }
}

let last = performance.now();
let acc = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  handleKeys();
  if (!game.shotMode) {
    acc += dt;
    while (acc >= 1 / 60) {
      update(1 / 60);
      acc -= 1 / 60;
    }
  } else {
    // Frozen scene for screenshots: the wind still breathes, nothing flies.
    game.plane.time += dt;
    game.wind = crosswindAt(game.plane.time, game.plane.z);
  }
  ctx.save();
  if (game.shake > 0) {
    ctx.translate((Math.random() - 0.5) * game.shake, (Math.random() - 0.5) * game.shake);
  }
  renderScene(ctx, {
    cam: game.cam,
    plane: game.plane,
    rings: game.rings,
    nextRing: nextRing(),
    time: game.plane.time,
    wind: game.wind,
    state: game.state,
    camLift: game.camLift || 0,
  });
  if (game.state === 'title') {
    drawInstruments(ctx, game);
    drawTitle();
  } else if (game.state === 'fly') {
    drawInstruments(ctx, game);
    drawHelp();
    if (game.paused) {
      ctx.fillStyle = 'rgba(8, 8, 20, 0.55)';
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 44px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('PAUSED', VIEW.width / 2, VIEW.height / 2);
      ctx.font = '18px system-ui, sans-serif';
      ctx.fillText('P — resume · R — restart', VIEW.width / 2, VIEW.height / 2 + 36);
    }
  } else if (game.state === 'over') {
    drawInstruments(ctx, game);
    drawOver();
  }
  ctx.restore();
  endFrameInput(game.input);
  requestAnimationFrame(frame);
}

boot();
requestAnimationFrame(frame);
