// token-radar-01: score the sealed snapshot and lay out the ranked board.
//
// What this program does, end to end:
//   1. find the snapshot (--input, a file or a directory holding snapshot.json),
//   2. fit the value model from the snapshot itself (log market cap on log TVL, with the
//      shrunk category effects) and price every pre-token protocol the house rule keeps,
//   3. refuse to continue when the board fails the gate in boardIssue,
//   4. write board.json and data.js, copy dashboard/ and screenshots/ across,
//   5. finish with dossier.json, the summary the judge reads, built from the
//      finished output directory by the vendored library.
//
// Runs on Node 22 with the standard library only. When run outside the
// grader's container, MAKEFUN_OUTPUT_DIR takes the place of /output.

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as model from './lib/model.ts';
import * as dossierLib from './vendor/makefun-board.ts';

// Where this file lives: dashboard/ and screenshots/ sit next to it.
const entryRoot = import.meta.dirname;

// The dossier caps the gate hands out: how much text the judge reads, how
// many screenshots and dashboard files it accepts, and their byte limits.
const DOSSIER_TEXT_LIMIT = 65536;
const SHOT_LIMITS = { max: 4, max_bytes: 524288 };
const DASH_LIMITS = { max_files: 400, max_bytes: 4194304 };

// A screenshot's file name: letters, digits and . _ -, opening with a
// letter, digit or _, between 1 and 128 characters long.
const shotNamePattern = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

// How many screenshots the hand-in needs at minimum.
const SHOTS_REQUIRED = 3;

/** Complain on stderr and stop with `code`. */
function die(code: number, message: string): never {
  process.stderr.write(`radar: ${message}\n`);
  process.exit(code);
}

/**
 * The value of a `--flag value` or `--flag=value` argument, else `fallback`.
 * The spaced form wins when it is present with a value after it.
 */
function flagValue(argv: string[], flag: string, fallback: string): string {
  for (let i = 0; i + 1 < argv.length; i++) {
    if (argv[i] === `--${flag}`) return argv[i + 1]!;
  }
  const joined = `--${flag}=`;
  for (const token of argv) {
    if (token.startsWith(joined)) return token.slice(joined.length);
  }
  return fallback;
}

/**
 * Copy a directory's plain files into `dest`, leaving dotfiles and anything
 * that is not a regular file behind. A missing source means nothing copied.
 */
function mirrorDir(source: string, dest: string): string[] {
  if (!fs.existsSync(source)) return [];
  fs.mkdirSync(dest, { recursive: true });
  const moved: string[] = [];
  for (const entry of fs.readdirSync(source)) {
    if (entry.startsWith('.')) continue;
    const from = path.join(source, entry);
    if (!fs.statSync(from).isFile()) continue;
    fs.copyFileSync(from, path.join(dest, entry));
    moved.push(entry);
  }
  return moved;
}

function run(): void {
  const inputGiven = flagValue(process.argv, 'input', '/input');
  const snapshotPath = inputGiven.endsWith('.json')
    ? inputGiven
    : path.join(inputGiven, 'snapshot.json');
  if (!fs.existsSync(snapshotPath)) {
    die(2, `no snapshot found at ${snapshotPath} -- pass --input <snapshot.json|directory> or mount the sealed /input`);
  }
  const outDir = flagValue(process.argv, 'output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

  const snapshot = model.parseSnapshot(fs.readFileSync(snapshotPath, 'utf8'));
  const { board, radar } = model.buildBoard(snapshot);
  const gateProblem = model.boardIssue(board, snapshot);
  if (gateProblem !== null) {
    die(1, `the board the model wrote fails the gate: ${gateProblem}`);
  }

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'board.json'), JSON.stringify({ rows: board }) + '\n');
  fs.writeFileSync(path.join(outDir, 'data.js'), model.dataScript(radar));

  const dashFiles = mirrorDir(path.join(entryRoot, 'dashboard'), path.join(outDir, 'dashboard'));
  const images = mirrorDir(path.join(entryRoot, 'screenshots'), path.join(outDir, 'screenshots'));
  if (images.length < SHOTS_REQUIRED) {
    die(1, `screenshots/ holds ${images.length} image${images.length === 1 ? '' : 's'} -- hand in 3: the board, a detail view and a filtered view`);
  }
  for (const name of images) {
    if (!shotNamePattern.test(name)) {
      die(1, `screenshots/${name} is not a plain name of letters, digits and . _ -, 1 to 128 characters`);
    }
  }

  // The dossier is written last: the scorer rebuilds it from this output
  // directory and compares the bytes, so nothing may change after this.
  const caps = {
    text_max_bytes: DOSSIER_TEXT_LIMIT,
    screenshots: SHOT_LIMITS,
    dashboard: DASH_LIMITS,
  };
  fs.writeFileSync(path.join(outDir, 'dossier.json'), dossierLib.buildDossier(outDir, caps));

  const boardPath = path.join(outDir, 'board.json');
  const dataPath = path.join(outDir, 'data.js');
  const dossierPath = path.join(outDir, 'dossier.json');
  const v = radar.value;
  const f = radar.farm.verdicts;
  process.stdout.write(
    `radar: scored ${board.length} rows from ${snapshot.protocols.length} protocols ` +
      `(ledger ${radar.ledger.ranked} ranked + ${radar.ledger.token_bearing} live + ${radar.ledger.excluded} excluded = ${radar.ledger.total}, checksum ${radar.ledger.checksum})\n` +
      `radar: model radar-4 fit on ${v.train_n} comps, slope ${v.slope}, smearing ${v.smearing}, LOO RMSE ${v.loo_rmse}, walk-forward RMSE ${v.wf_rmse}\n` +
      `radar: farm verdicts FARM ${f.farm} / MARGINAL ${f.marginal} / SKIP ${f.skip}; total implied $${radar.ledger.total_implied_usd}\n` +
      `radar: wrote ${boardPath}, ${dataPath}, ${path.join(outDir, 'dashboard')} (${dashFiles.length} files), ${path.join(outDir, 'screenshots')} (${images.length} images) and ${dossierPath}\n`,
  );
}

run();
