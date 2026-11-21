# Token Radar — methodology

Snapshot: DefiLlama protocol index, `as_of` 2026-11-14, 758 protocols. The watchlist is the
floor: every protocol with at least $50M of TVL and no token on record (40 protocols). The board
ranks 198 pre-token protocols: the 40 watchlist rows, 138 below the floor, and 20 above the floor
that pass every snapshot-visible house rule but are not on the watchlist. They are ranked and
flagged, not dropped, because hiding them would be less honest than showing them.

## Implied value

Implied value is the fitted value times the token odds:

```
implied = fitted value x token odds
fitted  = exp(6.6272 + 0.5228 x log(TVL) + category effect) x 2.2095
```

The fitted value comes from an ordinary least-squares regression of log market cap on log TVL,
plus a shrunk effect for the protocol's category. It is fit on 112 live-token protocols from this
same snapshot. The slope is 0.5228, the intercept 6.6272, and the smearing correction 2.2095
fixes the bias of exponentiating a log prediction. Each category effect is its median residual,
shrunk by n / (n + 5), so thin categories do not swing the board. Nothing in the board is
hand-entered per protocol: the dashboard recomputes every row from the same coefficients.

## The 5x ratio cap — what was excluded, and why

A comp whose token is worth more than 5x its TVL is priced in a different regime from the one
the TVL curve can price, so it is out of the fit, by rule. Six comps:

| Comp | Category | mcap / TVL |
| --- | --- | ---: |
| aave-v2 | Lending | 19.0x |
| anvil | Collateral Management | 12.2x |
| bitway-earn | Basis Trading | 36.2x |
| flokifi-locker | Token Locker | 19.0x |
| flying-tulip-lend | Lending | 5.1x |
| mantle-bridge | Canonical Bridge | 14.5x |

`rain` (Prediction Market, 400.2x) was already excluded at the old 100x cap. The cost is
stated plainly: on the same 118 comps the cap-5 model is no better than the cap-100 model
(LOO RMSE 2.00 vs 2.00, walk-forward 1.58 vs 1.58) — the better headline numbers come from
removing the six hardest rows from the test set, not from a better model. The cap-5 model
scored on all 118 comps: RMSE 1.86, MAE 1.37, R² 0.26, median miss ×2.99; on the six
excluded rows alone its RMSE is 4.22, worse than the cap-100 model's 4.11. The cap is a
statement about which regime the curve prices, not a claim of a better fit.

## Which terms were kept, and which were tested

Terms were tried by leave-one-out (LOO) and walk-forward (WF) — lower is better, and the
median multiple miss (×) is the headline error: the typical factor by which the model misses.

| Terms | LOO RMSE | LOO miss | WF RMSE | WF miss | Result |
| --- | ---: | ---: | ---: | ---: | --- |
| flat median multiple | 1.98 | ×4.90 | 1.84 | ×4.72 | baseline |
| size curve only | 1.80 | ×2.83 | 1.58 | ×2.30 | base |
| + category effect | 1.80 | ×2.96 | 1.58 | ×2.43 | kept |
| + 7-day growth | 1.82 | ×3.07 | 1.64 | ×2.39 | tested, not kept |
| + no-token age | 1.82 | ×2.95 | 3.56 | ×6.74 | tested, not kept |
| + chain count | 1.82 | ×3.07 | 1.59 | ×2.40 | tested, not kept |
| + size squared | 1.82 | ×3.34 | 1.60 | ×2.48 | tested, not kept |
| + growth + age + chains | 1.85 | ×3.14 | 5.18 | ×8.56 | tested, not kept |

The category effect is kept because the house asks for it — on these 112 comps it is neutral
(LOO 1.80 vs 1.80 size-only), not a fit gain. Age destroys walk-forward because the age
distribution shifts across periods. Age and 7-day growth still enter the implied value through
the token odds, where they help (Brier 0.184 vs 0.248 baseline).

