// Canyon Dawn Run — input.js
// One job: keyboard and mouse, turned into one stick-and-throttle shape.
// Arrows (or WASD pitch/roll) fly the plane, Shift/Ctrl work the throttle,
// the mouse steers like a stick, the wheel works the throttle, and the
// number keys pick a mission on the title screen.

export function makeInput() {
  return {
    keys: new Set(),
    mouseX: 0.5, // 0..1 across the screen
    mouseY: 0.5,
    mouseActive: false,
    wheelDelta: 0,
    pressed: new Set(), // keys pressed since last read (edge-triggered)
  };
}

export function attachInput(input, canvas) {
  window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
      e.preventDefault();
    }
    if (!e.repeat) input.pressed.add(e.key.length === 1 ? e.key.toLowerCase() : e.key);
    input.keys.add(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  });
  window.addEventListener('keyup', (e) => {
    input.keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  });
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    input.mouseX = (e.clientX - rect.left) / rect.width;
    input.mouseY = (e.clientY - rect.top) / rect.height;
    input.mouseActive = true;
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    input.wheelDelta += e.deltaY;
  }, { passive: false });
  canvas.addEventListener('mousedown', () => {
    input.mouseActive = true;
  });
  // Losing the window must not leave a key stuck down.
  window.addEventListener('blur', () => input.keys.clear());
}

export function wasPressed(input, key) {
  if (input.pressed.has(key)) {
    input.pressed.delete(key);
    return true;
  }
  return false;
}

export function endFrameInput(input) {
  input.pressed.clear();
  input.wheelDelta = 0;
}

// Read the current stick position: -1..1 pitch (up positive) and roll.
export function readStick(input) {
  let pitch = 0;
  let roll = 0;
  if (input.keys.has('ArrowUp') || input.keys.has('w')) pitch += 1;
  if (input.keys.has('ArrowDown') || input.keys.has('s')) pitch -= 1;
  if (input.keys.has('ArrowLeft') || input.keys.has('a')) roll -= 1;
  if (input.keys.has('ArrowRight') || input.keys.has('d')) roll += 1;
  // The mouse is a stick too: push it where you want the nose to go.
  // It only takes over when the keys are quiet, so the two never fight.
  if (pitch === 0 && roll === 0 && input.mouseActive) {
    roll = (input.mouseX - 0.5) * 2 * 0.9;
    pitch = -(input.mouseY - 0.5) * 2 * 0.9;
    // Dead zone in the middle so a resting hand flies straight.
    if (Math.abs(roll) < 0.08) roll = 0;
    if (Math.abs(pitch) < 0.08) pitch = 0;
  }
  return { pitch, roll };
}

export function readThrottleDelta(input, dt) {
  let d = 0;
  if (input.keys.has('Shift')) d += 1;
  if (input.keys.has('Control')) d -= 1;
  // Mouse wheel: up for more power, down for less.
  if (input.wheelDelta !== 0) d += -Math.sign(input.wheelDelta) * 2.2;
  return d;
}
