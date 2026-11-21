# makefun-token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Unceuh/makefun-token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Unceuh/makefun-token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it reads a sealed snapshot of every protocol DefiLlama tracks, works out which ones still record no token and pass the house rule, and ranks them by what their launch would be worth — then hands in a web dashboard with the board, a detail view for each protocol, and the costed steps to farm it.

## The model

Implied value is a fitted model, not a fixed multiple:

```
implied = fitted value x token odds
fitted  = exp(6.6272 + 0.5228 x log(TVL) + category effect) x 2.2095
```

The fitted value comes from an ordinary least-squares regression of log market cap on log TVL, plus a shrunk effect for the protocol's category, fit on 112 live-token protocols from the snapshot itself — every comp whose token is worth more than 5x its TVL is out by rule (aave-v2 19.0x, anvil 12.2x, bitway-earn 36.2x, flokifi-locker 19.0x, flying-tulip-lend 5.1x, mantle-bridge 14.5x, plus rain 400.2x). Token odds come from a logistic regression on all 758 protocols: the chance a protocol launches a token, from its TVL, age, chain count, 7-day growth and its category's token rate. The dashboard recomputes every row from the same coefficients and says how many match (198 of 198).

The model is shown its weakness, not just its strength: leave-one-out RMSE 1.80 log-points, walk-forward RMSE 1.58, median multiple miss ×2.96 leave-one-out and ×2.43 walk-forward (a flat median multiple misses by ×4.90 and ×4.72), P25–P75 coverage 50% leave-one-out and 57% walk-forward, token odds Brier 0.184 against a 0.248 baseline. The P25–P75 band is ×8.8 across — that is what an R² of 0.19 honestly buys. Terms were tried by leave-one-out and walk-forward and only the category effect was kept; age, chain count and 7-day growth were tested and left out of the price (they enter through the odds instead).

The board covers all 40 watchlist protocols plus every other rankable pre-token protocol: 198 rows in total. All 758 protocols are accounted for: 198 ranked, 416 already have a token, 144 excluded by the house rule. Twenty rows above the floor pass every snapshot-visible rule but are not on the watchlist; they are ranked and flagged, not dropped.

## Farming, costed

Each row carries a farm verdict under a base case: one wallet deposits $2,500 for 12 weeks, and the modelled drop is its pro-rata share of the launch value — (deposit / TVL) × a 10% drop share to depositors × the fitted value at the P25 end of the band, if the token launches — minus gas per transaction ($2 on Ethereum, $0.50 on an L2, $1 elsewhere) and the T-bill cost of the $2,500 over the 12 weeks. FARM means the net clears costs and $25 an hour; MARGINAL clears costs but not $25 an hour; SKIP does not clear costs. Base case: 16 FARM, 78 MARGINAL, 104 SKIP; best net per hour $32.58. The dashboard lets the reader change the deposit, the drop share and the horizon and see the verdicts move.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

`main.ts` is Node 22, standard library only. It writes `out/board.json` (the ranked board), `out/data.js` (the dashboard's data), copies `dashboard/` and `screenshots/` to `out/`, and writes `out/dossier.json` with `buildDossier` from `vendor/makefun-board.ts`. `gate.mjs <out-dir> <snapshot.json>` replays the submission gates locally (dashboard files, board rows, sort order, coverage, farm steps, screenshots, dossier match, recompute).

## Top of the board

1. usdd — $46,227,385
2. bitfi-basis — $41,520,619
3. bittensor-dtao — $38,582,437
4. defi-saver-asset-management — $35,573,855
5. opentrade — $33,190,369

The dashboard (`dashboard/`, a static page with no network) shows the board with search, category, chain and farm-verdict filters, a watchlist-only toggle, sorting per column, scenario controls (deposit, drop share, horizon), CSV/JSON export, a full detail page for every protocol with its model breakdown in dollars, nearest priced peers, costed farm verdict with T-bill benchmark, exit rule and net-by-share table, and the methodology (`dashboard/methodology.md`) with the term table, the 5x cap disclosure, the validation numbers and the full 758-protocol ledger.
