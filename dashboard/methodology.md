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
fitted  = exp(7.1737 + 0.5040 x log(TVL) + category effect) x 5.1201
```

The fitted value comes from an ordinary least-squares regression of log market cap on log TVL,
plus a shrunk effect for the protocol's category. It is fit on 118 live-token protocols from this
same snapshot. The slope is 0.5040, the intercept 7.1737, and the smearing correction 5.1201
fixes the bias of exponentiating a log prediction. One comp was excluded before fitting: `rain`,
whose mcap/TVL is 400x (the next-highest comp is 36x); it alone set the Prediction Market effect
to +1.08. Nothing in the board is hand-entered per protocol: the dashboard recomputes every row
from the same coefficients, and says how many rows match.

## Which terms were kept, and which were tested

Terms were tried by leave-one-out cross-validation (LOO RMSE, log-points, lower is better). A
term was kept only when it improved the score.

| Terms | LOO RMSE | Result |
| --- | --- | --- |
| log(TVL) only | 2.002 | base |
| + category | 1.9996 | kept — the only term that helped |
| + 7-day growth | 2.0125 | tested, not kept |
| + chain count | 2.0135 | tested, not kept |
| + age | 2.0384 | tested, not kept |
| category, then + chain count | 2.0119 | second round — stop: did not beat 1.9996 |

The category effect is the only term that helped — by 0.1% — and it is kept because the
category is the term the house asks for, not because the gain is large. Everything else made
the model worse out-of-sample, so it stays out. Each category effect is shrunk toward the mean
with a prior of 10 pseudo-observations at the category average, so thin categories do not swing
the board.

## How the model held up out-of-sample

Leave-one-out RMSE 2.00 log-points, MAE 1.52, R² 0.147. Walk-forward — fit on protocols listed
before each date and tested on the next — pooled RMSE 1.85, MAE 1.42. P25–P75 coverage: 49%
leave-one-out and 57% walk-forward (a 50% band should cover about half). P10–P90: 80% and 76%
(stated 80%). The bands are wide: the P25–P75 band is about 11x across, which is what an R² of
0.15 honestly buys.

Token odds come from a logistic regression on the same training rows: intercept −9.2598, log TVL
0.1057, log age 0.5185, age missing 0.9354, chain count 0.0318, 7-day growth −0.0240 (clipped to
[−60, 120]), category token rate 7.0781. The 7-day growth coefficient is negative: the fastest
growers in this snapshot are the ones that already have a token or are pumping on one. Brier
0.184 against a baseline of 0.248, AUC 0.80 — it beats a coin flip, and it is not a forecast.
Missing ages are imputed with the snapshot median (677 days) and missing 7-day growth with the
snapshot median (−8.23%), with a missing-age flag in the regression.

Rank ranges come from a bootstrap: 200 refits of the value model, each on a resample of the
training set, re-ranking the whole board. The P10–P90 rank range of each row is shown on the
board. Median width 39 ranks.

## Farming — costed, not promised

Each row carries a farm verdict under a base case: you take 0.001% of the launch value (netted
at the low end of the band, P25), pay gas per transaction ($2 on Ethereum, $0.50 on an L2,
$1 elsewhere), and the T-bill cost of the capital for the hold. FARM means the net clears costs
and $25 an hour; MARGINAL clears costs but not $25 an hour; SKIP does not clear costs.

Capital depends on the TVL tier: $50 for TVL under $100M, $100 under $500M, $150 under $2B,
$250 above. The hold depends on the protocol's age: 60 days under 1 year, 45 days under 2 years,
30 days above. Time is 45 minutes setup, 10 minutes a week of claims, 5 minutes of exit. The
T-bill rate is 4.5% a year.

Base case: 83 FARM, 72 MARGINAL, 43 SKIP. The verdict is sensitive to the wallet share:

| Wallet share | FARM / MARGINAL / SKIP |
| --- | --- |
| 0.01% | 177 / 15 / 6 |
| 0.005% | 164 / 22 / 12 |
| 0.001% | 83 / 72 / 43 |
| 0.0005% | 36 / 92 / 70 |
| 0.0001% | 0 / 32 / 166 |

The dashboard lets the reader change the plan size, the wallet share and the horizon and see
the verdicts move. The gas table is a simplification, not live gas prices, and a 0.001% wallet
share is a guess about what a single wallet captures at a launch, not a fact.

## The whole snapshot, accounted for

All 758 protocols sit in exactly one group: 198 ranked, 416 already have a token, 144 excluded
by the house rule. The excluded split by primary reason: 11 versioned names, 128 excluded
categories (42 CEX, 38 Liquid Staking, 28 Bridge, 15 Canonical Bridge, 3 Liquid Restaking, 2
Restaked BTC), and 5 wrapped/staked/staking names. Twenty-five protocols fail on more than one
reason, so the primary reason is shown. The board's data file lists the exclusion reasons; the
dashboard checks that every row recomputes exactly and prints the ledger checksum.

## Limits, stated plainly

The value model explains about 15% of the variance in log market cap. A P25–P75 band that
spans 11x is the model saying it does not know precisely, and the band is the honest form of
the answer. Token odds is a propensity from the snapshot's history — protocols that launched
tokens before — not a forecast that a given protocol will launch one. The farm plans use a gas
table, not live gas prices, and a 0.001% wallet share is a guess, not a fact. Twenty rows pass
every snapshot-visible rule but are not on the watchlist; the snapshot does not carry the field
(`parentProtocol`) that most likely excludes them, so they are ranked and flagged rather than
dropped. If a row's recompute ever disagrees with its board number, the board is wrong.