## How the model held up out-of-sample

Leave-one-out RMSE 1.80 log-points, MAE 1.40, R² 0.193, median multiple miss ×2.96.
Walk-forward — fit on protocols listed before each date and tested on the next — pooled
RMSE 1.58, MAE 1.25, median miss ×2.43. P25–P75 coverage: 50% leave-one-out and 57%
walk-forward (a 50% band should cover about half). P10–P90: 79% and 80% (stated 80%).
The bands are wide: the P25–P75 band is ×8.8 across, which is what an R² of 0.19 honestly buys.

Token odds come from a logistic regression fit on all 758 protocols in the snapshot:
intercept −9.2598, log TVL 0.1057, log age 0.5185, age missing 0.9354, chain count 0.0318,
7-day growth −0.0240 (clipped to [−60, 120]), category token rate 7.0781. Brier 0.184
against a baseline of 0.248, AUC 0.80 — it beats a coin flip, and it is not a forecast.
Missing ages are imputed with the snapshot median (677 days) and missing 7-day growth with
the snapshot median (−8.23%), with a missing-age flag in the regression.

Rank ranges come from a bootstrap: 200 refits of the value model, each on a resample of the
training set, re-ranking the whole board. The P10–P90 rank range of each row is shown on the
board. The dashboard checks that every row recomputes exactly and prints the ledger checksum.

## Farming — costed, not promised

Each row carries a farm verdict under a base case: one wallet deposits $2,500 for 12 weeks
(84 days). The modelled drop is its pro-rata share of the launch value — (deposit / TVL) ×
a 10% drop share to depositors × the fitted value at the P25 end of the band, if the token
launches. The net is that drop minus gas ($2 on Ethereum, $0.50 on an L2, $1 elsewhere;
19 transactions over the 12 weeks) and the T-bill cost of the $2,500 (4.5% a year, $25.89).
FARM means the net clears costs and $25 an hour; MARGINAL clears costs but not $25 an hour;
SKIP does not clear costs. The expected take — the modelled drop × token odds — is shown
beside the drop on every detail page.

Base case: 16 FARM, 78 MARGINAL, 104 SKIP. Best net per hour $32.58 (alphagrowth).
Smallest break-even cheque $233, median $1,655. The verdict is sensitive to the deposit
and the drop share:

| Drop share | $1,000 | $2,500 | $5,000 | $10,000 |
| --- | ---: | ---: | ---: | ---: |
| 7% | 0 / 26 / 172 | 0 / 66 / 132 | 25 / 63 / 110 | 58 / 44 / 96 |
| 10% | 0 / 50 / 148 | 16 / 78 / 104 | 55 / 66 / 77 | 95 / 46 / 57 |

Each cell is FARM / MARGINAL / SKIP at that deposit and drop share, 12-week horizon.
The gas table is a simplification, not live gas prices, and a 10% drop share is an
assumption about what depositors receive at a launch, not a fact.

## The whole snapshot, accounted for

All 758 protocols sit in exactly one group: 198 ranked, 416 already have a token, 144 excluded
by the house rule. The excluded split by primary reason: 11 versioned names, 128 excluded
categories (42 CEX, 38 Liquid Staking, 28 Bridge, 15 Canonical Bridge, 3 Liquid Restaking, 2
Restaked BTC), 5 wrapped/staked names.

## Limits, stated plainly

The value model explains about 19% of the variance in log market cap, and the P25–P75 band
spans ×8.8. Token odds is a propensity from the snapshot's history, not a forecast. The farm
plans use a gas table, not live gas prices, and a 10% drop share is a guess, not a fact. Twenty
rows pass every snapshot-visible rule but are not on the watchlist; the snapshot does not carry
the field (`parentProtocol`) that most likely excludes them, so they are ranked and flagged
rather than dropped. If a row's recompute ever disagrees with its board number, the board is wrong.
