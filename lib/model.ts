// The token radar's model (radar-4): one snapshot of the protocol universe in, one ranked board out.
//
// The board ranks every pre-token protocol the house rule keeps — the watchlist is the floor,
// never the ceiling — and accounts for all 758 protocols in a ledger: 198 ranked, 416 whose
// token already trades, 144 excluded by the house rule. A protocol is pre-token when its index
// entry records no token (no market cap, no CoinGecko id, no symbol); say it records no token,
// never that it has none: the snapshot is DefiLlama's record, not proof.
//
// The value model is FITTED from the snapshot on every run, not asserted:
//   log(mcap) ~ intercept + slope x log(TVL) + a shrunk category effect.
// The training set is the live-token protocols that already trade, with a market cap above zero,
// excluding exchange tokens and any comp whose token is worth more than 5x its TVL: above 5x a
// token is priced in a different regime from the one the TVL curve can price (the six comps
// above 5x are named on the dashboard and in the methodology note, with their ratios, and the
// model scored on all 118 comps is kept as a sensitivity). Age, chain count and seven-day
// growth were tested as extra terms and dropped: leave-one-out says they add noise to the price,
// not signal, so they stay out of the price and enter through the token odds instead. The fitted
// value is exp(prediction) x smearing, the mean of exp(residual) over the training set; the
// P25–P75 band comes from the leave-one-out residual quantiles, and the walk-forward split by
// listing date is the out-of-time check. The dashboard shows all of it, including the terms
// that were tried and not kept.
//
// The implied value is the fitted value times the token odds: a logistic P(a protocol records a
// token) fitted on all 758 protocols, from log TVL, log age, an age-missing flag, chain count,
// seven-day growth clipped to [-60, +120], and the category's shrunk token rate. It is a
// cross-sectional propensity — how much a protocol looks like the token-bearing ones — not a
// forecast that it will launch. Age enters the price through the odds: older protocols look more
// like the token-bearing set, so their odds rise; growth enters the same way, clipped, because
// the training range is -40% to +5% and one ranked row records +4448%.
//
// The farm verdict is costed on a concrete cheque, not a wallet share: one wallet deposits
// $2,500 for 12 weeks, and the modelled drop is its pro-rata share of the launch value —
// (deposit / TVL) x a 10% drop share to depositors x the fitted value at the P25 end of the
// band, if the token launches. The net is that drop minus gas and the T-bill return on the
// $2,500 over the 12 weeks. FARM when that net is positive and at least $25 an hour, MARGINAL
// when it is positive but slower, SKIP when it is not positive. The break-even cheque — the
// smallest deposit that covers its costs — and the drop share above which fees are covered are
// shown on every row, so the verdict never hides behind its assumption. The odds-adjusted
// expected take (modelled drop x token odds) is shown beside it in the detail view.
//
// No protocol name is ever special-cased: the same functions score every row.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of the term-selection table: a variant's out-of-sample scores, LOO and walk-forward. */
export interface TermRow {
  name: string;
  loo_rmse: number;
  loo_med_miss: number;
  wf_rmse: number;
  wf_med_miss: number;
  result: string;
}

/** The cap-5 model scored on the full 118-comp set (a sensitivity, not the fit). */
export interface Full118 {
  n: number;
  rmse: number;
  mae: number;
  r2: number;
  med_miss: number;
  /** The six comps above the 5x cap, scored by the cap-5 model: their own error. */
  excluded_n: number;
  excluded_rmse: number;
}

/** The fitted value model's numbers, as the dashboard states them. */
export interface ValueModel {
  /** Ordinary least squares on log market cap, fit from the snapshot on every run. */
  intercept: number;
  slope: number;
  /** Mean of exp(in-sample residual): the bias correction for exponentiating. */
  smearing: number;
  /** Shrinkage: a category with n comps keeps n / (n + shrink_k) of its median residual. */
  shrink_k: number;
  /** Training rows: live-token comps with a market cap above zero, ex-CEX, ex-ratio-cap. */
  train_n: number;
  /** The comp a token worth more than ratio_cap times its TVL is not: excluded by rule. */
  ratio_cap: number;
  ratio_excluded: string[];
  /** The excluded comps, with their category and mcap/TVL ratio, for the disclosure. */
  ratio_excluded_detail: { slug: string; category: string | null; ratio: number }[];
  kept_terms: string[];
  dropped_terms: string[];
  loo_rmse: number;
  loo_mae: number;
  loo_r2: number;
  /** Median absolute multiple miss, leave-one-out and walk-forward: the headline error. */
  loo_med_miss: number;
  wf_med_miss: number;
  /** The flat median-multiple baseline's median miss, same splits: the bar the curve must beat. */
  flat_loo_med_miss: number;
  flat_wf_med_miss: number;
  /** How wide the P25–P75 band is, as a multiple (exp of the LOO interquartile range). */
  band_width_x: number;
  /** Leave-one-out residual quantiles: the P25–P75 and P10–P90 bands. */
  loo_q10: number;
  loo_q25: number;
  loo_q75: number;
  loo_q90: number;
  loo_cov_p25_p75: number;
  loo_cov_p10_p90: number;
  wf_rmse: number;
  wf_mae: number;
  wf_cov_p25_p75: number;
  wf_cov_p10_p90: number;
  in_sample_r2: number;
  /** The term-selection table, computed live on the training set. */
  terms: TermRow[];
  /** The cap-5 model scored on all 118 comps, as a sensitivity. */
  full118: Full118;
}

/** The token-odds logistic's fitted coefficients (fit offline, stated here). */
export interface OddsModel {
  intercept: number;
  log_tvl: number;
  log_age: number;
  age_missing: number;
  chain_count: number;
  change_7d: number;
  cat_token_rate: number;
  /** Seven-day growth is clipped to this range before it enters the logit. */
  change_clip_low: number;
  change_clip_high: number;
  /** The category token rate's prior: m protocols at the global base rate. */
  cat_rate_prior: number;
  brier: number;
  brier_baseline: number;
  auc: number;
  /** Rows the logistic was fit on: every protocol in the snapshot. */
  train_n: number;
  /** Medians the odds model imputes with, computed from the snapshot on every run. */
  median_age_days: number;
  median_change_7d: number;
}

/**
 * The token-odds logistic, fitted offline on all 758 protocols of the sealed snapshot by
 * Newton–Raphson (see the analysis in the repository's methodology note). The program applies
 * these coefficients; it computes every feature — including each category's shrunk token rate —
 * from the snapshot it is handed, so the odds follow the input, not a list.
 */
export const ODDS: OddsModel = {
  intercept: -9.25979529466082,
  log_tvl: 0.10572073804721453,
  log_age: 0.5185383888809444,
  age_missing: 0.93540842476026,
  chain_count: 0.031832556564118056,
  change_7d: -0.024040433068555075,
  cat_token_rate: 7.078051049519046,
  change_clip_low: -60,
  change_clip_high: 120,
  cat_rate_prior: 10,
  brier: 0.184,
  brier_baseline: 0.2476,
  auc: 0.7965,
  train_n: 758,
  median_age_days: 677,
  median_change_7d: -8.2334,
};

/** The farm economics' stated assumptions, as the dashboard states them. */
export interface FarmModel {
  /** One wallet's deposit, in dollars, for the 12-week horizon. */
  deposit_usd: number;
  /** The share of a launch's value that goes to depositors. */
  drop_share: number;
  /** The horizon, in days: 12 weeks. */
  horizon_days: number;
  /** The T-bill return on the deposit over the horizon, per year. */
  tbill_annual: number;
  /** The $/hour a farm must clear to be a FARM rather than MARGINAL. */
  farm_per_hour: number;
  gas_ethereum: number;
  gas_l2: number;
  gas_other: number;
  verdicts: { farm: number; marginal: number; skip: number };
  /** The smallest deposit that covers its own costs, across the board. */
  smallest_breakeven_deposit: number;
  /** The median break-even deposit across the board. */
  median_breakeven_deposit: number;
  /** The best net per hour on the board, and the row that earns it. */
  best_per_hour_usd: number;
  best_per_hour_slug: string;
}

export const FARM: FarmModel = {
  deposit_usd: 2500,
  drop_share: 0.1,
  horizon_days: 84,
  tbill_annual: 0.045,
  farm_per_hour: 25,
  gas_ethereum: 2,
  gas_l2: 0.5,
  gas_other: 1,
  verdicts: { farm: 16, marginal: 78, skip: 104 },
  smallest_breakeven_deposit: 233,
  median_breakeven_deposit: 1655,
  best_per_hour_usd: 32.58,
  best_per_hour_slug: 'alphagrowth',
};

