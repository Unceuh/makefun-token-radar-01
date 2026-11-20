# makefun-token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Unceuh/makefun-token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Unceuh/makefun-token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it reads a sealed snapshot of every protocol DefiLlama tracks, works out which ones still record no token and pass the house rule, and ranks them by what their launch would be worth — then hands in a web dashboard with the board, a detail view for each protocol, and the costed steps to farm it.

## The model

Implied value is a fitted model, not a fixed multiple:

```
implied = fitted value x token odds
fitted  = exp(7.1737 + 0.5040 x log(TVL) + category effect) x 5.1201
```

The fitted value comes from an ordinary least-squares regression of log market cap on log TVL, plus a shrunk effect for the protocol's category, fit on 118 live-token protocols from the snapshot itself (one comp excluded: `rain`, whose mcap/TVL is 400x). Token odds come from a logistic regression on all 758 protocols: the chance a protocol launches a token, from its TVL, age, chain count, 7-day growth and its category's token rate. The dashboard recomputes every row from the same coefficients and says how many match (198 of 198).

The model is shown its weakness, not just its strength: leave-one-out RMSE 2.00 log-points, walk-forward RMSE 1.85, P25–P75 coverage 49% leave-one-out and 57% walk-forward (stated 50%), token odds Brier 0.184 against a 0.248 baseline. The P25–P75 band is about 11x across — that is what an R² of 0.15 honestly buys. Terms were tried by leave-one-out and only the category effect helped (by 0.1%); age, chain count and 7-day growth were tested and left out.

The board covers all 40 watchlist protocols plus every other rankable pre-token protocol: 198 rows in total. All 758 protocols are accounted for: 198 ranked, 416 already have a token, 144 excluded by the house rule. Twenty rows above the floor pass every snapshot-visible rule but are not on the watchlist; they are ranked and flagged, not dropped.

## Farming, costed

Each row carries a farm verdict under a base case: you take 0.001% of the launch value (netted at the low end of the band, P25), pay gas per transaction ($2 on Ethereum, $0.50 on an L2, $1 elsewhere), and the T-bill cost of the capital for the hold. FARM means the net clears costs and $25 an hour; MARGINAL clears costs but not $25 an hour; SKIP does not clear costs. Base case: 83 FARM, 72 MARGINAL, 43 SKIP. The dashboard lets the reader change the plan size, the wallet share and the horizon and see the verdicts move.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

`main.ts` is Node 22, standard library only. It writes `out/board.json` (the ranked board), `out/data.js` (the dashboard's data), copies `dashboard/` and `screenshots/` to `out/`, and writes `out/dossier.json` with `buildDossier` from `vendor/makefun-board.ts`. `gate.mjs <out-dir> <snapshot.json>` replays the submission gates locally (dashboard files, board rows, sort order, coverage, farm steps, screenshots, dossier match, recompute).

## Top of the board

1. usdd — $115,503,290
2. bitfi-basis — $108,983,940
3. defi-saver-asset-management — $98,717,480
4. bittensor-dtao — $91,629,533
5. opentrade — $79,702,799

The dashboard (`dashboard/`, a static page with no network) shows the board with search, category, chain and farm-verdict filters, a watchlist-only toggle, sorting per column, scenario controls (plan size, wallet share, horizon), CSV/JSON export, a detail view for every protocol with its model breakdown and costed farm verdict, and the methodology (`dashboard/methodology.md`) with the term table, the validation numbers and the full 758-protocol ledger.
