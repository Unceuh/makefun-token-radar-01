# makefun-token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Unceuh/makefun-token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Unceuh/makefun-token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it reads a sealed snapshot of every protocol DefiLlama tracks, works out which ones still record no token and are not a wrapped or staked product of one that trades, and ranks them by what their launch would be worth — then hands in a web dashboard with the board, a detail view for each protocol, and the steps to farm it.

## The model

The implied value of a launch is priced from the market in the snapshot itself, not from a fixed multiple: for each category, the median market-cap/TVL ratio of the same-category protocols that already have a token (shrunk toward the global median, clamped to 0.02–1.0), applied to the pre-token protocol's TVL, then adjusted for 7-day TVL growth, chain diversification, and maturity from the date DefiLlama began tracking it. Every board row carries the full breakdown, so the dashboard can show exactly why a protocol is worth what it is.

The board covers all 40 watchlist protocols plus every other rankable pre-token protocol below the floor: 226 rows in total.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

`main.ts` is Node 22, standard library only. It writes `out/board.json` (the ranked board), `out/data.js` (the dashboard's data), copies `dashboard/` and `screenshots/` to `out/`, and writes `out/dossier.json` with `buildDossier` from `vendor/makefun-board.ts`.

## Top of the board

1. steakhouse-financial — $2,179,885,001
2. gauntlet — $1,298,286,631
3. nonce-capital — $285,255,767
4. veda — $205,210,574
5. rockawayx — $198,335,352

The dashboard (`dashboard/`, a static page with no network) shows the board with search, category and chain filters, a watchlist-only toggle, sorting per column, a detail view for every protocol with its value breakdown and farm plan, and the methodology with the per-category comps table.
