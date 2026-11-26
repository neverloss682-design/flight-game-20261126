// Canyon Dawn Run — main.ts
// The entrypoint: a copy-only hand-in program for the make.fun
// best-flight-game-20261126-0057 bounty (Node 22, standard library only).
//
// What it does, and nothing else:
//   1. copies game/ (the playable game, static files) beside this file
//      into the output directory,
//   2. copies screenshots/ (the four renders of the game itself),
//   3. writes /output/dossier.json with buildDossier from the vendored
//      make.fun library, so the dossier is byte for byte the one the
//      scorer rebuilds.
//
// What it never does: it never runs, builds or draws the game. The game
// is built by the author before the commit; the screenshots are renders
// taken then. The grader runs this program in a container where the
// repository is read-only, so any write beside the program would fail —
// everything it writes goes under the output directory, and only there.
//
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const gameDir = join(repoRoot, 'game');
const shotsDir = join(repoRoot, 'screenshots');

// Guard: the hand-in is meaningless without the game itself. Fail loudly
// here, in the open, instead of handing in an empty directory.
if (!existsSync(join(gameDir, 'index.html')) || !statSync(join(gameDir, 'index.html')).isFile()) {
  throw new Error('game/index.html is missing: this program only copies the game, it never builds it.');
}

mkdirSync(outDir, { recursive: true });
cpSync(gameDir, join(outDir, 'game'), { recursive: true });
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
if (existsSync(shotsDir)) {
  cpSync(shotsDir, join(outDir, 'screenshots'), { recursive: true });
}

// The scorer's own caps (from this competition's gate): only text_max_bytes
// shapes the dossier's bytes; the others refuse an entry the scorer would
// refuse — more than 4 screenshots or one over 256 KiB, more than 993 files
// in game/ or 48 MiB of game files in all, or a path under game/ over
// 1000 bytes. game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json.
writeFileSync(
  join(outDir, 'dossier.json'),
  buildDossier(outDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
