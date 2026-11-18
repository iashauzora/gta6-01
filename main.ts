// Coral Bay — Dario's Run (gta6-01 entry, Node 22, standard library only): the game is this
// directory's game/ folder, plain static files a desktop browser loads offline (game/index.html
// and its ES modules, three.js vendored under game/vendor/, no network request), and this
// program hands it in. It copies game/ and screenshots/ from beside this file to /output and
// writes /output/dossier.json, the summary the judge reads, with the vendored make.fun library.
// Then it verifies its own hand-in: the screenshots exist and are inside the caps, the dossier
// was written, and the file totals are what the log says they are.
//
// The game: a 3D open-world crime story in the coastal city of Coral Bay — steal cars, outrun
// a 5-star wanted system, work five story missions for fixer Sal Marchetti, run taxi fares.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};
writeFileSync(join(out, 'dossier.json'), buildDossier(out, DOSSIER_CAPS));

/** Every file under a directory, as paths relative to it. */
function walk(dir, prefix = '') {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) files.push(...walk(join(dir, entry.name), rel));
    else files.push(rel);
  }
  return files;
}

/**
 * Verify the hand-in before reporting success: 3 or 4 screenshots, each a JPEG or PNG inside
 * the byte cap; a dossier.json that exists; and game/ totals inside the gate's caps. Throws —
 * failing this run — on the first problem, so a broken entry never reports itself ready.
 */
function verifyOutput() {
  const shotsDir = join(out, 'screenshots');
  const shots = existsSync(shotsDir)
    ? readdirSync(shotsDir).filter((name) => /\.(?:jpe?g|png)$/i.test(name)).sort()
    : [];
  if (shots.length < 3 || shots.length > DOSSIER_CAPS.screenshots.max) {
    throw new Error(`verify: expected 3-4 screenshots, found ${shots.length}`);
  }
  for (const name of shots) {
    const { size } = statSync(join(shotsDir, name));
    if (size > DOSSIER_CAPS.screenshots.max_bytes) {
      throw new Error(`verify: screenshot ${name} is ${size} bytes, over the ${DOSSIER_CAPS.screenshots.max_bytes} cap`);
    }
  }
  const dossierPath = join(out, 'dossier.json');
  if (!existsSync(dossierPath)) throw new Error('verify: dossier.json was not written');
  const dossierBytes = statSync(dossierPath).size;
  // The dossier must be the make.fun schema and name exactly the screenshots handed in.
  const dossier = JSON.parse(readFileSync(dossierPath, 'utf8'));
  if (dossier.schema !== 'makefun/dossier/v1') {
    throw new Error(`verify: dossier schema is ${JSON.stringify(dossier.schema)}, not makefun/dossier/v1`);
  }
  const dossierShots = (dossier.images ?? []).map((img) => img.name).sort();
  if (JSON.stringify(dossierShots) !== JSON.stringify(shots)) {
    throw new Error(`verify: dossier images ${JSON.stringify(dossierShots)} do not match screenshots/ ${JSON.stringify(shots)}`);
  }
  if (!existsSync(join(out, 'game', 'index.html'))) throw new Error('verify: game/index.html missing from the hand-in');
  const gameFiles = walk(join(out, 'game'));
  let gameBytes = 0;
  let sourceBytes = 0;
  let vendoredBytes = 0;
  for (const rel of gameFiles) {
    const size = statSync(join(out, 'game', rel)).size;
    gameBytes += size;
    if (rel.startsWith('vendor/') || /\.min\.(?:js|mjs|css)$/i.test(rel)) vendoredBytes += size;
    else sourceBytes += size;
  }
  if (gameFiles.length > DOSSIER_CAPS.game_max_files || gameBytes > DOSSIER_CAPS.game_max_bytes) {
    throw new Error(`verify: game/ totals (${gameFiles.length} files, ${gameBytes} bytes) exceed the caps`);
  }
  console.log(
    `coral-bay: verified hand-in — ${shots.length} screenshots (${shots.join(', ')}), ` +
    `game/ ${gameFiles.length} files ${gameBytes} bytes (source ${sourceBytes}, vendored ${vendoredBytes}), ` +
    `dossier.json ${dossierBytes} bytes`,
  );
}

verifyOutput();