/** The chains charged the L2 gas rate: the layer-2 networks in the snapshot's chain names. */
export const L2_CHAINS: ReadonlySet<string> = new Set([
  'Abstract', 'Arbitrum', 'Arbitrum Nova', 'Astar zkEVM', 'BOB', 'Base', 'Blast',
  'Boba', 'Cronos zkEVM', 'Degen', 'Immutable zkEVM', 'Ink', 'Katana', 'Kroma',
  'Linea', 'Lisk', 'Mantle', 'Metis', 'Mint', 'Mode', 'Morph', 'Optimism',
  'Polygon zkEVM', 'Scroll', 'Silicon zkEVM', 'Soneium', 'Stable', 'Starknet',
  'Swellchain', 'Taiko', 'Unichain', 'World Chain', 'X Layer', 'Zircuit',
  'Zkfair', 'Zora', 'zkSync Era',
]);

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-4';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** Bootstrap refits behind each row's rank range; the seed fixes the resamples. */
export const BOOT_N = 200;
export const BOOT_SEED = 20261114;

/** One category's fitted effect: the shrunk median residual of its live-token comps. */
export interface CategoryEffect {
  category: string | null;
  /** Live-token comps in the category that already trade. */
  n: number;
  /** Their median residual from the log TVL curve, in log-points. */
  median_resid: number;
  /** The effect the model applies: the median shrunk by n / (n + shrink_k). */
  effect: number;
}

/** The ledger: every one of the snapshot's protocols, in exactly one bucket. */
export interface Ledger {
  total: number;
  ranked: number;
  token_bearing: number;
  excluded: number;
  watchlist: number;
  below_floor: number;
  above_floor_not_watchlist: string[];
  /** Excluded by primary reason: version marker, excluded category, wrapped/staked word. */
  excluded_version: number;
  excluded_category: number;
  excluded_word: number;
  /** Excluded-category split by the protocol's own category (primary reason only). */
  excluded_category_breakdown: { [category: string]: number };
  /** The board's total implied value, and the checksum that ties the board to it. */
  total_implied_usd: number;
  checksum: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  p25_usd: number;
  p75_usd: number;
  token_odds: number;
  fitted_value_usd: number;
  /** The row's rank range across the 200 bootstrap refits (P10–P90). */
  rank_p10: number;
  rank_p90: number;
  /** True when the row passes every snapshot-visible house rule but is not on the watchlist. */
  watchlist_gap: boolean;
  model: {
    fitted_value_usd: number;
    token_odds: number;
    cat_effect: number;
    cat_n: number;
    cat_token_rate: number;
    pred_log: number;
    p25_usd: number;
    p75_usd: number;
    /** The fitted value if the token launches, at the P25 end of the band (no odds). */
    fitted_p25_usd: number;
    /** The fitted value's multiple of TVL, if the token launches. */
    multiple: number;
  };
  farm: {
    verdict: 'FARM' | 'MARGINAL' | 'SKIP';
    /** The modelled drop if the token launches: (deposit/TVL) x drop share x fitted P25. */
    take_usd: number;
    /** The expected take: the modelled drop times the token odds. */
    expected_take_usd: number;
    net_cash_usd: number;
    per_hour_usd: number;
    /** The smallest deposit that covers its own gas and T-bill cost. */
    breakeven_deposit_usd: number;
    /** The drop share above which the fees are covered, at the base deposit. */
    min_drop_share: number;
    /** Exit if the protocol's TVL prints below this. */
    exit_tvl_usd: number;
    gas_usd: number;
    gas_per_txn_usd: number;
    n_txn: number;
    capital_usd: number;
    hold_days: number;
    hours_total: number;
    tbill_cost_usd: number;
    deposit_usd: number;
    drop_share: number;
    horizon_days: number;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with its value breakdown and farm plan. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  p25_usd: number;
  p75_usd: number;
  token_odds: number;
  fitted_value_usd: number;
  cat_effect: number;
  cat_n: number;
  cat_token_rate: number;
  rank_p10: number;
  rank_p90: number;
  watchlist_gap: boolean;
  verdict: 'FARM' | 'MARGINAL' | 'SKIP';
  take_usd: number;
  expected_take_usd: number;
  net_cash_usd: number;
  per_hour_usd: number;
  breakeven_deposit_usd: number;
  min_drop_share: number;
  exit_tvl_usd: number;
  fitted_p25_usd: number;
  multiple: number;
  gas_usd: number;
  gas_per_txn_usd: number;
  n_txn: number;
  hold_days: number;
  capital_usd: number;
  hours_total: number;
  tbill_cost_usd: number;
  deposit_usd: number;
  drop_share: number;
  horizon_days: number;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** One training comp, for the scatter plot and the nearest-peers table. */
export interface CompRow {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  mcap_usd: number;
  /** The model's fitted value for this comp (in-sample): CAP ÷ model is mcap / fitted. */
  fitted_value_usd: number;
  ratio: number;
}

/** Everything the dashboard needs: the board, the live set, the ledger and the fitted model. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  value: ValueModel;
  odds: OddsModel;
  farm: FarmModel;
  ledger: Ledger;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  /** One fitted effect per category that appears on the board. */
  effects: CategoryEffect[];
  rows: RadarRow[];
  live: LiveRow[];
  /** The 112 training comps, for the scatter plot and the nearest-peers table. */
  comps: CompRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a non-empty list of numbers; null when the list is empty. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * A quantile by linear interpolation on the sorted values, the way numpy's default does it:
 * position q x (n - 1), interpolated between the two nearest order statistics.
 */
export function quantile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return Number.NaN;
  if (sorted.length === 1) return sorted[0]!;
  const pos = q * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The FNV-1a 32-bit hash of a string, as eight hex digits. */
export function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  const bytes = Buffer.from(text, 'utf8');
  for (const b of bytes) {
    hash ^= b;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** The categories the house rule keeps off the board: bridges, liquid staking and exchanges. */
const EXCLUDED_CATEGORIES: ReadonlySet<string> = new Set([
  'Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX',
]);
const EXCHANGES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Every house-rule reason a pre-token protocol fails, in the order the house states them. */
export function exclusionReasons(p: SnapshotProtocol): string[] {
  const reasons: string[] = [];
  if (VERSIONED.test(p.name)) reasons.push('version_marker');
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) reasons.push('excluded_category');
  if (WRAPPED_WORD.test(p.name)) reasons.push('wrapped_staked_word');
  if (EXCHANGES.some((e) => p.name.toLowerCase().startsWith(e.toLowerCase()))) reasons.push('exchange_prefix');
  return reasons;
}

/** Whether a protocol is one the board may rank: pre-token and kept by every house rule. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && exclusionReasons(p).length === 0;
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

// ---------------------------------------------------------------- the fitted value model
//
// The training set is the snapshot's live-token protocols with a market cap above zero,
// excluding exchange tokens and any comp whose token is worth more than 5x its TVL (the
// ratio cap: above 5x a token is priced in a different regime from the one the TVL curve
// can price — the six comps above 5x are named with their ratios on the dashboard and in
// the methodology note, and the model scored on all 118 comps is kept as a sensitivity).
// The fit is ordinary least squares on log market cap against log TVL, then a second stage:
// each category's median residual, shrunk by n / (n + 5), added back as the category's
// effect. A category with no training rows gets an effect of zero. The same fit runs on
// every run of the program, so the numbers the dashboard shows are the numbers this
// snapshot produces.

/** The training rows: live-token comps the log curve is fit on, at a ratio cap. */
export function trainingSet(snapshot: Snapshot, cap = 5): {
  rows: SnapshotProtocol[];
  ratioExcluded: string[];
  ratioDetail: { slug: string; category: string | null; ratio: number }[];
} {
  const rows: SnapshotProtocol[] = [];
  const ratioExcluded: string[] = [];
  const ratioDetail: { slug: string; category: string | null; ratio: number }[] = [];
  for (const p of snapshot.protocols) {
    if (isPreToken(p) || p.category === 'CEX') continue;
    if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    if (ratio > cap) {
      ratioExcluded.push(p.slug);
      ratioDetail.push({ slug: p.slug, category: p.category, ratio: Math.round(ratio * 10) / 10 });
      continue;
    }
    rows.push(p);
  }
  return { rows, ratioExcluded, ratioDetail };
}

/** Closed-form least squares for y ~ a + b x: the slope and intercept. */
function ols2(xs: number[], ys: number[]): { intercept: number; slope: number } {
  const n = xs.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i]! - mx) * (xs[i]! - mx);
    sxy += (xs[i]! - mx) * (ys[i]! - my);
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  return { intercept: my - slope * mx, slope };
}

/** The shrunk median residual per category, from a fit's residuals. */
function categoryEffects(rows: SnapshotProtocol[], residuals: number[]): Map<string, CategoryEffect> {
  const by = new Map<string, number[]>();
  rows.forEach((p, i) => {
    const key = p.category ?? '';
    const list = by.get(key);
    if (list === undefined) by.set(key, [residuals[i]!]);
    else list.push(residuals[i]!);
  });
  const out = new Map<string, CategoryEffect>();
  for (const [key, rs] of by) {
    const med = median(rs)!;
    const n = rs.length;
    out.set(key, {
      category: key === '' ? null : key,
      n,
      median_resid: med,
      effect: med * (n / (n + 5)),
    });
  }
  return out;
}

