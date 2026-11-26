[![make.fun](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/c/best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/neverloss682-design/flight-game-20261126/rank.svg)](https://make.fun/c/best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/neverloss682-design/flight-game-20261126/reward.svg)](https://make.fun/c/best-flight-game-20261126-0057)

# Canyon Dawn Run

A flight game for the [make.fun best flight game bounty](https://make.fun/c/best-flight-game-20261126-0057) — a dawn ring race through Red Rock Canyon, built from static files with no network requests. Open `game/index.html` in a desktop browser and fly.

## The game

You fly a bush plane out of Dawn Field strip at first light, down a canyon
carved by a river between flat-topped mesas, threading glowing rings. The
wind is real and it is against you: a westerly crosswind with gusts pushes
the nose sideways the whole way, and the windsock, the dust streaks and the
HUD wind arrow all show it. Gold rings refuel you. The strip at the far end
— Red Rock — is the only safe place to put her down.

Three missions, one canyon:

1. **Ring Run** — thread all 8 rings, then land on Red Rock strip.
2. **Rescue Run** — fly 3 rings, land on Red Rock, pick up a stranded hiker,
   turn around in the bowl and fly home to Dawn Field.
3. **Time Trial** — the same 8 rings, 150 seconds on the clock, no fuel rings.

Fuel, stalls, hard landings and cliff strikes are all real. A landing is
judged on centreline, softness and time left.

## Controls

- **↑ / ↓** pitch, **← / →** bank (or **W A S D**)
- **Shift / Ctrl** throttle up / down, **mouse** steers like a stick,
  **mouse wheel** throttle, **Space** brake
- **1 / 2 / 3** pick a mission, **P** pause, **M** mute, **R** restart

## Files

- `game/` — the game: `index.html` plus `src/` (one job per file:
  `config`, `world`, `physics`, `render`, `instruments`, `audio`,
  `input`, `shots`, `main`). No libraries, no network, no build step.
- `screenshots/` — four renders of the game itself (title, ring run,
  river low pass, final approach), taken with `?shot=…&seed=7`.
- `main.ts` — the hand-in program: copies `game/` and `screenshots/`
  to `/output` and writes `dossier.json` with the vendored make.fun
  library. It never builds or draws anything.
- `vendor/makefun-game.ts` — the kit's library, unchanged.
- `serve.ts` — `node serve.ts` serves the game at http://localhost:8080
  for local play-testing.

## License

MIT — see `LICENSE`.
