// The token radar's model (radar-2): one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and every
// other rankable pre-token protocol below the watchlist floor: the early rows the radar exists to
// find. A protocol is pre-token when its index entry records no token (no market cap, no CoinGecko
// id, no symbol); the snapshot's live-token protocols are kept apart and shown as the market's own
// values, never mixed into the ranked board. Say a protocol records no token, never that it has
// none: the snapshot is DefiLlama's record, not proof.
//
// Implied value is priced off the market, not off a fixed multiple: for each category, the model
// takes the live-token protocols in that category that already trade, and reads the median of
// their market-cap / TVL ratios. That median is the category's comp multiple, shrunk toward the
// global median when the category has few comps, and capped so one thin category cannot price a
// protocol above its own TVL. The multiple is then applied to the pre-token protocol's TVL and
// adjusted for its seven-day growth, how many chains it runs on, and how long it has run with no
// token:
//
//   comp     = clamp( w x median_cat + (1 - w) x median_global, 0.02, 1.0 ), w = n / (n + 3)
//   base     = tvl_usd x comp
//   growth   = clamp(change_7d, -60, 120) per cent
//   growthMult = 1 + (growth / 100) x 0.5
//   chainMult  = 1 + 0.02 x min(chains - 1, 4)          (0 when the chain list is empty)
//   maturity = 0.6 + min(age_days, 1095) / 1095 x 0.4   (age_days unknown: 365)
//   implied  = max(1, round(base x growthMult x chainMult x maturity))
//
// Every row carries the breakdown, so the dashboard can show why the number is what it is. No
// protocol name is ever special-cased: the same function scores every row.

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

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  /** Shrinkage: a category with n comps leans on its own median with weight n / (n + shrink_n). */
  shrink_n: number;
  /** The comp multiple never prices a token above its TVL, nor below 2% of it. */
  comp_cap: number;
  comp_floor: number;
  /** +2% of implied value per extra chain, up to +8%. */
  chain_step: number;
  chain_max: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  shrink_n: 3,
  comp_cap: 1,
  comp_floor: 0.02,
  chain_step: 0.02,
  chain_max: 0.08,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-2';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** One category's comps: the live-token protocols in it that already trade. */
