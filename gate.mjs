// Local replica of the submission gates for token-radar-01 (radar-3).
// Usage: node gate.mjs <output-dir> <snapshot.json>
// Checks: dashboard files, board rows, sort order, coverage/ledger, farm steps,
// screenshots, dossier match, implied bound, dossier size/text, recompute 198/198.
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as model from './lib/model.ts';
import * as dossierLib from './vendor/makefun-board.ts';

const outDir = process.argv[2];
const snapshotPath = process.argv[3];
let failures = 0;
function check(name, ok, detail) {
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' — ' + detail : ''));
  if (!ok) failures++;
}

const board = JSON.parse(fs.readFileSync(path.join(outDir, 'board.json'), 'utf8')).rows;
const dossier = JSON.parse(fs.readFileSync(path.join(outDir, 'dossier.json'), 'utf8'));
const snapshot = model.parseSnapshot(fs.readFileSync(snapshotPath, 'utf8'));

// 1. dashboard files: <=400 files, <=4 MiB total
const dashDir = path.join(outDir, 'dashboard');
const dashFiles = fs.readdirSync(dashDir).filter((f) => fs.statSync(path.join(dashDir, f)).isFile());
const dashBytes = dashFiles.reduce((s, f) => s + fs.statSync(path.join(dashDir, f)).size, 0);
check('dashboard_files', dashFiles.length <= 400 && dashBytes <= 4194304, dashFiles.length + ' files, ' + dashBytes + ' bytes');

// 2. board file: 100-4000 rows
check('board_file', board.length >= 100 && board.length <= 4000, board.length + ' rows');

// 3. sorted by implied value, descending
let sorted = true;
for (let i = 1; i < board.length; i++) {
  if (board[i].implied_value_usd > board[i - 1].implied_value_usd) { sorted = false; break; }
}
check('sorted_by_value', sorted, 'top ' + board[0].implied_value_usd + ' -> bottom ' + board[board.length - 1].implied_value_usd);

// 4. coverage: 40/40 watchlist, ledger 758
const watchlistRows = board.filter((r) => snapshot.watchlist.includes(r.slug)).length;
const live = board.length;
check('coverage', watchlistRows === snapshot.watchlist.length && snapshot.protocols.length === 758,
  'watchlist ' + watchlistRows + '/' + snapshot.watchlist.length + ', snapshot ' + snapshot.protocols.length);

// 5. farm steps: 3-12 per row
const stepsOk = board.every((r) => r.farm_steps.length >= 3 && r.farm_steps.length <= 12);
check('farm_steps', stepsOk, 'all rows 3-12 steps');

// 6. screenshots: 3 PNGs, each <=512 KiB
const shotDir = path.join(outDir, 'screenshots');
const shots = fs.readdirSync(shotDir).filter((f) => f.endsWith('.png'));
const shotsOk = shots.length >= 3 && shots.every((f) => fs.statSync(path.join(shotDir, f)).size <= 524288);
check('screenshots', shotsOk, shots.map((f) => f + ' ' + fs.statSync(path.join(shotDir, f)).size).join(', '));

// 7. dossier matches a rebuild from this output directory
// (buildDossier returns bytes, so compare as bytes, not as a JS string)
const caps = { text_max_bytes: 65536, screenshots: { max: 4, max_bytes: 524288 }, dashboard: { max_files: 400, max_bytes: 4194304 } };
const rebuilt = Buffer.from(dossierLib.buildDossier(outDir, caps));
const dossierBytesOnDisk = fs.readFileSync(path.join(outDir, 'dossier.json'));
check('dossier_matches', Buffer.compare(rebuilt, dossierBytesOnDisk) === 0, 'dossier ' + dossierBytesOnDisk.length + ' bytes, rebuilt ' + rebuilt.length + ' bytes');

// Extra: implied bound, dossier size/text, recompute
const maxImplied = Math.max(...board.map((r) => r.implied_value_usd));
check('implied_bound', maxImplied <= 1e14, 'max implied $' + maxImplied);
const dossierBytes = fs.statSync(path.join(outDir, 'dossier.json')).size;
const dossierTextBytes = Buffer.byteLength(dossier.text ?? '', 'utf8');check('dossier_size', dossierBytes <= 1572864 && dossierTextBytes <= 65536, dossierBytes + ' bytes total, ' + dossierTextBytes + ' bytes of text');

// Recompute: rebuild the board from the snapshot and compare every row
const { board: fresh } = model.buildBoard(snapshot);
let recomputed = 0;
const freshBySlug = new Map(fresh.map((r) => [r.slug, r]));
for (const r of board) {
  const f = freshBySlug.get(r.slug);
  if (f && f.implied_value_usd === r.implied_value_usd && f.p25_usd === r.p25_usd && f.p75_usd === r.p75_usd && f.rank === r.rank && f.farm.verdict === r.farm.verdict) recomputed++;
}
check('recompute', recomputed === board.length, recomputed + ' of ' + board.length + ' rows identical to a fresh fit');

console.log(failures === 0 ? 'ALL GATES PASS' : failures + ' GATE(S) FAILED');
process.exit(failures === 0 ? 0 : 1);
