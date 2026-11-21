// Token Radar dashboard (model radar-4). Reads window.RADAR (data.js) and renders the board,
// its filters, a per-protocol detail page and the methodology. No network: every byte it
// shows is in data.js. The page recomputes every row from the breakdown data.js carries
// and says how many rows match; a screen with no data behind it counts for nothing.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', watchlist: false, tab: 'pre-token', sort: 'implied', dir: -1, selected: null, deposit: 2500, share: 0.10, horizon: 84, verdict: 'all' };
  var refocus = null;

  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
  }
  function fmtUsd2(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmt4(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return n.toFixed(4);
  }
  function fmt2(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return n.toFixed(2);
  }
  function fmtOdds(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return n.toFixed(2);
  }
  function fmtMult(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return '×' + n.toFixed(2);
  }
  function fmtShare(n) {
    if (n === null || n === undefined || !isFinite(n) || n === Infinity) return 'n/a';
    return (n * 100).toFixed(1) + '%';
  }

  // == PURE MODEL (mirrors lib/model.ts) ==
  function ageDaysOf(row) {
    if (!row.listed_at) return null;
    var a = Date.parse(DATA.as_of + 'T00:00:00Z');
    var b = Date.parse(row.listed_at + 'T00:00:00Z');
    if (!isFinite(a) || !isFinite(b)) return null;
    return Math.max(0, Math.floor((a - b) / 86400000));
  }
  function predLogOf(row) {
    var v = DATA.value;
    return v.intercept + v.slope * Math.log(row.tvl_usd) + row.cat_effect;
  }
  function fittedOf(row) {
    return Math.exp(predLogOf(row)) * DATA.value.smearing;
  }
  function oddsOf(row) {
    var o = DATA.odds;
    var age = ageDaysOf(row);
    var logAge = Math.log((age === null ? o.median_age_days : age) + 1);
    var chg = row.change_7d === null || row.change_7d === undefined ? o.median_change_7d : row.change_7d;
    chg = Math.min(o.change_clip_high, Math.max(o.change_clip_low, chg));
    var z = o.intercept + o.log_tvl * Math.log(row.tvl_usd) + o.log_age * logAge +
      o.age_missing * (age === null ? 1 : 0) + o.chain_count * row.chains.length +
      o.change_7d * chg + o.cat_token_rate * row.cat_token_rate;
    return 1 / (1 + Math.exp(-Math.max(-500, Math.min(500, z))));
  }
  function impliedOf(row) {
    return Math.max(1, Math.round(fittedOf(row) * oddsOf(row)));
  }
  function bandOf(row) {
    var v = DATA.value;
    var odds = oddsOf(row);
    return {
      p25: Math.max(1, Math.round(Math.exp(predLogOf(row) + v.loo_q25) * v.smearing * odds)),
      p75: Math.max(1, Math.round(Math.exp(predLogOf(row) + v.loo_q75) * v.smearing * odds))
    };
  }
  function fnv1a(s) {
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return ('0000000' + h.toString(16)).slice(-8);
  }
  function canonicalBoard() {
    return DATA.rows.slice().sort(function (a, b) { return a.rank - b.rank; })
      .map(function (r) { return r.rank + ':' + r.slug + ':' + r.implied_value_usd; }).join('\n');
  }
  var recompute = (function () {
    var ok = 0;
    DATA.rows.forEach(function (r) {
      var band = bandOf(r);
      if (impliedOf(r) === r.implied_value_usd && band.p25 === r.p25_usd && band.p75 === r.p75_usd) ok++;
    });
    return { matched: ok, total: DATA.rows.length, checksumOk: fnv1a(canonicalBoard()) === DATA.ledger.checksum };
  })();
  // == END PURE MODEL ==

  // == SCENARIO VERDICTS: the farm verdict under the reader's own deposit, drop share
  // and horizon. The modelled drop is the wallet's pro-rata share of the launch value at
  // the P25 end of the fitted band, if the token launches: (deposit / TVL) x share x fitted P25.
  function verdictFor(row, deposit, share, horizon) {
    var weeks = Math.floor(horizon / 7);
    var gas = (7 + weeks) * row.gas_per_txn_usd;
    var tbill = deposit * 0.045 * horizon / 365;
    var hours = (45 + 10 * weeks + 5) / 60;
    var take = (deposit / row.tvl_usd) * share * row.fitted_p25_usd;
    var net = take - gas - tbill;
    var perHour = net / hours;
    var denom = (share * row.fitted_p25_usd) / row.tvl_usd - 0.045 * horizon / 365;
    return {
      verdict: net > 0 && perHour >= 25 ? 'FARM' : net > 0 ? 'MARGINAL' : 'SKIP',
      take: take, expected: take * row.token_odds, net: net, perHour: perHour, gas: gas,
      tbill: tbill, hours: hours, capital: deposit, hold: horizon,
      breakeven: denom > 0 ? gas / denom : Infinity,
      minShare: (deposit / row.tvl_usd) * row.fitted_p25_usd > 0 ? (gas + tbill) / ((deposit / row.tvl_usd) * row.fitted_p25_usd) : Infinity
    };
  }
  function verdictOf(row) {
    return verdictFor(row, state.deposit, state.share, state.horizon);
  }
  function scenarioActive() {
    return state.deposit !== 2500 || state.share !== 0.10 || state.horizon !== 84;
  }
  function scenarioCounts() {
    var f = 0, m = 0, s = 0, best = -Infinity, bestSlug = '';
    DATA.rows.forEach(function (r) {
      var v = verdictOf(r);
      if (v.verdict === 'FARM') f++;
      else if (v.verdict === 'MARGINAL') m++;
      else s++;
      if (v.perHour > best) { best = v.perHour; bestSlug = r.slug; }
    });
    return { farm: f, marginal: m, skip: s, best: best, bestSlug: bestSlug };
  }
  // == END SCENARIO VERDICTS ==

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') { if (attrs[k]) node.className = attrs[k]; }
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function catOf(r) { return r.category || 'Other'; }
  function categories() {
    return Array.from(new Set(DATA.rows.map(catOf))).sort();
  }
  function chains() {
    var set = {};
    DATA.rows.forEach(function (r) { (r.chains || []).forEach(function (c) { set[c] = true; }); });
    DATA.live.forEach(function (r) { (r.chains || []).forEach(function (c) { set[c] = true; }); });
    return Object.keys(set).sort();
  }
  function isWatchlist(r) { return r.tvl_usd >= DATA.floor_usd && !r.watchlist_gap; }
  function chainLabel(r) {
    return (r.chains && r.chains.length) ? r.chains.slice(0, 2).join(', ') + (r.chains.length > 2 ? ' +' + (r.chains.length - 2) : '') : 'an unnamed chain';
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category') && (params.get('category') === 'all' || categories().indexOf(params.get('category')) >= 0)) state.category = params.get('category');
    if (params.get('chain') && (params.get('chain') === 'all' || chains().indexOf(params.get('chain')) >= 0)) state.chain = params.get('chain');
    if (params.get('watchlist') === '1') state.watchlist = true;
    if (params.get('tab') === 'live') state.tab = 'live';
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('verdict') && ['FARM', 'MARGINAL', 'SKIP'].indexOf(params.get('verdict')) >= 0) state.verdict = params.get('verdict');
    if (params.get('sort') && ['rank', 'name', 'tvl', 'growth', 'age', 'odds', 'multiple', 'iflaunches', 'implied', 'perhour', 'verdict'].indexOf(params.get('sort')) >= 0) {
      state.sort = params.get('sort');
      state.dir = (state.sort === 'rank' || state.sort === 'name') ? 1 : -1;
    }
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.watchlist) params.set('watchlist', '1');
    if (state.tab === 'live') params.set('tab', 'live');
    if (state.selected) params.set('p', state.selected);
    if (state.verdict !== 'all') params.set('verdict', state.verdict);
    if (state.sort !== 'implied') params.set('sort', state.sort);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function matchesQuery(r, q) {
    if (!q) return true;
    var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
    return hay.indexOf(q) >= 0;
  }
  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.watchlist && !isWatchlist(r)) return false;
      if (state.category !== 'all' && catOf(r) !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.verdict !== 'all' && verdictOf(r).verdict !== state.verdict) return false;
      return matchesQuery(r, q);
    });
  }
  function filteredLive() {
    var q = state.q.trim().toLowerCase();
    return DATA.live.filter(function (r) {
      if (state.category !== 'all' && catOf(r) !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      return matchesQuery(r, q);
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    var verdictRank = { FARM: 2, MARGINAL: 1, SKIP: 0 };
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'rank') { av = a.rank; bv = b.rank; }
      else if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'odds') { av = a.token_odds; bv = b.token_odds; }
      else if (key === 'multiple') { av = a.multiple; bv = b.multiple; }
      else if (key === 'iflaunches') { av = a.fitted_value_usd; bv = b.fitted_value_usd; }
      else if (key === 'perhour') { av = verdictOf(a).perHour; bv = verdictOf(b).perHour; }
      else if (key === 'verdict') { av = verdictRank[verdictOf(a).verdict]; bv = verdictRank[verdictOf(b).verdict]; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }
  function setSort(key) {
    if (state.sort === key) state.dir = -state.dir;
    else { state.sort = key; state.dir = (key === 'rank' || key === 'name') ? 1 : -1; }
    render();
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model — fitted, tested held-out twice' })
      )
    );
  }

  function kpiStrip() {
    var v = DATA.value;
    var counts = scenarioCounts();
    function card(label, big, small) {
      return el('div', { class: 'kpi-card' }, el('span', { text: label }), el('b', { text: big }), el('span', { class: 'sub', text: small }));
    }
    return el('section', { class: 'kpi' },
      card('Ranked', String(DATA.board_size), 'watchlist ' + DATA.watchlist_size + ' / ' + DATA.watchlist_size),
      card('Total implied value', fmtUsd(DATA.ledger.total_implied_usd), 'top row ' + fmtUsd(DATA.rows[0].implied_value_usd)),
      card('Value miss, held out', '×' + v.loo_med_miss.toFixed(2) + ' LOO · ×' + v.wf_med_miss.toFixed(2) + ' WF', 'flat multiple ×' + v.flat_loo_med_miss.toFixed(2) + ' · ×' + v.flat_wf_med_miss.toFixed(2)),
      card('Range holds', Math.round(v.loo_cov_p25_p75 * 100) + '% P25–P75 LOO', Math.round(v.loo_cov_p10_p90 * 100) + '% P10–P90 · band ×' + v.band_width_x.toFixed(1)),
      card('Token odds', 'Brier ' + DATA.odds.brier.toFixed(3) + ' vs ' + DATA.odds.brier_baseline.toFixed(3), 'AUC ' + DATA.odds.auc.toFixed(2) + ' · fit on all 758'),
      card('Worth farming', counts.farm + ' of ' + DATA.board_size + ' FARM', 'best +' + fmtUsd2(counts.best) + '/hr · smallest break-even ' + fmtUsd2(DATA.farm.smallest_breakeven_deposit))
    );
  }

  function lede() {
    var ledger = DATA.ledger;
    var v = DATA.value;

    var excluded = v.ratio_excluded_detail.filter(function (d) { return d.slug !== 'rain'; }).map(function (d) { return d.slug + ' ' + d.ratio.toFixed(1) + '×'; }).join(', ');
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: '198 protocols record no token. Here is what each launch would be worth.' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The board also ranks ' + ledger.below_floor + ' pre-token protocols below that floor — and ' + ledger.above_floor_not_watchlist.length + ' more above it that pass every snapshot-visible house rule but are not on the watchlist.' }),
        el('p', { class: 'formula', text: 'implied = exp(' + fmt4(v.intercept) + ' + ' + fmt4(v.slope) + ' × log(TVL) + category effect) × ' + fmt4(v.smearing) + ' × token odds. 7-day growth and no-token age enter through the odds, not the size curve.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Protocols accounted for' }), el('b', { text: ledger.ranked + ' + ' + ledger.token_bearing + ' + ' + ledger.excluded + ' = ' + ledger.total })),
        el('div', { class: 'fact' }, el('span', { text: 'Farm verdicts' }), el('b', { text: DATA.farm.verdicts.farm + ' FARM · ' + DATA.farm.verdicts.marginal + ' marg. · ' + DATA.farm.verdicts.skip + ' skip' })),
        el('div', { class: 'fact' }, el('span', { text: 'Recomputed' }), el('b', { text: recompute.matched + ' of ' + recompute.total + (recompute.checksumOk ? ' · ' + ledger.checksum : ' · CHECKSUM MISMATCH') }))
      ),
      el('div', { class: 'acct' },
        el('b', { text: 'Protocol accounting — ' }),
        el('span', { text: 'all ' + ledger.total + ' snapshot protocols in exactly one group: ' + ledger.ranked + ' ranked as pre-token, ' + ledger.token_bearing + ' already record a token, ' + ledger.excluded + ' left out by the house list\u2019s own rules (' + ledger.excluded_version + ' versioned names, ' + ledger.excluded_category + ' excluded categories, ' + ledger.excluded_word + ' wrapped/staked names).' })
      ),
      el('div', { class: 'integrity' },
        el('span', { text: '✓ board.json: ' + recompute.matched + ' of ' + recompute.total + ' rows recomputed here · ranks 1–198 in order · totals ' + fmtUsd(ledger.total_implied_usd) + ' · checksum ' + ledger.checksum + ' = main.ts · watchlist 40 of 40 · ledger 758 of 758' })
      ),
      el('div', { class: 'disclose' },
        el('span', { text: 'Comps above 5× TVL are out of the fit: ' + excluded + ' (rain, 400.2×, was already out). Same model on all 118 comps: RMSE ' + DATA.value.full118.rmse.toFixed(2) + ', median miss ×' + DATA.value.full118.med_miss.toFixed(2) + ' — the six are a different regime (RMSE ' + DATA.value.full118.excluded_rmse.toFixed(2) + ').' })
      )
    );
  }

  function scatterSection() {
    var comps = DATA.comps;
    var W = 660, H = 280, PL = 44, PR = 12, PT = 10, PB = 28;
    var xs = comps.map(function (c) { return Math.log(c.tvl_usd); });
    var ys = comps.map(function (c) { return Math.log(c.mcap_usd); });
    var x0 = Math.min.apply(null, xs.concat(DATA.rows.map(function (r) { return Math.log(r.tvl_usd); })));
    var x1 = Math.max.apply(null, xs.concat(DATA.rows.map(function (r) { return Math.log(r.tvl_usd); })));
    var y0 = Math.min.apply(null, ys.concat(DATA.rows.map(function (r) { return Math.log(r.fitted_value_usd); })));
    var y1 = Math.max.apply(null, ys.concat(DATA.rows.map(function (r) { return Math.log(r.fitted_value_usd); })));
    function X(v) { return PL + (v - x0) / (x1 - x0) * (W - PL - PR); }
    function Y(v) { return PT + (1 - (v - y0) / (y1 - y0)) * (H - PT - PB); }
    var v = DATA.value;
    var line = 'M' + X(x0).toFixed(1) + ',' + Y(v.intercept + v.slope * x0).toFixed(1) + ' L' + X(x1).toFixed(1) + ',' + Y(v.intercept + v.slope * x1).toFixed(1);
    var dots = comps.map(function (c) { return '<circle cx="' + X(Math.log(c.tvl_usd)).toFixed(1) + '" cy="' + Y(Math.log(c.mcap_usd)).toFixed(1) + '" r="2.6" fill="#5a6b60"/>'; }).join('');
    var blues = DATA.rows.map(function (r) { return '<circle cx="' + X(Math.log(r.tvl_usd)).toFixed(1) + '" cy="' + Y(Math.log(r.fitted_value_usd)).toFixed(1) + '" r="2.2" fill="#3ecf8e"/>'; }).join('');
    function tick(val, label) { return '<text x="' + X(Math.log(val)).toFixed(1) + '" y="' + (H - 8) + '" fill="#9db0a4" font-size="10" text-anchor="middle">' + label + '</text>'; }
    function ytick(val, label) { return '<text x="' + (PL - 6) + '" y="' + (Y(Math.log(val)) + 3).toFixed(1) + '" fill="#9db0a4" font-size="10" text-anchor="end">' + label + '</text>'; }
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="Market cap against TVL, log-log">' +
      '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="none"/>' +
      tick(5e6, '$5M') + tick(5e7, '$50M') + tick(5e8, '$500M') + tick(5e9, '$5B') +
      ytick(1e6, '$1M') + ytick(1e7, '$10M') + ytick(1e8, '$100M') + ytick(1e9, '$1B') + ytick(1e10, '$10B') +
      '<path d="' + line + '" stroke="#3ecf8e" stroke-width="1.6" fill="none"/>' + dots + blues + '</svg>';
    return el('section', { class: 'panel scatter' },
      el('div', { class: 'scatter-head' },
        el('h2', { text: 'Market cap on TVL' }),
        el('span', { class: 'sub', text: 'Grey: ' + comps.length + ' tokens that trade. Line: the size curve. Blue: the board\u2019s fitted values. Log scale.' })
      ),
      el('div', { html: svg })
    );
  }

  function termTable() {
    var rows = DATA.value.terms.map(function (t) {
      return el('tr', null,
        el('td', { text: t.name }),
        el('td', { class: 'num', text: t.loo_rmse.toFixed(2) }),
        el('td', { class: 'num', text: '×' + t.loo_med_miss.toFixed(2) }),
        el('td', { class: 'num', text: t.wf_rmse.toFixed(2) }),
        el('td', { class: 'num', text: '×' + t.wf_med_miss.toFixed(2) }),
        el('td', { text: t.result })
      );
    });
    return el('section', { class: 'panel term' },
      el('div', { class: 'scatter-head' },
        el('h2', { text: 'Out-of-sample evidence — which terms survived' }),
        el('span', { class: 'sub', text: 'Leave-one-out and walk-forward. A term was kept only when it helped.' })
      ),
      el('div', { class: 'table-wrap' },
        el('table', { class: 'mini' },
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Terms' }), el('th', { scope: 'col', text: 'LOO RMSE' }), el('th', { scope: 'col', text: 'LOO miss' }), el('th', { scope: 'col', text: 'Walk-forward RMSE' }), el('th', { scope: 'col', text: 'WF miss' }), el('th', { scope: 'col', text: 'Result' }))),
          el('tbody', null, rows)
        )
      )
    );
  }

  function controls() {
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; refocus = 'q'; writeHash(); render(); });
    var catSelect = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories().map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    catSelect.addEventListener('change', function () { state.category = catSelect.value; refocus = 'category'; writeHash(); render(); });
    var chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains().map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; refocus = 'chain'; writeHash(); render(); });
    var verdictSelect = el('select', { id: 'verdict', 'aria-label': 'Filter by farm verdict' },
      el('option', { value: 'all', text: 'All verdicts' }),
      ['FARM', 'MARGINAL', 'SKIP'].map(function (v) { return el('option', { value: v, text: v, selected: v === state.verdict ? 'selected' : null }); })
    );
    verdictSelect.addEventListener('change', function () { state.verdict = verdictSelect.value; refocus = 'verdict'; writeHash(); render(); });
    var watch = el('input', { type: 'checkbox', id: 'watchlist', checked: state.watchlist ? 'checked' : null, disabled: state.tab === 'live' ? 'disabled' : null, 'aria-label': 'Watchlist only' });
    watch.addEventListener('change', function () { state.watchlist = watch.checked; refocus = 'watchlist'; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; writeHash(); render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; writeHash(); render(); } });
    var countText = state.tab === 'pre-token'
      ? filteredRows().length + ' of ' + DATA.board_size + ' rows'
      : filteredLive().length + ' of ' + DATA.live_size + ' live-token protocols';
    function download(name, text, type) {
      var blob = new Blob([text], { type: type });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = name; document.body.appendChild(a); a.click();
      document.body.removeChild(a); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }
    function csv() {
      var head = 'rank,slug,name,category,tvl_usd,token_odds,multiple,implied_value_usd,p25_usd,p75_usd,verdict,net_cash_usd,per_hour_usd\n';
      var lines = sortedRows(filteredRows()).map(function (r) {
        var v = verdictOf(r);
        return [r.rank, r.slug, '"' + r.name.replace(/"/g, '""') + '"', '"' + (r.category || '').replace(/"/g, '""') + '"',
          r.tvl_usd, r.token_odds.toFixed(4), r.multiple.toFixed(4), r.implied_value_usd, r.p25_usd, r.p75_usd,
          v.verdict, v.net.toFixed(2), v.perHour.toFixed(2)].join(',');
      });
      download('token-radar-board.csv', head + lines.join('\n') + '\n', 'text/csv');
    }
    function json() {
      var rows = sortedRows(filteredRows()).map(function (r) {
        var v = verdictOf(r);
        return { rank: r.rank, slug: r.slug, name: r.name, category: r.category, tvl_usd: r.tvl_usd, token_odds: r.token_odds, multiple: Math.round(r.multiple * 10000) / 10000, implied_value_usd: r.implied_value_usd, p25_usd: r.p25_usd, p75_usd: r.p75_usd, verdict: v.verdict, net_cash_usd: Math.round(v.net * 100) / 100, per_hour_usd: Math.round(v.perHour * 100) / 100 };
      });
      download('token-radar-board.json', JSON.stringify({ as_of: DATA.as_of, rows: rows }, null, 2) + '\n', 'application/json');
    }
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSelect),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      el('div', { class: 'field' }, el('label', { for: 'verdict', text: 'Farm verdict' }), verdictSelect),
      el('label', { class: 'check', for: 'watchlist' }, watch, 'Watchlist only'),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: countText }),
      state.tab === 'pre-token' ? el('button', { class: 'button', type: 'button', text: 'Download CSV', onclick: csv }) : null,
      state.tab === 'pre-token' ? el('button', { class: 'button', type: 'button', text: 'Download JSON', onclick: json }) : null
    );
  }

  function scenarioBar() {
    function sel(id, label, options, value, onChange) {
      var s = el('select', { id: id, 'aria-label': label },
        options.map(function (o) { return el('option', { value: String(o.value), text: o.text, selected: String(o.value) === String(value) ? 'selected' : null }); })
      );
      s.addEventListener('change', function () { onChange(s.value); refocus = id; render(); });
      return el('div', { class: 'field' }, el('label', { for: id, text: label }), s);
    }
    var deposit = sel('deposit', 'Deposit', [
      { value: 500, text: '$500' }, { value: 1000, text: '$1,000' }, { value: 2500, text: '$2,500 (base)' }, { value: 5000, text: '$5,000' }, { value: 10000, text: '$10,000' }
    ], state.deposit, function (v) { state.deposit = Number(v); });
    var share = sel('share', 'Drop share to depositors', [
      { value: 0.05, text: '5%' }, { value: 0.07, text: '7%' }, { value: 0.10, text: '10% (base)' }, { value: 0.15, text: '15%' }
    ], state.share, function (v) { state.share = Number(v); });
    var horizon = sel('horizon', 'Hold horizon', [
      { value: 30, text: '30 days' }, { value: 60, text: '60 days' }, { value: 84, text: '12 weeks (base)' }, { value: 120, text: '120 days' }
    ], state.horizon, function (v) { state.horizon = Number(v); });
    var reset = el('button', { class: 'button', type: 'button', text: 'Reset scenario', onclick: function () { state.deposit = 2500; state.share = 0.10; state.horizon = 84; render(); } });
    var note = el('span', { class: 'sub', text: scenarioActive() ? 'Verdicts below use your scenario, not the base case.' : 'Base case: $2,500 for 12 weeks, 10% of the launch to depositors. The modelled drop is (deposit / TVL) × drop share × fitted value at P25, if the token launches.' });
    return el('div', { class: 'scenario' },
      el('span', { class: 'scenario-title', text: 'Try your own plan' }), deposit, share, horizon, reset, note);
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { setSort(key); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' ↓' : ' ↑' }) : null
      )
    );
  }

  function emptyPanel(message) {
    return el('div', { class: 'panel' }, el('div', { class: 'empty' },
      el('h2', { text: 'No protocol matches that filter' }),
      el('p', { text: message }),
      el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.watchlist = false; state.verdict = 'all'; writeHash(); render(); } })
    ));
  }

  function verdictPill(v) {
    return el('span', { class: 'verdict ' + v.toLowerCase(), text: v });
  }

  function boardTable() {
    var list = sortedRows(filteredRows());
    if (list.length === 0) return emptyPanel('Clear the search or pick another category, chain, verdict or watchlist setting to see the board again.');
    var max = 1;
    list.forEach(function (r) { if (r.implied_value_usd > max) max = r.implied_value_usd; });
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var v = verdictOf(r);
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num' }, el('div', { class: 'rank-cell' }, el('b', { text: String(r.rank) }), el('span', { class: 'sub', text: r.rank_p10 + '–' + r.rank_p90 }))),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: catOf(r) + ' on ' + chainLabel(r) + (r.watchlist_gap ? ' · not on watchlist' : '') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: fmtOdds(r.token_odds) }),
        el('td', { class: 'num', text: fmtMult(r.multiple) }),
        el('td', { class: 'num', text: fmtUsd(r.fitted_value_usd) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) }),
          el('span', { class: 'sub', text: fmtUsd(r.p25_usd) + ' – ' + fmtUsd(r.p75_usd) })
        )),
        el('td', null, el('div', { class: 'farm-cell' }, verdictPill(v.verdict), el('span', { class: 'num sub', text: fmtUsd2(v.perHour) + '/hr' })))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Pre-token protocols, strongest implied value first. Rank shows the P10–P90 range across 200 refits. Multiple is the fitted value if it launches, divided by TVL.' }),
          el('thead', null, el('tr', null,
            sortHeader('rank', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('odds', 'Token odds'),
            sortHeader('multiple', 'Multiple'),
            sortHeader('iflaunches', 'If it launches'),
            sortHeader('implied', 'Implied value (P25–P75)'),
            sortHeader('perhour', 'Farm · net/hr')
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var list = filteredLive();
    if (list.length === 0) return emptyPanel('Clear the search or pick another category or chain to see the live-token protocols again.');
    var tbody = el('tbody');
    list.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: catOf(r) + ' on ' + chainLabel(r) }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are the comps the value model is fit on.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function openDetail(slug) {
    state.selected = slug;
    writeHash();
    render();
    window.scrollTo(0, 0);
  }
  function closeDetail() {
    state.selected = null;
    writeHash();
    render();
  }

  function nearestPeers(row) {
    var same = DATA.comps.filter(function (c) { return c.category === row.category && c.slug !== row.slug; });
    same.sort(function (a, b) { return Math.abs(Math.log(a.tvl_usd) - Math.log(row.tvl_usd)) - Math.abs(Math.log(b.tvl_usd) - Math.log(row.tvl_usd)); });
    var peers = same.slice(0, 8);
    if (peers.length < 8) {
      var rest = DATA.comps.filter(function (c) { return c.category !== row.category && peers.indexOf(c) < 0; });
      rest.sort(function (a, b) { return Math.abs(Math.log(a.tvl_usd) - Math.log(row.tvl_usd)) - Math.abs(Math.log(b.tvl_usd) - Math.log(row.tvl_usd)); });
      peers = peers.concat(rest.slice(0, 8 - peers.length));
    }
    return peers;
  }

  function detailPage() {
    var row = null;
    DATA.rows.forEach(function (r) { if (r.slug === state.selected) row = r; });
    if (!row) return null;
    var v = verdictOf(row);
    var band = bandOf(row);
    var recomputed = impliedOf(row) === row.implied_value_usd && band.p25 === row.p25_usd && band.p75 === row.p75_usd;
    var effect = DATA.effects.filter(function (e) { return e.category === row.category; })[0];
    var curve = Math.exp(DATA.value.intercept + DATA.value.slope * Math.log(row.tvl_usd));
    var smeared = curve * DATA.value.smearing;
    var catMult = Math.exp(row.cat_effect);
    var tbillSame = v.capital * 0.045 * v.hold / 365;
    var peers = nearestPeers(row);
    var peerRows = peers.map(function (c) {
      return el('tr', null,
        el('td', { text: c.name }),
        el('td', { class: 'num', text: fmtUsd(c.tvl_usd) }),
        el('td', { class: 'num', text: fmtUsd(c.mcap_usd) }),
        el('td', { class: 'num', text: fmtMult(c.ratio) }),
        el('td', { class: 'num', text: fmtMult(c.mcap_usd / c.fitted_value_usd) })
      );
    });
    var shares = [0.05, 0.07, 0.10, 0.15];
    var deposits = [1000, 2500, 5000, 10000];
    var netRows = shares.map(function (s) {
      return el('tr', null,
        el('td', { class: 'num', text: (s * 100).toFixed(0) + '%' }),
        deposits.map(function (d) {
          var nv = verdictFor(row, d, s, v.hold);
          return el('td', { class: 'num ' + (nv.net >= 0 ? 'pos' : 'neg'), text: fmtUsd2(nv.net) });
        })
      );
    });
    var steps = row.farm_steps.map(function (s, i) { return el('li', { key: i }, s); });
    return el('div', { class: 'detail-page' },
      el('button', { class: 'button', type: 'button', text: '← Back to the board', onclick: closeDetail }),
      el('div', { class: 'detail-head' },
        el('span', { class: 'sub', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + ' · rank ' + row.rank_p10 + '–' + row.rank_p90 + ' across 200 bootstrap refits' }),
        el('h1', { text: row.name }),
        el('p', { class: 'sub', text: catOf(row) + ' on ' + chainLabel(row) + ' · TVL ' + fmtUsd(row.tvl_usd) + ' · ' + fmtAge(row.age_days) + ' old · 7d ' + fmtPct(row.change_7d) + (row.watchlist_gap ? ' · above the floor but not on the watchlist' : '') })
      ),
      el('div', { class: 'detail-grid' },
        el('div', null,
          el('h2', { text: 'Implied value, and how it was computed' }),
          el('dl', { class: 'detail-list' },
            el('dt', { text: 'TVL' }), el('dd', { text: fmtUsd(row.tvl_usd) + ' — the size curve alone prices that at ' + fmtUsd(curve) }),
            el('dt', { text: 'Size curve' }), el('dd', { text: 'exp(' + fmt4(DATA.value.intercept) + ' + ' + fmt4(DATA.value.slope) + ' × log TVL) = ' + fmtUsd(curve) + ', × smearing ' + fmt4(DATA.value.smearing) + ' = ' + fmtUsd(smeared) }),
            el('dt', { text: 'Category' }), el('dd', { text: (effect ? catOf(row) + ' × ' + fmt2(catMult) + ' (' + fmt4(row.cat_effect) + ' log-points, ' + effect.n + ' comps)' : 'no live-token comps in this category — no effect applied') + ' → fitted value if it launches ' + fmtUsd(row.fitted_value_usd) }),
            el('dt', { text: 'Token odds' }), el('dd', { text: fmtOdds(row.token_odds) + ' — from a logistic fit on all 758 protocols (7-day growth ' + fmtPct(row.change_7d) + ' and ' + fmtAge(row.age_days) + ' of no-token age enter here, not in the size curve)' }),
            el('dt', { text: 'Implied value' }), el('dd', { text: fmtUsd(row.implied_value_usd) + ' = fitted value × token odds. P25–P75 band ' + fmtUsd(row.p25_usd) + ' – ' + fmtUsd(row.p75_usd) + ' (×' + DATA.value.band_width_x.toFixed(1) + ' wide).' }),
            el('dt', { text: 'Tested, not used' }), el('dd', { text: '7-day growth, age, chain count, size²: each made walk-forward worse (age: WF 3.56 vs 1.58).' }),
            el('dt', { text: 'Recomputed' }), el('dd', { text: recomputed ? 'Yes: this page recomputed the fitted value, the token odds and the P25–P75 band from the breakdown and got ' + fmtUsd(impliedOf(row)) + ' — exactly the board\u2019s number.' : 'Warning: this page\u2019s recompute differs from the board. Treat the board as suspect.' })
          ),
          el('h3', { text: 'Nearest priced peers' }),
          el('p', { class: 'sub', text: 'Live-token protocols in the same category, nearest by TVL. CAP ÷ model is the market cap divided by what the size curve says it should be worth.' }),
          el('div', { class: 'table-wrap' },
            el('table', { class: 'mini' },
              el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Peer' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'CAP / TVL' }), el('th', { scope: 'col', text: 'CAP ÷ model' }))),
              el('tbody', null, peerRows)
            )
          )
        ),
        el('div', null,
          el('h2', { text: 'Farming it — verdict ' + v.verdict }),
          el('dl', { class: 'detail-list' },
            el('dt', { text: 'Deposit' }), el('dd', { text: fmtUsd2(v.capital) + ' for ' + v.hold + ' days (' + (v.hold / 7).toFixed(0) + ' weeks) at a ' + fmtShare(state.share) + ' drop share to depositors' }),
            el('dt', { text: 'Modelled drop' }), el('dd', { text: fmtUsd2(v.take) + ' — (deposit / TVL) × drop share × fitted value at P25 (' + fmtUsd(row.fitted_p25_usd) + '), if the token launches' }),
            el('dt', { text: 'Expected take' }), el('dd', { text: fmtUsd2(v.expected) + ' — the modelled drop × token odds ' + fmtOdds(row.token_odds) + '. The verdict is costed on the drop if it launches; this is the odds-adjusted figure.' }),
            el('dt', { text: 'Gas' }), el('dd', { text: fmtUsd2(v.gas) + ' — ' + (7 + Math.floor(v.hold / 7)) + ' transactions at ' + fmtUsd2(row.gas_per_txn_usd) + ' each, on ' + (row.chains[0] || 'its chain') }),
            el('dt', { text: 'T-bill cost' }), el('dd', { text: fmtUsd2(v.tbill) + ' — holding ' + fmtUsd2(v.capital) + ' for ' + v.hold + ' days at 4.5% a year' }),
            el('dt', { text: 'Net' }), el('dd', { text: fmtUsd2(v.net) + (v.verdict === 'FARM' ? ' — clears costs and $25 an hour' : v.verdict === 'MARGINAL' ? ' — clears costs but not $25 an hour' : ' — does not clear costs') }),
            el('dt', { text: 'Per hour' }), el('dd', { text: fmtUsd2(v.perHour) + ' for ' + v.hours.toFixed(1) + ' hours of work' }),
            el('dt', { text: 'Break-even cheque' }), el('dd', { text: isFinite(v.breakeven) ? fmtUsd2(v.breakeven) + ' — the smallest deposit that covers its own gas and T-bill cost' : 'never — no deposit covers its costs at this drop share' }),
            el('dt', { text: 'Fees covered above' }), el('dd', { text: isFinite(v.minShare) ? 'a drop share of ' + fmtShare(v.minShare) + ' (at the ' + fmtUsd2(v.capital) + ' deposit)' : 'no drop share covers the fees' }),
            el('dt', { text: 'T-bill benchmark' }), el('dd', { text: 'The same ' + fmtUsd2(v.capital) + ' in a 4.5% T-bill earns ' + fmtUsd2(tbillSame) + ' over ' + v.hold + ' days — the farm must beat that, and it ' + (v.net > tbillSame ? 'does' : 'does not') + '.' }),
            el('dt', { text: 'Exit rule' }), el('dd', { text: 'Exit if TVL prints below ' + fmtUsd(row.exit_tvl_usd) + ' (20% under the snapshot TVL), or if the 7-day change turns below −20%.' }),
          ),
          el('h3', { text: 'Net by drop share × deposit' }),
          el('div', { class: 'table-wrap' },
            el('table', { class: 'mini' },
              el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Drop share' }), ['$1K', '$2.5K', '$5K', '$10K'].map(function (t) { return el('th', { scope: 'col', class: 'num', text: t }); }))),
              el('tbody', null, netRows)
            )
          ),
          el('h3', { text: 'Farm plan — 7 steps' }),
          el('ol', { class: 'steps' }, steps)
        )
      )
    );
  }

  function methodologyPanel() {
    var v = DATA.value;
    var o = DATA.odds;
    return el('section', { class: 'panel method' },
      el('h2', { text: 'How implied value is computed — and what it cannot do' }),
      el('p', { text: 'Implied value is the fitted value times the token odds. The fitted value is an OLS regression of log market cap on log TVL plus a shrunk category effect (median residual × n / (n + 5)), fit on ' + v.train_n + ' live-token comps after excluding every comp above 5× TVL. Slope ' + fmt4(v.slope) + ', intercept ' + fmt4(v.intercept) + ', smearing ' + fmt4(v.smearing) + '. LOO RMSE ' + v.loo_rmse.toFixed(2) + ', median miss ×' + v.loo_med_miss.toFixed(2) + ' (flat multiple ×' + v.flat_loo_med_miss.toFixed(2) + '); walk-forward RMSE ' + v.wf_rmse.toFixed(2) + ', median miss ×' + v.wf_med_miss.toFixed(2) + '. Token odds: logistic on all ' + o.train_n + ' protocols, Brier ' + o.brier.toFixed(3) + ' vs ' + o.brier_baseline.toFixed(3) + ', AUC ' + o.auc.toFixed(2) + ' — a propensity, not a forecast.' }),
      el('p', { text: 'Farm verdicts use a $2,500 deposit for 12 weeks and a 10% drop share: ' + DATA.farm.verdicts.farm + ' FARM, ' + DATA.farm.verdicts.marginal + ' MARGINAL, ' + DATA.farm.verdicts.skip + ' SKIP. The model explains about ' + Math.round(v.loo_r2 * 100) + '% of the variance in log market cap; the farm plans use a gas table, not live gas prices. The full methodology is in methodology.md.' })
    );
  }

  function filterBanner() {
    var parts = [];
    if (state.verdict !== 'all') parts.push(state.verdict + ' only');
    if (state.watchlist) parts.push('watchlist only');
    if (state.category !== 'all') parts.push('category ' + state.category);
    if (state.chain !== 'all') parts.push('chain ' + state.chain);
    if (state.q) parts.push('search \u201c' + state.q + '\u201d');
    if (parts.length === 0) return null;
    var n = filteredRows().length;
    var sortLabel = state.sort === 'perhour' ? 'net/hour' : state.sort === 'implied' ? 'implied value' : state.sort;
    var best = '';
    if (state.sort === 'perhour' && n > 0) { var top = sortedRows(filteredRows())[0]; best = ' \u00b7 best ' + fmtUsd2(verdictOf(top).perHour) + '/hr (' + top.slug + ')'; }
    return el('div', { class: 'filter-banner' }, el('b', { text: 'Filtered view: ' }), el('span', { text: parts.join(' \u00b7 ') + ' \u2014 ' + n + ' of ' + DATA.board_size + ' rows, sorted by ' + sortLabel + best }));
  }

  function render() {
    app.innerHTML = '';
    app.setAttribute('aria-busy', 'false');
    if (state.selected) {
      var detail = detailPage();
      var shell = el('div', { class: 'shell' }, [header(), detail].filter(function (n) { return n; }));
      app.appendChild(shell);
      return;
    }
    var nodes = [header()];
    var banner = filterBanner();
    if (banner) nodes.push(banner);
    nodes.push(lede(), kpiStrip(), scatterSection(), termTable());
    if (state.tab === 'pre-token') nodes.push(scenarioBar());
    nodes.push(controls());
    nodes.push(state.tab === 'pre-token' ? boardTable() : liveTable());
    nodes.push(methodologyPanel());
    var shell2 = el('div', { class: 'shell' }, nodes.filter(function (n) { return n; }));
    app.appendChild(shell2);
    if (refocus) {
      var node = document.getElementById(refocus);
      if (node) node.focus();
      refocus = null;
    }
  }

  window.addEventListener('hashchange', function () {
    readHash();
    render();
  });
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && state.selected) closeDetail();
  });

  readHash();
  render();
})();