/** A fit of log(mcap) ~ intercept + slope x log(TVL), with the category effects of its residuals. */
export interface ValueFit {
  intercept: number;
  slope: number;
  effects: Map<string, CategoryEffect>;
  /** Mean of exp(in-sample residual): the smearing correction. */
  smearing: number;
  residuals: number[];
}

export function fitValue(rows: SnapshotProtocol[]): ValueFit {
  const xs = rows.map((p) => Math.log(p.tvl_usd));
  const ys = rows.map((p) => Math.log(p.mcap_usd!));
  const { intercept, slope } = ols2(xs, ys);
  const raw = ys.map((y, i) => y - (intercept + slope * xs[i]!));
  const effects = categoryEffects(rows, raw);
  const residuals = raw.map((r, i) => {
    const eff = effects.get(rows[i]!.category ?? '')?.effect ?? 0;
    return r - eff;
  });
  const smearing = residuals.reduce((s, r) => s + Math.exp(r), 0) / residuals.length;
  return { intercept, slope, effects, smearing, residuals };
}

/** One row's log prediction under a fit: the curve plus its category's effect. */
function predictLog(p: SnapshotProtocol, fit: ValueFit): number {
  const eff = fit.effects.get(p.category ?? '')?.effect ?? 0;
  return fit.intercept + fit.slope * Math.log(p.tvl_usd) + eff;
}

/** The root mean square and mean absolute error of a set of residuals, and their R². */
function errorStats(residuals: number[], ys: number[]): { rmse: number; mae: number; r2: number } {
  const n = residuals.length;
  const rmse = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / n);
  const mae = residuals.reduce((s, r) => s + Math.abs(r), 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  const ssTot = ys.reduce((s, v) => s + (v - my) * (v - my), 0);
  const ssRes = residuals.reduce((s, r) => s + r * r, 0);
  return { rmse, mae, r2: ssTot === 0 ? 0 : 1 - ssRes / ssTot };
}

/** Solve a small linear system by Gaussian elimination with partial pivoting. */
function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i]!]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[piv]![c]!)) piv = r;
    const tmp = M[c]!;
    M[c] = M[piv]!;
    M[piv] = tmp;
    const d = M[c]![c]!;
    if (Math.abs(d) < 1e-12) return null;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r]![c]! / d;
      for (let k = c; k <= n; k++) M[r]![k]! -= f * M[c]![k]!;
    }
  }
  return M.map((r, i) => r[n]! / M[i]![i]!);
}

/** Least squares for a design matrix with an intercept column already included. */
function olsK(X: number[][], y: number[]): number[] {
  const k = X[0]!.length;
  const A: number[][] = Array.from({ length: k }, () => Array(k).fill(0));
  const b: number[] = Array(k).fill(0);
  for (let i = 0; i < X.length; i++) {
    for (let a = 0; a < k; a++) {
      b[a]! += X[i]![a]! * y[i]!;
      for (let c = 0; c < k; c++) A[a]![c]! += X[i]![a]! * X[i]![c]!;
    }
  }
  return solveLinear(A, b) ?? Array(k).fill(0);
}

/** The medians the term variants impute with, from the whole snapshot. */
export interface VariantCtx {
  medChg: number;
  medAge: number;
  asOf: string;
}

type ExtraFn = (p: SnapshotProtocol, ctx: VariantCtx) => number[];
const EXTRA_NONE: ExtraFn = () => [];
const EXTRA_CHG: ExtraFn = (p, ctx) => [p.change_7d ?? ctx.medChg];
const EXTRA_AGE: ExtraFn = (p, ctx) => [Math.log((ageDays(ctx.asOf, p.listed_at) ?? ctx.medAge) + 1)];
const EXTRA_CHAINS: ExtraFn = (p) => [p.chains.length];
const EXTRA_LT2: ExtraFn = (p) => {
  const lt = Math.log(p.tvl_usd);
  return [lt * lt];
};
const EXTRA_ALL: ExtraFn = (p, ctx) => [
  p.change_7d ?? ctx.medChg,
  Math.log((ageDays(ctx.asOf, p.listed_at) ?? ctx.medAge) + 1),
  p.chains.length,
];

/**
 * A fit of log(mcap) on log(TVL) plus extra stage-1 terms, with the shrunk category
 * effect as a second stage when useCat is set. Mirrors fitValue for the no-extra case.
 */
export interface ExtraFit {
  beta: number[];
  effects: Map<string, CategoryEffect>;
  smearing: number;
  predict: (p: SnapshotProtocol) => number;
}

export function fitValueExtra(rows: SnapshotProtocol[], extra: ExtraFn, useCat: boolean, ctx: VariantCtx): ExtraFit {
  const X = rows.map((p) => [1, Math.log(p.tvl_usd), ...extra(p, ctx)]);
  const y = rows.map((p) => Math.log(p.mcap_usd!));
  const beta = olsK(X, y);
  const raw = y.map((v, i) => v - X[i]!.reduce((s, x, j) => s + beta[j]! * x, 0));
  const by = new Map<string, number[]>();
  rows.forEach((p, i) => {
    const key = p.category ?? '';
    const list = by.get(key);
    if (list === undefined) by.set(key, [raw[i]!]);
    else list.push(raw[i]!);
  });
  const effects = new Map<string, CategoryEffect>();
  for (const [key, rs] of by) {
    const med = median(rs)!;
    const n = rs.length;
    effects.set(key, { category: key === '' ? null : key, n, median_resid: med, effect: med * (n / (n + 5)) });
  }
  const resid = raw.map((r, i) => r - (useCat ? (effects.get(rows[i]!.category ?? '')?.effect ?? 0) : 0));
  const smearing = resid.reduce((s, r) => s + Math.exp(r), 0) / resid.length;
  return {
    beta,
    effects,
    smearing,
    predict: (p) => {
      const row = [1, Math.log(p.tvl_usd), ...extra(p, ctx)];
      return row.reduce((s, x, j) => s + beta[j]! * x, 0) + (useCat ? (effects.get(p.category ?? '')?.effect ?? 0) : 0);
    },
  };
}

/** LOO + walk-forward scores for one variant: RMSE and median multiple miss on each split. */
function variantScores(rows: SnapshotProtocol[], extra: ExtraFn, useCat: boolean, ctx: VariantCtx): {
  loo_rmse: number;
  loo_med_miss: number;
  wf_rmse: number;
  wf_med_miss: number;
} {
  const looResid: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    const rest = rows.filter((_, j) => j !== i);
    const f = fitValueExtra(rest, extra, useCat, ctx);
    looResid.push(Math.log(rows[i]!.mcap_usd!) - f.predict(rows[i]!));
  }
  const wfResid: number[] = [];
  for (const cutoff of ['2023-01-01', '2024-01-01', '2025-01-01']) {
    const tr = rows.filter((p) => p.listed_at !== null && p.listed_at < cutoff);
    const te = rows.filter((p) => p.listed_at !== null && p.listed_at >= cutoff);
    if (tr.length === 0 || te.length === 0) continue;
    const f = fitValueExtra(tr, extra, useCat, ctx);
    for (const p of te) wfResid.push(Math.log(p.mcap_usd!) - f.predict(p));
  }
  const medMiss = (rs: number[]): number => median(rs.map((r) => Math.exp(Math.abs(r)))) ?? Number.NaN;
  const rmse = (rs: number[]): number => Math.sqrt(rs.reduce((s, r) => s + r * r, 0) / rs.length);
  return { loo_rmse: rmse(looResid), loo_med_miss: medMiss(looResid), wf_rmse: rmse(wfResid), wf_med_miss: medMiss(wfResid) };
}

/** The flat median-multiple baseline's LOO + walk-forward median miss. */
function flatScores(rows: SnapshotProtocol[]): { loo_med_miss: number; wf_med_miss: number; loo_rmse: number; wf_rmse: number } {
  const looResid: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    const rest = rows.filter((_, j) => j !== i);
    const mm = median(rest.map((p) => Math.log(p.mcap_usd!) - Math.log(p.tvl_usd)))!;
    looResid.push(Math.log(rows[i]!.mcap_usd!) - (Math.log(rows[i]!.tvl_usd) + mm));
  }
  const wfResid: number[] = [];
  for (const cutoff of ['2023-01-01', '2024-01-01', '2025-01-01']) {
    const tr = rows.filter((p) => p.listed_at !== null && p.listed_at < cutoff);
    const te = rows.filter((p) => p.listed_at !== null && p.listed_at >= cutoff);
    if (tr.length === 0 || te.length === 0) continue;
    const mm = median(tr.map((p) => Math.log(p.mcap_usd!) - Math.log(p.tvl_usd)))!;
    for (const p of te) wfResid.push(Math.log(p.mcap_usd!) - (Math.log(p.tvl_usd) + mm));
  }
  const medMiss = (rs: number[]): number => median(rs.map((r) => Math.exp(Math.abs(r)))) ?? Number.NaN;
  const rmse = (rs: number[]): number => Math.sqrt(rs.reduce((s, r) => s + r * r, 0) / rs.length);
  return { loo_med_miss: medMiss(looResid), wf_med_miss: medMiss(wfResid), loo_rmse: rmse(looResid), wf_rmse: rmse(wfResid) };
}