export interface CompStat {
  category: string | null;
  /** Live-token protocols in the category with a market cap and a TVL. */
  n: number;
  /** Their median market-cap / TVL, or null when the category has no comp at all. */
  median: number | null;
  /** The multiple the model applies: the median shrunk toward the global median, clamped. */
  multiple: number;
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
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
  model: {
    comp_category: string | null;
    comp_n: number;
    comp_median: number | null;
    comp_multiple: number;
    base_value_usd: number;
    growth_pct: number;
    growth_multiplier: number;
    chain_count: number;
    chain_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
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
  comp_category: string | null;
  comp_n: number;
  comp_median: number | null;
  comp_multiple: number;
  base_value_usd: number;
  growth_pct: number;
  growth_multiplier: number;
  chain_count: number;
  chain_multiplier: number;
  maturity_multiplier: number;
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

/** Everything the dashboard needs: the board, the live set, the comps and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  /** The global median market-cap / TVL the thin categories fall back to. */
  global_multiple: number;
  /** One comp row per category that appears on the board, plus the global fallback. */
  comps: CompStat[];
  rows: RadarRow[];
  live: LiveRow[];
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
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The comps the model prices off: the live-token protocols' market-cap / TVL, by category. */
export function compStats(snapshot: Snapshot, model: ModelConstants): { globalMedian: number; byCategory: Map<string, CompStat> } {
  const ratiosByCategory = new Map<string, number[]>();
  const allRatios: number[] = [];
  for (const p of snapshot.protocols) {
    // A live-token protocol that already trades, with a market cap and a TVL to ratio. Exchange
    // tokens are left out: an exchange's market cap is not a protocol's token value.
    if (isPreToken(p) || p.category === 'CEX') continue;
    if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    if (!Number.isFinite(ratio) || ratio <= 0) continue;
    allRatios.push(ratio);
    const key = p.category ?? '';
    const list = ratiosByCategory.get(key);
    if (list === undefined) ratiosByCategory.set(key, [ratio]);
    else list.push(ratio);
  }
  // The snapshot always carries live comps; the fallback only guards a degenerate input.
  const globalMedian = median(allRatios) ?? 0.25;
  const byCategory = new Map<string, CompStat>();
  for (const [key, ratios] of ratiosByCategory) {
    const catMedian = median(ratios)!;
    const n = ratios.length;
    const w = n / (n + model.shrink_n);
    const multiple = Math.min(model.comp_cap, Math.max(model.comp_floor, w * catMedian + (1 - w) * globalMedian));
    byCategory.set(key, { category: key === '' ? null : key, n, median: round4(catMedian), multiple: round4(multiple) });
  }
  return { globalMedian, byCategory };
}

/** The comp multiple one category gets: its own shrunk median, or the global median when it has no comps. */
export function compFor(category: string | null, comps: { globalMedian: number; byCategory: Map<string, CompStat> }, model: ModelConstants): CompStat {
  const found = comps.byCategory.get(category ?? '');
  if (found !== undefined) return found;
  const multiple = Math.min(model.comp_cap, Math.max(model.comp_floor, comps.globalMedian));
  return { category, n: 0, median: null, multiple: round4(multiple) };
}

/** The multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  comps: { globalMedian: number; byCategory: Map<string, CompStat> },
): {
  implied: number;
  comp: CompStat;
  base: number;
  growthPct: number;
  growthMult: number;
  chainCount: number;
  chainMult: number;
  maturityMult: number;
  age: number | null;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const comp = compFor(protocol.category, comps, model);
  const base = protocol.tvl_usd * comp.multiple;
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const chainCount = protocol.chains.length;
  const chainMult = 1 + Math.min(model.chain_max, model.chain_step * Math.max(0, chainCount - 1));
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const implied = Math.max(1, Math.round(base * growthMult * chainMult * maturityMult));
  return { implied, comp, base: Math.round(base), growthPct, growthMult, chainCount, chainMult, maturityMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The headline sentence's figures: how many watchlist slugs, how many rows, how many live protocols. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const comps = compStats(snapshot, model);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but the
  // board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other rankable pre-token protocol below the watchlist floor. No cap: the
  // floor is where the house's reading started, not where this radar stops.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd) chosen.set(p.slug, p);
  }

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, model, comps);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
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
    model: {
      comp_category: s.p.category,
      comp_n: s.comp.n,
      comp_median: s.comp.median,
      comp_multiple: s.comp.multiple,
      base_value_usd: s.base,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      chain_count: s.chainCount,
      chain_multiplier: round4(s.chainMult),
      maturity_multiplier: round4(s.maturityMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** The weekly amount that follows from the capital: a fifth of it, at least $10. */
function weeklyFor(capital: number): number {
  return Math.max(10, Math.round(capital / 5));
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
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
    core: (n, k, ch) => `Deposit $${k} into a ${n} vault on ${ch} and keep the vault shares.`,
    second: (n, a, ch) => `Deposit a further $${a} into a second ${n} vault on ${ch} with a different strategy, so the position is not one vault alone.`,
    cadence: (n, a, ch) => `Top up one of the ${n} vaults by $${a} each week and note which strategy it follows.`,
    risk: (n, ch) => `Vault strategies can lose value and the curator's past returns do not repeat: check the vault's holdings on ${ch} before adding funds.`,
  },
  {
    test: (c) => /uncollateralized lending|lend|cdp|collateral/.test(c),
    core: (n, k, ch) => `Supply $${k} of USDC to ${n} on ${ch} and keep the supply position open.`,
    second: (n, a, ch) => `Borrow $${a} against the supply on ${n} and hold the borrowed funds in the same wallet, so the position shows both sides.`,
    cadence: (n, a, ch) => `Repay $${a} of the borrow and re-supply it to ${n} each week, keeping the health factor above 2.`,
    risk: (n, ch) => `Borrowing can be liquidated if the collateral falls: keep the health factor above 2 and never borrow against a volatile asset on ${ch}.`,
  },
  {
    test: (c) => /liquid staking|restak|staking/.test(c),
    core: (n, k, ch) => `Stake $${k} of the chain's staking asset through ${n} on ${ch} and keep the receipt token.`,
    second: (n, a, ch) => `Restake $${a} of the receipt through ${n} so the position compounds instead of sitting idle.`,
    cadence: (n, a, ch) => `Claim the staking rewards each week and restake $${a} of them through ${n}.`,
    risk: (n, ch) => `Staking locks funds and slashing can cut them: check ${n}'s unstaking window on ${ch} before you commit.`,
  },
  {
    test: (c) => /dex|leveraged farm|liquidity manager/.test(c),
    core: (n, k, ch) => `Provide $${k} of liquidity to ${n}'s main pool on ${ch} and keep the position open.`,
    second: (n, a, ch) => `Swap $${a} through ${n} on ${ch} in the same pool, so the wallet shows both providing and trading.`,
    cadence: (n, a, ch) => `Swap $${a} through ${n}'s main pool each week, alternating the direction.`,
    risk: (n, ch) => `Impermanent loss: if one side of the pair moves far on ${ch}, the position is worth less than holding the assets.`,
  },
  {
    test: (c) => /yield aggregator/.test(c),
    core: (n, k, ch) => `Deposit $${k} of USDC into ${n}'s top vault on ${ch} and keep the shares.`,
    second: (n, a, ch) => `Move $${a} into a second ${n} strategy on ${ch}, so the position spans two vaults.`,
    cadence: (n, a, ch) => `Harvest the vault rewards each week and re-deposit $${a} into ${n}.`,
    risk: (n, ch) => `Aggregators stack smart-contract risk: the top vault is not the safest by default, so read what it holds on ${ch} first.`,
  },
  {
    test: (c) => /yield|farm/.test(c),
    core: (n, k, ch) => `Deposit $${k} of USDC into ${n}'s main farm on ${ch} and keep the position open.`,
    second: (n, a, ch) => `Harvest the farm rewards on ${n} and re-deposit $${a} of them on ${ch}.`,
    cadence: (n, a, ch) => `Harvest and re-deposit $${a} of rewards each week on ${n}.`,
    risk: (n, ch) => `Farm rewards fall as more capital arrives: the rate you see on ${ch} today is not the rate you will earn.`,
  },
  {
    test: (c) => /cross chain|bridge/.test(c),
    core: (n, k, ch) => `Bridge $${k} of USDC to ${ch} through ${n} and use the bridged funds in its app.`,
    second: (n, a, ch) => `Bridge $${a} back through ${n}, so the wallet shows traffic in both directions.`,
    cadence: (n, a, ch) => `Bridge $${a} through ${n} each week, alternating the direction.`,
    risk: (n, ch) => `Bridges hold custody risk while funds are in transit: use small amounts on ${ch} and keep every receipt.`,
  },
  {
    test: (c) => /perpetual|derivative|options/.test(c),
    core: (n, k, ch) => `Deposit $${k} of USDC as margin on ${n} and open one small hedge on ${ch}.`,
    second: (n, a, ch) => `Close the hedge on ${n} and open a fresh one of $${a}, so the position shows more than one trade.`,
    cadence: (n, a, ch) => `Open and close one small trade of about $${a} on ${n} each week.`,
    risk: (n, ch) => `Leverage liquidates fast on ${ch}: keep positions small, set a stop, and never add to a losing trade.`,
  },
  {
    test: (c) => /prediction/.test(c),
    core: (n, k, ch) => `Fund $${k} and place one market position on ${n} on ${ch}.`,
    second: (n, a, ch) => `Place a second position of $${a} on a different ${n} market, so the wallet shows more than one market.`,
    cadence: (n, a, ch) => `Place one small market position of about $${a} on ${n} each week.`,
    risk: (n, ch) => `Prediction markets can resolve against you: stake only what the position is worth on ${ch}.`,
  },
  {
    test: (c) => /basis trading/.test(c),
    core: (n, k, ch) => `Deposit $${k} of USDC into ${n}'s basis vault on ${ch} and keep the shares.`,
    second: (n, a, ch) => `Add $${a} to the basis position on ${n}, so the position grows in more than one deposit.`,
    cadence: (n, a, ch) => `Top up the basis position by $${a} each week on ${n}.`,
    risk: (n, ch) => `Basis trades lose when funding flips on ${ch}: the vault's return is not guaranteed, and a long flat market pays little.`,
  },
  {
    test: (c) => /stablecoin|stable/.test(c),
    core: (n, k, ch) => `Mint or deposit $${k} of the stable asset through ${n} on ${ch} and hold it.`,
    second: (n, a, ch) => `Redeem $${a} of the stable asset on ${n} and re-mint it, so the wallet shows both directions.`,
    cadence: (n, a, ch) => `Mint $${a} more of the stable asset through ${n} each week and hold it.`,
    risk: (n, ch) => `A stable asset can depeg: watch the peg and the collateral behind ${n} on ${ch} before adding funds.`,
  },
  {
    test: (c) => /rwa/.test(c),
    core: (n, k, ch) => `Mint $${k} of the protocol's yield asset on ${ch} through ${n} and hold it.`,
    second: (n, a, ch) => `Mint a further $${a} of the yield asset on ${n}, so the holding grows in more than one mint.`,
    cadence: (n, a, ch) => `Top up the holding by $${a} each week on ${n}.`,
    risk: (n, ch) => `Real-world backing depends on the issuer: check ${n}'s attestation on ${ch} before adding funds.`,
  },
  {
    test: (c) => /insurance/.test(c),
    core: (n, k, ch) => `Buy $${k} of cover from ${n} on ${ch} and keep the policy.`,
    second: (n, a, ch) => `Add $${a} of cover for a second protocol through ${n}, so the position spans two policies.`,
    cadence: (n, a, ch) => `Renew or extend the cover by $${a} each week on ${n}.`,
    risk: (n, ch) => `Cover pays only on the events it names: read ${n}'s policy on ${ch} before you rely on it.`,
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
    core: (n, k, ch) => `Deposit $${k} of USDC into ${n}'s private pool on ${ch} and keep the receipt.`,
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
    core: (n, k, ch) => `Deposit $${k} into ${n}'s governance vault on ${ch} and vote on its open proposal.`,
    second: (n, a, ch) => `Vote on a second ${n} proposal with the same deposit, so the wallet shows more than one vote.`,
    cadence: (n, a, ch) => `Vote on one ${n} proposal each week while the deposit is locked.`,
    risk: (n, ch) => `Governance deposits can lock: check ${n}'s unlock window on ${ch} before you commit.`,
  },
  {
    test: (c) => /anchor btc|decentralized btc/.test(c),
    core: (n, k, ch) => `Mint $${k} of ${n}'s BTC-backed asset on ${ch} and hold it.`,
    second: (n, a, ch) => `Redeem $${a} of the BTC-backed asset on ${n} and re-mint it, so the wallet shows both directions.`,
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
    core: (n, k, ch) => `Deposit $${k} of USDC into ${n} on ${ch} and keep the position open.`,
    second: (n, a, ch) => `Open a second position of $${a} on ${n}, so the wallet shows more than one deposit.`,
    cadence: (n, a, ch) => `Top up the position by $${a} each week on ${n}.`,
    risk: (n, ch) => `CeDeFi mixes custodial risk with DeFi: keep the position on ${ch} small and withdrawable.`,
  },
];

/** The default template, for a category the table does not name. */
const DEFAULT_TEMPLATE: FarmTemplate = {
  test: () => true,
  core: (n, k, ch) => `Deposit $${k} of USDC into ${n} on ${ch} and keep the position open.`,
  second: (n, a, ch) => `Add $${a} to the position on ${n}, so the wallet shows more than one deposit.`,
  cadence: (n, a, ch) => `Top up the position by $${a} each week on ${n}.`,
  risk: (n, ch) => `Smart contracts can fail: keep the position on ${ch} small enough to lose, and check ${n}'s audits before adding funds.`,
};

/** The farm template for a protocol's category: the first match, else the default. */
function templateFor(category: string | null): FarmTemplate {
  const c = (category ?? '').toLowerCase();
  for (const t of FARM_TEMPLATES) if (t.test(c)) return t;
  return DEFAULT_TEMPLATE;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age), never from a hand-written list of
 * names: the category picks the template, the TVL picks the capital, the age picks the hold.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const weekly = weeklyFor(capital);
  const secondAmount = weekly * 2;
  const hold = holdDaysFor(age);
  const t = templateFor(p.category);
  const gas = capital >= 150 ? 8 : 4;
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
    comp_category: row.model.comp_category,
    comp_n: row.model.comp_n,
    comp_median: row.model.comp_median,
    comp_multiple: row.model.comp_multiple,
    base_value_usd: row.model.base_value_usd,
    growth_pct: row.model.growth_pct,
    growth_multiplier: row.model.growth_multiplier,
    chain_count: row.model.chain_count,
    chain_multiplier: row.model.chain_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const comps = compStats(snapshot, model);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const compList: CompStat[] = [...comps.byCategory.values()]
    .sort((a, b) => (a.category ?? '') < (b.category ?? '') ? -1 : (a.category ?? '') > (b.category ?? '') ? 1 : 0);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    global_multiple: round4(Math.min(model.comp_cap, Math.max(model.comp_floor, comps.globalMedian))),
    comps: compList,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
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
