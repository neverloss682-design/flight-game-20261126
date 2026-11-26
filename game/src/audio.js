// Canyon Dawn Run — audio.js
// One job: every sound, synthesised live with WebAudio. No audio files,
// no network, nothing to load — the engine hum, the wind, the ring chime
// and the crash are all oscillators and filtered noise.

export function makeAudio() {
  return {
    ctx: null,
    engine: null,
    engineGain: null,
    windGain: null,
    windFilter: null,
    muted: false,
    started: false,
  };
}

// Browsers only let audio start after a gesture; call this from one.
export function startAudio(audio) {
  if (audio.started) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    audio.ctx = ctx;

    // Engine: two detuned sawtooths through a low-pass, pitch follows throttle.
    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.value = 52;
    const osc2 = ctx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.value = 78;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    const gain = ctx.createGain();
    gain.gain.value = 0.0;
    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc1.start();
    osc2.start();
    audio.engine = [osc1, osc2];
    audio.engineGain = gain;
    audio.engineFilter = filter;

    // Wind: looped noise through a band-pass, louder with speed.
    const len = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 700;
    bp.Q.value = 0.6;
    const wgain = ctx.createGain();
    wgain.gain.value = 0.0;
    noise.connect(bp);
    bp.connect(wgain);
    wgain.connect(ctx.destination);
    noise.start();
    audio.windGain = wgain;

    audio.started = true;
  } catch (e) {
    // Audio is garnish: a game that cannot make sound still flies.
    audio.started = false;
  }
}

export function updateAudio(audio, plane) {
  if (!audio.started || audio.muted) return;
  const t = audio.ctx.currentTime;
  const thr = plane.throttle;
  audio.engineGain.gain.setTargetAtTime(
    plane.onGround ? 0.02 + thr * 0.05 : 0.03 + thr * 0.09,
    t,
    0.1,
  );
  audio.engine[0].frequency.setTargetAtTime(48 + thr * 90 + plane.speed * 0.12, t, 0.1);
  audio.engine[1].frequency.setTargetAtTime(72 + thr * 135 + plane.speed * 0.18, t, 0.1);
  audio.engineFilter.frequency.setTargetAtTime(320 + thr * 900, t, 0.1);
  const windLevel = plane.onGround ? 0 : Math.min(0.14, plane.speed * 0.0006);
  audio.windGain.gain.setTargetAtTime(windLevel, t, 0.15);
}

function blip(audio, freq, dur, type, vol, when = 0) {
  if (!audio.started || audio.muted) return;
  const ctx = audio.ctx;
  const t = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(vol, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

// The ring chime: three rising notes, the sound of a gate well flown.
export function playRingChime(audio, fuel) {
  blip(audio, 660, 0.16, 'sine', 0.22);
  blip(audio, 880, 0.16, 'sine', 0.22, 0.09);
  blip(audio, fuel ? 990 : 1320, 0.3, 'sine', 0.24, 0.18);
}

export function playThud(audio) {
  if (!audio.started || audio.muted) return;
  const ctx = audio.ctx;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(120, t);
  osc.frequency.exponentialRampToValueAtTime(38, t + 0.25);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.5, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.45);
}

export function playCrash(audio) {
  if (!audio.started || audio.muted) return;
  const ctx = audio.ctx;
  const t = ctx.currentTime;
  const len = ctx.sampleRate * 0.7;
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.value = 0.5;
  src.connect(gain);
  gain.connect(ctx.destination);
  src.start(t);
  playThud(audio);
}

export function playClick(audio) {
  blip(audio, 520, 0.07, 'square', 0.08);
}