/**
 * The leave-one-out predictions for a training set: each row predicted by a fit on all the
 * others, so the error is out-of-sample by construction. The quantiles of those residuals
 * are the P25–P75 and P10–P90 bands the board shows.
 */
export function looPredictions(rows: SnapshotProtocol[]): { preds: number[]; ys: number[] } {
  const preds: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    const rest = rows.filter((_, j) => j !== i);
    const fit = fitValue(rest);
    preds.push(predictLog(rows[i]!, fit));
    ys.push(Math.log(rows[i]!.mcap_usd!));
  }
  return { preds, ys };
}

/** The walk-forward check: train on protocols listed before each cutoff, test on the rest. */
export function walkForward(rows: SnapshotProtocol[], q25: number, q75: number, q10: number, q90: number): {
  cuts: { cutoff: string; n_train: number; n_test: number; rmse: number; mae: number; cov_p25_p75: number; cov_p10_p90: number }[];
  pooled: { rmse: number; mae: number; cov_p25_p75: number; cov_p10_p90: number; n_test_total: number };
} {
  const cuts: { cutoff: string; n_train: number; n_test: number; rmse: number; mae: number; cov_p25_p75: number; cov_p10_p90: number }[] = [];
  const allResid: number[] = [];
  const allYs: number[] = [];
  for (const cutoff of ['2023-01-01', '2024-01-01', '2025-01-01']) {
    const tr = rows.filter((p) => p.listed_at !== null && p.listed_at < cutoff);
    const te = rows.filter((p) => p.listed_at !== null && p.listed_at >= cutoff);
    const fit = fitValue(tr);
    const resid = te.map((p) => Math.log(p.mcap_usd!) - predictLog(p, fit));
    const ys = te.map((p) => Math.log(p.mcap_usd!));
    const stats = errorStats(resid, ys);
    cuts.push({
      cutoff,
      n_train: tr.length,
      n_test: te.length,
      rmse: round4(stats.rmse),
      mae: round4(stats.mae),
      cov_p25_p75: round4(resid.filter((r) => r >= q25 && r <= q75).length / Math.max(1, resid.length)),
      cov_p10_p90: round4(resid.filter((r) => r >= q10 && r <= q90).length / Math.max(1, resid.length)),
    });
    allResid.push(...resid);
    allYs.push(...ys);
  }
  const pooledStats = errorStats(allResid, allYs);
  return {
    cuts,
    pooled: {
      rmse: round4(pooledStats.rmse),
      mae: round4(pooledStats.mae),
      cov_p25_p75: round4(allResid.filter((r) => r >= q25 && r <= q75).length / Math.max(1, allResid.length)),
      cov_p10_p90: round4(allResid.filter((r) => r >= q10 && r <= q90).length / Math.max(1, allResid.length)),
      n_test_total: allResid.length,
    },
  };
}

/** The value model, fit from the snapshot: coefficients, smearing, LOO and walk-forward. */
export function fitValueModel(snapshot: Snapshot): { model: ValueModel; fit: ValueFit; effects: CategoryEffect[] } {
  const { rows, ratioExcluded, ratioDetail } = trainingSet(snapshot, 5);
  const fit = fitValue(rows);
  const { preds, ys } = looPredictions(rows);
  const looResid = ys.map((y, i) => y - preds[i]!);
  const looStats = errorStats(looResid, ys);
  const q10 = quantile(looResid, 0.1);
  const q25 = quantile(looResid, 0.25);
  const q75 = quantile(looResid, 0.75);
  const q90 = quantile(looResid, 0.9);
  const wf = walkForward(rows, q25, q75, q10, q90);
  const inSample = errorStats(fit.residuals, ys);
  const effects = [...fit.effects.values()].sort((a, b) =>
    (a.category ?? '') < (b.category ?? '') ? -1 : (a.category ?? '') > (b.category ?? '') ? 1 : 0);
  const medMiss = (rs: number[]): number => median(rs.map((r) => Math.exp(Math.abs(r)))) ?? Number.NaN;
  // Walk-forward residuals under the kept fit, for the median miss on that split.
  const wfResid: number[] = [];
  for (const cutoff of ['2023-01-01', '2024-01-01', '2025-01-01']) {
    const tr = rows.filter((p) => p.listed_at !== null && p.listed_at < cutoff);
    const te = rows.filter((p) => p.listed_at !== null && p.listed_at >= cutoff);
    if (tr.length === 0 || te.length === 0) continue;
    const f = fitValue(tr);
    for (const p of te) wfResid.push(Math.log(p.mcap_usd!) - predictLog(p, f));
  }
  const flat = flatScores(rows);
  // The term-selection table, computed live: each variant's LOO and walk-forward scores.
  const ctx: VariantCtx = {
    medChg: median(snapshot.protocols.map((p) => p.change_7d).filter((c): c is number => c !== null)) ?? -8.2334,
    medAge: median(snapshot.protocols.map((p) => ageDays(snapshot.as_of, p.listed_at)).filter((a): a is number => a !== null)) ?? 677,
    asOf: snapshot.as_of,
  };
  const sizeOnly = variantScores(rows, EXTRA_NONE, false, ctx);
  const sizeCat = variantScores(rows, EXTRA_NONE, true, ctx);
  const plusChg = variantScores(rows, EXTRA_CHG, true, ctx);
  const plusAge = variantScores(rows, EXTRA_AGE, true, ctx);
  const plusChains = variantScores(rows, EXTRA_CHAINS, true, ctx);
  const plusLt2 = variantScores(rows, EXTRA_LT2, true, ctx);
  const plusAll = variantScores(rows, EXTRA_ALL, true, ctx);
  const terms: TermRow[] = [
    { name: 'flat median multiple', loo_rmse: round4(flat.loo_rmse), loo_med_miss: round4(flat.loo_med_miss), wf_rmse: round4(flat.wf_rmse), wf_med_miss: round4(flat.wf_med_miss), result: 'baseline' },
    { name: 'size curve only', loo_rmse: round4(sizeOnly.loo_rmse), loo_med_miss: round4(sizeOnly.loo_med_miss), wf_rmse: round4(sizeOnly.wf_rmse), wf_med_miss: round4(sizeOnly.wf_med_miss), result: 'base' },
    { name: '+ category effect', loo_rmse: round4(sizeCat.loo_rmse), loo_med_miss: round4(sizeCat.loo_med_miss), wf_rmse: round4(sizeCat.wf_rmse), wf_med_miss: round4(sizeCat.wf_med_miss), result: 'kept' },
    { name: '+ 7-day growth', loo_rmse: round4(plusChg.loo_rmse), loo_med_miss: round4(plusChg.loo_med_miss), wf_rmse: round4(plusChg.wf_rmse), wf_med_miss: round4(plusChg.wf_med_miss), result: 'tested, not kept' },
    { name: '+ no-token age', loo_rmse: round4(plusAge.loo_rmse), loo_med_miss: round4(plusAge.loo_med_miss), wf_rmse: round4(plusAge.wf_rmse), wf_med_miss: round4(plusAge.wf_med_miss), result: 'tested, not kept' },
    { name: '+ chain count', loo_rmse: round4(plusChains.loo_rmse), loo_med_miss: round4(plusChains.loo_med_miss), wf_rmse: round4(plusChains.wf_rmse), wf_med_miss: round4(plusChains.wf_med_miss), result: 'tested, not kept' },
    { name: '+ size squared', loo_rmse: round4(plusLt2.loo_rmse), loo_med_miss: round4(plusLt2.loo_med_miss), wf_rmse: round4(plusLt2.wf_rmse), wf_med_miss: round4(plusLt2.wf_med_miss), result: 'tested, not kept' },
    { name: '+ growth + age + chains', loo_rmse: round4(plusAll.loo_rmse), loo_med_miss: round4(plusAll.loo_med_miss), wf_rmse: round4(plusAll.wf_rmse), wf_med_miss: round4(plusAll.wf_med_miss), result: 'tested, not kept' },
  ];
  // Sensitivity: the cap-5 model scored on all 118 comps (the full set at the old 100x cap).
  const fullRows = trainingSet(snapshot, 100).rows;
  const fullResid = fullRows.map((p) => Math.log(p.mcap_usd!) - predictLog(p, fit));
  const fullYs = fullRows.map((p) => Math.log(p.mcap_usd!));
  const fullStats = errorStats(fullResid, fullYs);
  // The six comps the 5x cap newly excludes: in the 118-comp set but not in the 112-comp fit
  // (rain, at 400x, was already excluded at the old 100x cap and is not among them).
  const cap5Slugs = new Set(rows.map((p) => p.slug));
  const exclResid = fullRows.filter((p) => !cap5Slugs.has(p.slug)).map((p) => Math.log(p.mcap_usd!) - predictLog(p, fit));
  const full118: Full118 = {
    n: fullRows.length,
    rmse: round4(fullStats.rmse),
    mae: round4(fullStats.mae),
    r2: round4(fullStats.r2),
    med_miss: round4(medMiss(fullResid)),
    excluded_n: exclResid.length,
    excluded_rmse: round4(Math.sqrt(exclResid.reduce((s, r) => s + r * r, 0) / Math.max(1, exclResid.length))),
  };
  const model: ValueModel = {
    intercept: fit.intercept,
    slope: fit.slope,
    smearing: fit.smearing,
    shrink_k: 5,
    train_n: rows.length,
    ratio_cap: 5,
    ratio_excluded: ratioExcluded,
    ratio_excluded_detail: ratioDetail,
    kept_terms: ['category'],
    dropped_terms: ['age', 'chain_count', 'change_7d'],
    loo_rmse: round4(looStats.rmse),
    loo_mae: round4(looStats.mae),
    loo_r2: round4(looStats.r2),
    loo_med_miss: round4(medMiss(looResid)),
    wf_med_miss: round4(medMiss(wfResid)),
    flat_loo_med_miss: round4(flat.loo_med_miss),
    flat_wf_med_miss: round4(flat.wf_med_miss),
    band_width_x: round4(Math.exp(q75 - q25)),
    loo_q10: q10,
    loo_q25: q25,
    loo_q75: q75,
    loo_q90: q90,
    loo_cov_p25_p75: round4(looResid.filter((r) => r >= q25 && r <= q75).length / looResid.length),
    loo_cov_p10_p90: round4(looResid.filter((r) => r >= q10 && r <= q90).length / looResid.length),
    wf_rmse: wf.pooled.rmse,
    wf_mae: wf.pooled.mae,
    wf_cov_p25_p75: wf.pooled.cov_p25_p75,
    wf_cov_p10_p90: wf.pooled.cov_p10_p90,
    in_sample_r2: round4(inSample.r2),
    terms,
    full118,
  };
  return { model, fit, effects };
}

// ---------------------------------------------------------------- the token odds
//
// A logistic P(a protocol records a token), fitted offline on all 758 protocols of the sealed
// snapshot. The coefficients are stated in ODDS above; the program computes every feature from
// the snapshot it is handed — log TVL, log age with an age-missing flag, chain count, seven-day
// growth clipped to [-60, +120], and the category's token rate, shrunk toward the global base
// rate with a prior of 10 — so the odds follow the input. The clip matters: the training range
// for growth is -40% to +5%, and one ranked row records +4448%; unclipped, its odds underflow
// to zero and its implied value with them.

/** Each category's shrunk token rate: the share of its protocols that record a token. */
export function categoryTokenRates(snapshot: Snapshot): Map<string, number> {
  const base = snapshot.protocols.filter((p) => p.symbol !== null).length / snapshot.protocols.length;
  const pos = new Map<string, number>();
  const tot = new Map<string, number>();
  for (const p of snapshot.protocols) {
    const key = p.category ?? '';
    tot.set(key, (tot.get(key) ?? 0) + 1);
    if (p.symbol !== null) pos.set(key, (pos.get(key) ?? 0) + 1);
  }
  const out = new Map<string, number>();
  for (const [key, n] of tot) {
    out.set(key, ((pos.get(key) ?? 0) + ODDS.cat_rate_prior * base) / (n + ODDS.cat_rate_prior));
  }
  return out;
}

/** The median age and median seven-day growth over the whole snapshot, for imputation. */
export function oddsMedians(snapshot: Snapshot): { medianAge: number; medianChange: number } {
  const ages = snapshot.protocols
    .map((p) => ageDays(snapshot.as_of, p.listed_at))
    .filter((a): a is number => a !== null);
  const changes = snapshot.protocols
    .map((p) => p.change_7d)
    .filter((c): c is number => c !== null);
  return {
    medianAge: median(ages) ?? 677,
    medianChange: median(changes) ?? -8.2334,
  };
}

/** A protocol's token odds under the fitted logistic. */
export function tokenOdds(
  p: SnapshotProtocol,
  snapshot: Snapshot,
  rates: Map<string, number>,
  medians: { medianAge: number; medianChange: number },
): number {
  const age = ageDays(snapshot.as_of, p.listed_at);
  const logAge = Math.log((age ?? medians.medianAge) + 1);
  const rawChange = p.change_7d ?? medians.medianChange;
  const change = Math.min(ODDS.change_clip_high, Math.max(ODDS.change_clip_low, rawChange));
  const rate = rates.get(p.category ?? '') ?? 0.5;
  const z =
    ODDS.intercept +
    ODDS.log_tvl * Math.log(p.tvl_usd) +
    ODDS.log_age * logAge +
    ODDS.age_missing * (age === null ? 1 : 0) +
    ODDS.chain_count * p.chains.length +
    ODDS.change_7d * change +
    ODDS.cat_token_rate * rate;
  return 1 / (1 + Math.exp(-Math.max(-500, Math.min(500, z))));
}

// ---------------------------------------------------------------- the farm plan
//
// Seven steps per protocol, generated from its own category, chains and TVL — never from
// a list of names. Every farm uses the same concrete cheque: a $2,500 deposit held for
// 12 weeks (84 days), $500 added each week, the gas following the first chain. Each step
// states what it costs and how long it takes; the verdict is separate and is computed
// from the modelled drop (see farmEconomics), never from the step text.

/** The farm's fixed cheque, in dollars: one wallet, one deposit, 12 weeks. */
export const FARM_DEPOSIT = 2500;
/** The weekly top-up that follows from the cheque: a fifth of it. */
export const FARM_WEEKLY = 500;
/** The second deposit in the plan: two fifths of the cheque. */
export const FARM_SECOND = 1000;
/** The hold, in days: 12 weeks for every protocol. */
export const FARM_HOLD_DAYS = 84;

/** The gas price of one transaction on a protocol's first chain, in dollars. */
export function gasFor(p: SnapshotProtocol): number {
  if (p.chains.length === 0) return FARM.gas_other;
  const first = p.chains[0]!;
  if (first === 'Ethereum') return FARM.gas_ethereum;
  if (L2_CHAINS.has(first)) return FARM.gas_l2;
  return FARM.gas_other;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/**
 * One category's farm template: the core action, the second qualifying action, the weekly cadence
 * and the risk to watch, each in the words a farmer can follow. The table is matched on the
 * protocol's category, never on its name.
 */
interface FarmTemplate {
  test: (category: string) => boolean;
  core: (name: string, capital: number, chain: string) => string;
  second: (name: string, amount: number, chain: string) => string;
  cadence: (name: string, amount: number, chain: string) => string;
  risk: (name: string, chain: string) => string;
}

const FARM_TEMPLATES: FarmTemplate[] = [
  {
    test: (c) => /risk curator|curator|allocator/.test(c),
    core: (n, k, ch) => `Put $${k} into a ${n} vault on ${ch} and hold the vault shares.`,
    second: (n, a, ch) => `Put another $${a} into a different ${n} vault on ${ch} running another strategy, so the position is spread across two vaults.`,
    cadence: (n, a, ch) => `Add $${a} to one of the ${n} vaults each week and write down which strategy it follows.`,
    risk: (n, ch) => `Vault strategies can lose money and a curator's earlier returns do not repeat: look at what the vault holds on ${ch} before adding more.`,
  },
  {
    test: (c) => /uncollateralized lending|lend|cdp|collateral/.test(c),
    core: (n, k, ch) => `Lend $${k} of USDC on ${n} on ${ch} and leave the lending position open.`,
    second: (n, a, ch) => `Borrow $${a} against that lending position on ${n} and keep the borrowed funds in the same wallet, so both sides of the position show.`,
    cadence: (n, a, ch) => `Pay back $${a} of the loan and lend it out again on ${n} each week, keeping the health factor above 2.`,
    risk: (n, ch) => `A loan can be liquidated when collateral falls: keep the health factor above 2 and never borrow against a volatile asset on ${ch}.`,
  },
  {
    test: (c) => /liquid staking|restak|staking/.test(c),
    core: (n, k, ch) => `Stake $${k} of the chain's staking asset through ${n} on ${ch} and hold the receipt token.`,
    second: (n, a, ch) => `Restake $${a} of that receipt through ${n} so the position compounds instead of sitting idle.`,
    cadence: (n, a, ch) => `Claim the staking rewards weekly and restake $${a} of them through ${n}.`,
    risk: (n, ch) => `Staking locks funds and slashing can cut them: check ${n}'s unstaking window on ${ch} before committing.`,
  },
  {
    test: (c) => /dex|leveraged farm|liquidity manager/.test(c),
    core: (n, k, ch) => `Add $${k} of liquidity to ${n}'s main pool on ${ch} and leave the position open.`,
    second: (n, a, ch) => `Swap $${a} through ${n} on ${ch} in that same pool, so the wallet shows both providing and trading.`,
    cadence: (n, a, ch) => `Swap $${a} through ${n}'s main pool each week, switching direction.`,
    risk: (n, ch) => `Impermanent loss: if one side of the pair moves far on ${ch}, the position ends up worth less than holding the assets.`,
  },
  {
    test: (c) => /yield aggregator/.test(c),
    core: (n, k, ch) => `Put $${k} of USDC into ${n}'s top vault on ${ch} and hold the shares.`,
    second: (n, a, ch) => `Move $${a} into a second ${n} strategy on ${ch}, so the position covers two vaults.`,
    cadence: (n, a, ch) => `Collect the vault rewards each week and put $${a} of them back into ${n}.`,
    risk: (n, ch) => `Aggregators stack smart-contract risk: the top vault is not the safest by default, so read what it holds on ${ch} first.`,
  },
  {
    test: (c) => /yield|farm/.test(c),
    core: (n, k, ch) => `Put $${k} of USDC into ${n}'s main farm on ${ch} and leave the position open.`,
    second: (n, a, ch) => `Collect the farm rewards on ${n} and put $${a} of them back in on ${ch}.`,
    cadence: (n, a, ch) => `Collect and re-deposit $${a} of rewards each week on ${n}.`,
    risk: (n, ch) => `Farm rewards fall as more capital arrives: the rate you see on ${ch} today is not the rate you will earn.`,
  },
  {
    test: (c) => /cross chain|bridge/.test(c),
    core: (n, k, ch) => `Bridge $${k} of USDC to ${ch} through ${n} and use the bridged funds in its app.`,
    second: (n, a, ch) => `Bridge $${a} back through ${n}, so the wallet shows traffic in both directions.`,
    cadence: (n, a, ch) => `Bridge $${a} through ${n} each week, switching direction.`,
    risk: (n, ch) => `Bridges carry custody risk while funds are in transit: use small amounts on ${ch} and keep every receipt.`,
  },
  {
    test: (c) => /perpetual|derivative|options/.test(c),
    core: (n, k, ch) => `Post $${k} of USDC as margin on ${n} and open one small hedge on ${ch}.`,
    second: (n, a, ch) => `Close the hedge on ${n} and open a fresh one of $${a}, so the position shows more than one trade.`,
    cadence: (n, a, ch) => `Open and close one small trade of about $${a} on ${n} each week.`,
    risk: (n, ch) => `Leverage liquidates fast on ${ch}: keep positions small, set a stop, and never add to a losing trade.`,
  },
  {
    test: (c) => /prediction/.test(c),
    core: (n, k, ch) => `Fund $${k} and take one market position on ${n} on ${ch}.`,
    second: (n, a, ch) => `Take a second position of $${a} on a different ${n} market, so the wallet shows more than one market.`,
    cadence: (n, a, ch) => `Take one small market position of about $${a} on ${n} each week.`,
    risk: (n, ch) => `Prediction markets can resolve against you: stake only what the position is worth on ${ch}.`,
  },
  {
    test: (c) => /basis trading/.test(c),
    core: (n, k, ch) => `Put $${k} of USDC into ${n}'s basis vault on ${ch} and hold the shares.`,
    second: (n, a, ch) => `Add $${a} to the basis position on ${n}, so the position grows in more than one deposit.`,
    cadence: (n, a, ch) => `Add $${a} to the basis position each week on ${n}.`,
    risk: (n, ch) => `Basis trades lose when funding flips on ${ch}: the vault's return is not guaranteed, and a long flat market pays little.`,
  },
  {
    test: (c) => /stablecoin|stable/.test(c),
    core: (n, k, ch) => `Mint or deposit $${k} of the stable asset through ${n} on ${ch} and hold it.`,
    second: (n, a, ch) => `Redeem $${a} of the stable asset on ${n} and mint it again, so the wallet shows both directions.`,
    cadence: (n, a, ch) => `Mint $${a} more of the stable asset through ${n} each week and hold it.`,
    risk: (n, ch) => `A stable asset can depeg: watch the peg and the collateral behind ${n} on ${ch} before adding funds.`,
  },
  {
    test: (c) => /rwa/.test(c),
    core: (n, k, ch) => `Mint $${k} of the protocol's yield asset on ${ch} through ${n} and hold it.`,
    second: (n, a, ch) => `Mint a further $${a} of the yield asset on ${n}, so the holding grows in more than one mint.`,
    cadence: (n, a, ch) => `Add $${a} to the holding each week on ${n}.`,
    risk: (n, ch) => `Real-world backing depends on the issuer: check ${n}'s attestation on ${ch} before adding funds.`,
  },
  {
    test: (c) => /insurance/.test(c),
    core: (n, k, ch) => `Buy $${k} of cover from ${n} on ${ch} and keep the policy.`,
    second: (n, a, ch) => `Add $${a} of cover for a second protocol through ${n}, so the position covers two policies.`,
    cadence: (n, a, ch) => `Renew or extend the cover by $${a} each week on ${n}.`,
    risk: (n, ch) => `Cover pays only on the events it names: read ${n}'s policy on ${ch} before relying on it.`,
  },
  {
    test: (c) => /payment|card/.test(c),
    core: (n, k, ch) => `Load $${k} onto ${n} on ${ch} and pay for one purchase with it.`,
    second: (n, a, ch) => `Make a second purchase of about $${a} through ${n}, so the account shows real spending.`,
    cadence: (n, a, ch) => `Pay for one thing of about $${a} through ${n} each week.`,
    risk: (n, ch) => `Spending accounts are custodial: load only what you plan to spend on ${ch}, and keep the rest in your own wallet.`,
  },
  {
    test: (c) => /privacy/.test(c),
    core: (n, k, ch) => `Put $${k} of USDC into ${n}'s private pool on ${ch} and keep the receipt.`,
    second: (n, a, ch) => `Withdraw $${a} from the pool to a fresh address through ${n}, so the wallet shows both directions.`,
    cadence: (n, a, ch) => `Make one private transfer of about $${a} through ${n} each week.`,
    risk: (n, ch) => `Privacy tools draw scrutiny in some places: know the rules where you live before using ${n} on ${ch}.`,
  },
  {
    test: (c) => /indexes|index/.test(c),
    core: (n, k, ch) => `Buy $${k} of ${n}'s index token on ${ch} and hold it.`,
    second: (n, a, ch) => `Buy $${a} more of the index token on ${n}, so the holding grows in more than one buy.`,
    cadence: (n, a, ch) => `Add $${a} to the index holding each week on ${n}.`,
    risk: (n, ch) => `An index follows its basket: if one holding fails on ${ch}, the index falls with it.`,
  },
  {
    test: (c) => /otc/.test(c),
    core: (n, k, ch) => `Place a $${k} OTC order through ${n} on ${ch} and settle it.`,
    second: (n, a, ch) => `Settle a second OTC order of about $${a} through ${n}.`,
    cadence: (n, a, ch) => `Place one small OTC order of about $${a} through ${n} each week.`,
    risk: (n, ch) => `OTC deals settle off-exchange: use the escrow ${n} offers on ${ch} and never pay outside it.`,
  },
  {
    test: (c) => /governance/.test(c),
    core: (n, k, ch) => `Put $${k} into ${n}'s governance vault on ${ch} and vote on its open proposal.`,
    second: (n, a, ch) => `Vote on a second ${n} proposal with the same deposit, so the wallet shows more than one vote.`,
    cadence: (n, a, ch) => `Vote on one ${n} proposal each week while the deposit is locked.`,
    risk: (n, ch) => `Governance deposits can lock: check ${n}'s unlock window on ${ch} before committing.`,
  },
  {
    test: (c) => /anchor btc|decentralized btc/.test(c),
    core: (n, k, ch) => `Mint $${k} of ${n}'s BTC-backed asset on ${ch} and hold it.`,
    second: (n, a, ch) => `Redeem $${a} of the BTC-backed asset on ${n} and mint it again, so the wallet shows both directions.`,
    cadence: (n, a, ch) => `Mint $${a} more of the BTC-backed asset each week on ${n}.`,
    risk: (n, ch) => `BTC-backed assets depend on the custodian or bridge behind ${n}: verify the backing on ${ch} first.`,
  },
  {
    test: (c) => /^chain$/.test(c),
    core: (n, k, ch) => `Move $${k} of USDC onto ${ch} through ${n} and use its main app.`,
    second: (n, a, ch) => `Use a second app on ${ch} with $${a}, so the wallet shows more than one app on the chain.`,
    cadence: (n, a, ch) => `Make one transaction of about $${a} on ${ch} through ${n} each week.`,
    risk: (n, ch) => `A young chain can halt or change fees: keep most funds off ${ch} until it proves itself.`,
  },
  {
    test: (c) => /cedefi/.test(c),
    core: (n, k, ch) => `Put $${k} of USDC into ${n} on ${ch} and keep the position open.`,
    second: (n, a, ch) => `Open a second position of $${a} on ${n}, so the wallet shows more than one deposit.`,
    cadence: (n, a, ch) => `Add $${a} to the position each week on ${n}.`,
    risk: (n, ch) => `CeDeFi mixes custodial risk with DeFi: keep the position on ${ch} small and withdrawable.`,
  },
];

/** The default template, for a category the table does not name. */
const DEFAULT_TEMPLATE: FarmTemplate = {
  test: () => true,
  core: (n, k, ch) => `Put $${k} of USDC into ${n} on ${ch} and keep the position open.`,
  second: (n, a, ch) => `Add $${a} to the position on ${n}, so the wallet shows more than one deposit.`,
  cadence: (n, a, ch) => `Add $${a} to the position each week on ${n}.`,
  risk: (n, ch) => `Smart contracts can fail: keep the position on ${ch} small enough to lose, and check ${n}'s audits before adding funds.`,
};

/** The farm template for a protocol's category: the first match, else the default. */
function templateFor(category: string | null): FarmTemplate {
  const c = (category ?? '').toLowerCase();
  for (const t of FARM_TEMPLATES) if (t.test(c)) return t;
  return DEFAULT_TEMPLATE;
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL), never from a hand-written list of
 * names: the category picks the template, and every farm uses the same $2,500 cheque held for
 * 12 weeks, so the steps and the economics below agree on the money at stake.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  void age;
  const chain = chainOf(p);
  const capital = FARM_DEPOSIT;
  const weekly = FARM_WEEKLY;
  const secondAmount = FARM_SECOND;
  const hold = FARM_HOLD_DAYS;
  const t = templateFor(p.category);
  const gas = gasFor(p);
  return [
    {
      text: `Open a fresh wallet that holds only the funds you plan to farm, fund it with $${capital} of USDC on ${chain}, and keep its seed phrase offline.`,
      cost: `about $${gas} of gas to fund it`,
      time: '10 minutes to set up',
    },
    {
      text: t.core(p.name, capital, chain),
      cost: `$${capital} of capital and about $${gas} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: t.second(p.name, secondAmount, chain),
      cost: `$${secondAmount} of capital and about $2 of gas`,
      time: '10 minutes',
    },
    {
      text: t.cadence(p.name, weekly, chain),
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open ${p.name}'s own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `${t.risk(p.name, chain)} Keep a farm log of the wallet, the dates and every transaction, so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

export interface FarmEconomics {
  verdict: 'FARM' | 'MARGINAL' | 'SKIP';
  take_usd: number;
  expected_take_usd: number;
  net_cash_usd: number;
  per_hour_usd: number;
  breakeven_deposit_usd: number;
  min_drop_share: number;
  exit_tvl_usd: number;
  gas_usd: number;
  capital_usd: number;
  hold_days: number;
  hours_total: number;
  tbill_cost_usd: number;
  n_txn: number;
  deposit_usd: number;
  drop_share: number;
  horizon_days: number;
}

/**
 * The farm's economics, on a concrete cheque. One wallet deposits $2,500 for 12 weeks; the
 * modelled drop is its pro-rata share of the launch value — (deposit / TVL) x a 10% drop
 * share to depositors x the fitted value at the P25 end of the band, if the token launches.
 * The net is that drop minus gas and the T-bill return on the $2,500 over the 12 weeks. The
 * break-even cheque is the smallest deposit that covers its own costs; the minimum drop
 * share is the share above which the fees are covered at the base deposit. The expected
 * take is the modelled drop times the token odds, shown beside the drop so the verdict's
 * basis is visible: the verdict is costed on the drop if it launches, at the low end of
 * the band, and the odds-adjusted figure is never hidden.
 */
export function farmEconomics(
  p: SnapshotProtocol,
  fittedP25Usd: number,
  tokenOdds: number,
  deposit: number,
  dropShare: number,
  horizonDays: number,
): FarmEconomics {
  const hold = horizonDays;
  const weeks = Math.floor(hold / 7);
  const nTxn = 7 + weeks;
  const gas = gasFor(p);
  const gasTotal = nTxn * gas;
  const tbillCost = deposit * FARM.tbill_annual * (hold / 365);
  const hours = (45 + 10 * weeks + 5) / 60;
  const take = (deposit / p.tvl_usd) * dropShare * fittedP25Usd;
  const expectedTake = take * tokenOdds;
  const net = take - gasTotal - tbillCost;
  const perHour = net / hours;
  const tbillRate = FARM.tbill_annual * (hold / 365);
  const denom = (dropShare * fittedP25Usd) / p.tvl_usd - tbillRate;
  const breakevenDeposit = denom > 0 ? gasTotal / denom : Number.POSITIVE_INFINITY;
  const minDropShare = (deposit / p.tvl_usd) * fittedP25Usd > 0
    ? (gasTotal + tbillCost) / ((deposit / p.tvl_usd) * fittedP25Usd)
    : Number.POSITIVE_INFINITY;
  const verdict = net > 0 && perHour >= FARM.farm_per_hour ? 'FARM' : net > 0 ? 'MARGINAL' : 'SKIP';
  return {
    verdict,
    take_usd: Math.round(take * 100) / 100,
    expected_take_usd: Math.round(expectedTake * 100) / 100,
    net_cash_usd: Math.round(net * 100) / 100,
    per_hour_usd: Math.round(perHour * 100) / 100,
    breakeven_deposit_usd: breakevenDeposit,
    min_drop_share: minDropShare,
    exit_tvl_usd: Math.round(p.tvl_usd * 0.8),
    gas_usd: Math.round(gasTotal * 100) / 100,
    capital_usd: deposit,
    hold_days: hold,
    hours_total: Math.round(hours * 100) / 100,
    tbill_cost_usd: Math.round(tbillCost * 100) / 100,
    n_txn: nTxn,
    deposit_usd: deposit,
    drop_share: dropShare,
    horizon_days: horizonDays,
  };
}

// ---------------------------------------------------------------- the bootstrap rank ranges
//
// The value model is refit on 200 resamples of its training rows, drawn with replacement by a
// fixed-seed linear congruential generator (Numerical Recipes: state = 1664525 x state +
// 1013904223 mod 2^32). The token odds stay fixed — the bootstrap measures the value model's
// stability, not the odds'. Each row's rank range is the P10–P90 of its ranks across the refits.
// The generator is bit-identical in Python and in TypeScript, so the analysis and the program
// agree on the ranges; the dashboard shows them beside every rank.

/** A fixed-seed generator: the same sequence on every run, in any language that does 32-bit math. */
export function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Each ranked row's rank range across the bootstrap refits. */
export function bootstrapRankRanges(
  trainRows: SnapshotProtocol[],
  ranked: SnapshotProtocol[],
  oddsBySlug: Map<string, number>,
): Map<string, { p10: number; p90: number }> {
  const rand = lcg(BOOT_SEED);
  const n = trainRows.length;
  const samples = new Map<string, number[]>();
  for (const p of ranked) samples.set(p.slug, []);
  for (let b = 0; b < BOOT_N; b++) {
    const boot: SnapshotProtocol[] = [];
    for (let i = 0; i < n; i++) boot.push(trainRows[Math.floor(rand() * n)]!);
    const fit = fitValue(boot);
    const implied = ranked.map((p) => Math.exp(predictLog(p, fit)) * fit.smearing * (oddsBySlug.get(p.slug) ?? 0));
    const order = ranked
      .map((p, i) => ({ slug: p.slug, implied: implied[i]! }))
      .sort((a, b) => b.implied - a.implied || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
    order.forEach((entry, pos) => samples.get(entry.slug)!.push(pos + 1));
  }
  const out = new Map<string, { p10: number; p90: number }>();
  for (const [slug, ranks] of samples) {
    const sorted = [...ranks].sort((a, b) => a - b);
    out.set(slug, {
      p10: sorted[Math.floor(0.1 * (BOOT_N - 1))]!,
      p90: sorted[Math.floor(0.9 * (BOOT_N - 1))]!,
    });
  }
  return out;
}

// ---------------------------------------------------------------- the board

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const { model, fit, effects } = fitValueModel(snapshot);
  const rates = categoryTokenRates(snapshot);
  const medians = oddsMedians(snapshot);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but the
  // board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other pre-token protocol the house rule keeps, at any size. No floor: the
  // floor is where the house's reading started, not where this radar stops.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }
  const ranked = [...chosen.values()];

  // The odds are computed once per protocol and fixed for the bootstrap.
  const oddsBySlug = new Map<string, number>();
  for (const p of ranked) oddsBySlug.set(p.slug, tokenOdds(p, snapshot, rates, medians));
  const ranges = bootstrapRankRanges(trainingSet(snapshot).rows, ranked, oddsBySlug);

  const scored = ranked.map((p) => {
    const age = ageDays(snapshot.as_of, p.listed_at);
    const predLog = predictLog(p, fit);
    const fitted = Math.exp(predLog) * fit.smearing;
    const fittedP25 = Math.exp(predLog + model.loo_q25) * fit.smearing;
    const odds = oddsBySlug.get(p.slug)!;
    const implied = Math.max(1, Math.round(fitted * odds));
    const p25 = Math.max(1, Math.round(Math.exp(predLog + model.loo_q25) * fit.smearing * odds));
    const p75 = Math.max(1, Math.round(Math.exp(predLog + model.loo_q75) * fit.smearing * odds));
    const eff = fit.effects.get(p.category ?? '');
    const econ = farmEconomics(p, fittedP25, odds, FARM.deposit_usd, FARM.drop_share, FARM.horizon_days);
    const range = ranges.get(p.slug)!;
    return { p, age, predLog, fitted, fittedP25, odds, implied, p25, p75, eff, econ, range };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));

  const board: BoardRow[] = scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    p25_usd: s.p25,
    p75_usd: s.p75,
    token_odds: s.odds,
    fitted_value_usd: Math.round(s.fitted),
    rank_p10: s.range.p10,
    rank_p90: s.range.p90,
    watchlist_gap: !snapshot.watchlist.includes(s.p.slug) && s.p.tvl_usd >= snapshot.floor_usd,
    model: {
      fitted_value_usd: Math.round(s.fitted),
      token_odds: s.odds,
      cat_effect: s.eff?.effect ?? 0,
      cat_n: s.eff?.n ?? 0,
      cat_token_rate: rates.get(s.p.category ?? '') ?? 0.5,
      pred_log: s.predLog,
      p25_usd: s.p25,
      p75_usd: s.p75,
      fitted_p25_usd: Math.round(s.fittedP25),
      multiple: s.fitted / s.p.tvl_usd,
    },
    farm: {
      verdict: s.econ.verdict,
      take_usd: s.econ.take_usd,
      expected_take_usd: s.econ.expected_take_usd,
      net_cash_usd: s.econ.net_cash_usd,
      per_hour_usd: s.econ.per_hour_usd,
      breakeven_deposit_usd: s.econ.breakeven_deposit_usd,
      min_drop_share: s.econ.min_drop_share,
      exit_tvl_usd: s.econ.exit_tvl_usd,
      gas_usd: s.econ.gas_usd,
      gas_per_txn_usd: gasFor(s.p),
      n_txn: s.econ.n_txn,
      capital_usd: s.econ.capital_usd,
      hold_days: s.econ.hold_days,
      hours_total: s.econ.hours_total,
      tbill_cost_usd: s.econ.tbill_cost_usd,
      deposit_usd: s.econ.deposit_usd,
      drop_share: s.econ.drop_share,
      horizon_days: s.econ.horizon_days,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));

  const live = liveRows(snapshot);
  const totalImplied = board.reduce((s, r) => s + r.implied_value_usd, 0);
  const canonical = board.map((r) => `${r.rank}:${r.slug}:${r.implied_value_usd}`).join('\n');
  const tokenBearing = snapshot.protocols.filter((p) => p.symbol !== null).length;
  const preToken = snapshot.protocols.filter(isPreToken);
  const excludedList = preToken.filter((p) => !isRankable(p));
  const primary = (p: SnapshotProtocol): string => {
    const reasons = exclusionReasons(p);
    return reasons[0] ?? 'none';
  };
  const ledger: Ledger = {
    total: snapshot.protocols.length,
    ranked: board.length,
    token_bearing: tokenBearing,
    excluded: excludedList.length,
    watchlist: snapshot.watchlist.length,
    below_floor: board.filter((r) => r.tvl_usd < snapshot.floor_usd).length,
    above_floor_not_watchlist: board.filter((r) => r.watchlist_gap).map((r) => r.slug),
    excluded_version: excludedList.filter((p) => primary(p) === 'version_marker').length,
    excluded_category: excludedList.filter((p) => primary(p) === 'excluded_category').length,
    excluded_word: excludedList.filter((p) => primary(p) === 'wrapped_staked_word').length,
    excluded_category_breakdown: excludedList
      .filter((p) => primary(p) === 'excluded_category')
      .reduce((acc: { [category: string]: number }, p) => {
        const c = p.category ?? 'Other';
        acc[c] = (acc[c] ?? 0) + 1;
        return acc;
      }, {}),
    total_implied_usd: totalImplied,
    checksum: fnv1a(canonical),
  };
  const verdicts = {
    farm: board.filter((r) => r.farm.verdict === 'FARM').length,
    marginal: board.filter((r) => r.farm.verdict === 'MARGINAL').length,
    skip: board.filter((r) => r.farm.verdict === 'SKIP').length,
  };
  const oddsModel: OddsModel = {
    ...ODDS,
    median_age_days: medians.medianAge,
    median_change_7d: medians.medianChange,
  };
  const beDeposits = board
    .map((r) => r.farm.breakeven_deposit_usd)
    .filter((d) => Number.isFinite(d))
    .sort((a, b) => a - b);
  const bestRow = board.reduce((best, r) => (r.farm.per_hour_usd > best.farm.per_hour_usd ? r : best), board[0]!);
  const farmModel: FarmModel = {
    ...FARM,
    verdicts,
    smallest_breakeven_deposit: beDeposits.length > 0 ? Math.round(beDeposits[0]!) : 0,
    median_breakeven_deposit: beDeposits.length > 0 ? Math.round(median(beDeposits) ?? 0) : 0,
    best_per_hour_usd: bestRow.farm.per_hour_usd,
    best_per_hour_slug: bestRow.slug,
  };
  // The training comps, with the model's fitted value each: the scatter plot's grey dots
  // and the nearest-peers table's source. Fitted values are in-sample, as the label says.
  const trainRows = trainingSet(snapshot, 5).rows;
  const comps: CompRow[] = trainRows.map((p) => ({
    slug: p.slug,
    name: p.name,
    category: p.category,
    tvl_usd: p.tvl_usd,
    mcap_usd: p.mcap_usd!,
    fitted_value_usd: Math.round(Math.exp(predictLog(p, fit)) * fit.smearing),
    ratio: p.mcap_usd! / p.tvl_usd,
  }));
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    value: model,
    odds: oddsModel,
    farm: farmModel,
    ledger,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: board.filter((r) => !snapshot.watchlist.includes(r.slug)).length,
    live_size: live.length,
    effects,
    rows: board.map(radarRow),
    live,
    comps,
  };
  return { board, radar };
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with its value breakdown and farm plan. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    p25_usd: row.p25_usd,
    p75_usd: row.p75_usd,
    token_odds: row.token_odds,
    fitted_value_usd: row.fitted_value_usd,
    cat_effect: row.model.cat_effect,
    cat_n: row.model.cat_n,
    cat_token_rate: row.model.cat_token_rate,
    rank_p10: row.rank_p10,
    rank_p90: row.rank_p90,
    watchlist_gap: row.watchlist_gap,
    verdict: row.farm.verdict,
    take_usd: row.farm.take_usd,
    expected_take_usd: row.farm.expected_take_usd,
    net_cash_usd: row.farm.net_cash_usd,
    per_hour_usd: row.farm.per_hour_usd,
    breakeven_deposit_usd: row.farm.breakeven_deposit_usd,
    min_drop_share: row.farm.min_drop_share,
    exit_tvl_usd: row.farm.exit_tvl_usd,
    fitted_p25_usd: row.model.fitted_p25_usd,
    multiple: row.model.multiple,
    gas_usd: row.farm.gas_usd,
    gas_per_txn_usd: row.farm.gas_per_txn_usd,
    n_txn: row.farm.n_txn,
    hold_days: row.farm.hold_days,
    capital_usd: row.farm.capital_usd,
    hours_total: row.farm.hours_total,
    tbill_cost_usd: row.farm.tbill_cost_usd,
    deposit_usd: row.farm.deposit_usd,
    drop_share: row.farm.drop_share,
    horizon_days: row.farm.horizon_days,
    farm_steps: row.farm_steps,
  };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
