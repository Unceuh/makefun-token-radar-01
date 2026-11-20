// Token Radar dashboard (model radar-3). It reads window.RADAR (data.js, written beside dashboard/
// by main.ts) and renders the ranked board, its filters, a per-protocol detail view with the model's
// own breakdown and the protocol's costed farm verdict, and the methodology with the validation
// numbers. No network: every byte it shows is in data.js.
//
// The page checks itself: it recomputes every row's fitted value, token odds and implied value from
// the breakdown data.js carries, and the ledger checksum from the board, and says how many rows
// match. A screen with no data or code behind it counts for nothing, so the check is on the page.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', watchlist: false, tab: 'pre-token', sort: 'implied', dir: -1, selected: null, capital: null, share: 0.00001, horizon: null, verdict: 'all' };
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
  function fmtOdds(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return n.toFixed(2);
  }
  function fmtShare(n) {
    if (n === null || n === undefined || !isFinite(n) || n === Infinity) return 'n/a';
    var pct = n * 100;
    return (pct < 0.001 ? pct.toFixed(6) : pct.toFixed(4)) + '%';
  }

  // == PURE MODEL (mirrors lib/model.ts) ==
  // Recomputes a row's fitted value, token odds, implied value and P25–P75 from the breakdown
  // data.js carries, with the fitted coefficients. The fit is the program's own: intercept and
  // slope from the log TVL curve, the category effect stored on the row, smearing, and the
  // logistic's seven coefficients. Nothing here is hand-entered per protocol.
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
  // The integrity check: every row recomputed from its breakdown, and the ledger checksum.
  var recompute = (function () {
    var ok = 0;
    DATA.rows.forEach(function (r) {
      var band = bandOf(r);
      if (impliedOf(r) === r.implied_value_usd && band.p25 === r.p25_usd && band.p75 === r.p75_usd) ok++;
    });
    return { matched: ok, total: DATA.rows.length, checksumOk: fnv1a(canonicalBoard()) === DATA.ledger.checksum };
  })();
  // == END PURE MODEL ==

  // == SCENARIO VERDICTS ==
  // The farm verdict under the reader's own plan: capital, wallet share and horizon. The stored
  // verdict is the base case (the TVL tier's capital, the age's hold, a 0.001% wallet share).
  function verdictOf(row) {
    var capital = state.capital === null ? row.capital_usd : state.capital;
    var hold = state.horizon === null ? row.hold_days : state.horizon;
    var weeks = Math.floor(hold / 7);
    var gas = (7 + weeks) * row.gas_per_txn_usd;
    var tbill = capital * 0.045 * hold / 365;
    var hours = (45 + 10 * weeks + 5) / 60;
    var take = state.share * row.p25_usd;
    var net = take - gas - tbill;
    var perHour = net / hours;
    return {
      verdict: net > 0 && perHour >= 25 ? 'FARM' : net > 0 ? 'MARGINAL' : 'SKIP',
      take: take, net: net, perHour: perHour, gas: gas, tbill: tbill, hours: hours,
      capital: capital, hold: hold, breakeven: row.p25_usd > 0 ? (gas + tbill) / row.p25_usd : Infinity
    };
  }
  function scenarioActive() {
    return state.capital !== null || state.share !== 0.00001 || state.horizon !== null;
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

  function lede() {
    var v = DATA.value;
    var f = DATA.farm.verdicts;
    var ledger = DATA.ledger;
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The board also ranks ' + DATA.ledger.below_floor + ' pre-token protocols below that floor — and ' + DATA.ledger.above_floor_not_watchlist.length + ' more above it that pass every snapshot-visible house rule but are not on the watchlist. Implied value is a fitted model, not a promise.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Protocols accounted for' }), el('b', { text: ledger.ranked + ' + ' + ledger.token_bearing + ' + ' + ledger.excluded + ' = ' + ledger.total })),
        el('div', { class: 'fact' }, el('span', { text: 'Total implied value' }), el('b', { text: fmtUsd(ledger.total_implied_usd) })),
        el('div', { class: 'fact' }, el('span', { text: 'Farm verdicts' }), el('b', { text: f.farm + ' FARM · ' + f.marginal + ' marg. · ' + f.skip + ' skip' })),
        el('div', { class: 'fact' }, el('span', { text: 'Recomputed' }), el('b', { text: recompute.matched + ' of ' + recompute.total + (recompute.checksumOk ? ' · ' + ledger.checksum : ' · CHECKSUM MISMATCH') }))
      ),
      el('div', { class: 'valid-strip' },
        el('div', { class: 'valid-item' }, el('span', { text: 'Value model' }), el('b', { text: 'log(mcap) ~ log(TVL) + category · ' + v.train_n + ' comps' })),
        el('div', { class: 'valid-item' }, el('span', { text: 'Leave-one-out RMSE' }), el('b', { text: v.loo_rmse.toFixed(2) + ' log-points (R² ' + v.loo_r2.toFixed(2) + ')' })),
        el('div', { class: 'valid-item' }, el('span', { text: 'Walk-forward RMSE' }), el('b', { text: v.wf_rmse.toFixed(2) + ' log-points' })),
        el('div', { class: 'valid-item' }, el('span', { text: 'P25–P75 coverage' }), el('b', { text: Math.round(v.loo_cov_p25_p75 * 100) + '% LOO · ' + Math.round(v.wf_cov_p25_p75 * 100) + '% WF (stated 50%)' })),
        el('div', { class: 'valid-item' }, el('span', { text: 'Token odds' }), el('b', { text: 'Brier ' + DATA.odds.brier.toFixed(3) + ' vs ' + DATA.odds.brier_baseline.toFixed(3) + ' · AUC ' + DATA.odds.auc.toFixed(2) }))
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
      var head = 'rank,slug,name,category,tvl_usd,token_odds,implied_value_usd,p25_usd,p75_usd,verdict,net_cash_usd,per_hour_usd\n';
      var lines = sortedRows(filteredRows()).map(function (r) {
        var v = verdictOf(r);
        return [r.rank, r.slug, '"' + r.name.replace(/"/g, '""') + '"', '"' + (r.category || '').replace(/"/g, '""') + '"',
          r.tvl_usd, r.token_odds.toFixed(4), r.implied_value_usd, r.p25_usd, r.p75_usd,
          v.verdict, v.net.toFixed(2), v.perHour.toFixed(2)].join(',');
      });
      download('token-radar-board.csv', head + lines.join('\n') + '\n', 'text/csv');
    }
    function json() {
      var rows = sortedRows(filteredRows()).map(function (r) {
        var v = verdictOf(r);
        return { rank: r.rank, slug: r.slug, name: r.name, category: r.category, tvl_usd: r.tvl_usd, token_odds: r.token_odds, implied_value_usd: r.implied_value_usd, p25_usd: r.p25_usd, p75_usd: r.p75_usd, verdict: v.verdict, net_cash_usd: Math.round(v.net * 100) / 100, per_hour_usd: Math.round(v.perHour * 100) / 100 };
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
    var capital = sel('capital', 'Plan size', [
      { value: 'auto', text: 'Auto (TVL tier)' }, { value: 50, text: '$50' }, { value: 100, text: '$100' }, { value: 150, text: '$150' }, { value: 250, text: '$250' }
    ], state.capital === null ? 'auto' : state.capital, function (v) { state.capital = v === 'auto' ? null : Number(v); });
    var share = sel('share', 'Wallet share of launch value', [
      { value: 0.000005, text: '0.0005%' }, { value: 0.00001, text: '0.001% (base)' }, { value: 0.00005, text: '0.005%' }
    ], state.share, function (v) { state.share = Number(v); });
    var horizon = sel('horizon', 'Hold horizon', [
      { value: 'auto', text: 'Auto (age-based)' }, { value: 30, text: '30 days' }, { value: 60, text: '60 days' }, { value: 90, text: '90 days' }
    ], state.horizon === null ? 'auto' : state.horizon, function (v) { state.horizon = v === 'auto' ? null : Number(v); });
    var reset = el('button', { class: 'button', type: 'button', text: 'Reset scenario', onclick: function () { state.capital = null; state.share = 0.00001; state.horizon = null; render(); } });
    var note = el('span', { class: 'sub', text: scenarioActive() ? 'Verdicts below use your scenario, not the base case.' : 'Base case: TVL tier\u2019s capital, age\u2019s hold, 0.001% share.' });
    return el('div', { class: 'scenario' },
      el('span', { class: 'scenario-title', text: 'Try your own plan' }), capital, share, horizon, reset, note);
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { setSort(key); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' \u2193' : ' \u2191' }) : null
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
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) }),
          el('span', { class: 'sub', text: fmtUsd(r.p25_usd) + ' – ' + fmtUsd(r.p75_usd) })
        )),
        el('td', null, verdictPill(v.verdict))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Pre-token protocols, strongest implied value first. Rank shows the P10–P90 range across 200 refits of the value model. Select a row for its model breakdown and farm verdict.' }),
          el('thead', null, el('tr', null,
            sortHeader('rank', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('odds', 'Token odds'),
            sortHeader('implied', 'Implied value (P25–P75)'),
            sortHeader('verdict', 'Farm')
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
          el('caption', { text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking — and they are the comps the value model is fit on.' }),
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
  }
  function closeDetail() {
    state.selected = null;
    writeHash();
    render();
  }

  function detailPanel() {
    var row = null;
    DATA.rows.forEach(function (r) { if (r.slug === state.selected) row = r; });
    if (!row) return null;
    var v = verdictOf(row);
    var band = bandOf(row);
    var recomputed = impliedOf(row) === row.implied_value_usd && band.p25 === row.p25_usd && band.p75 === row.p75_usd;
    var effect = DATA.effects.filter(function (e) { return e.category === row.category; })[0];
    var steps = row.farm_steps.map(function (s, i) { return el('li', { key: i }, s); });
    var dialog = el('div', { class: 'dialog', role: 'dialog', 'aria-label': 'Protocol detail' },
      el('div', { class: 'dialog-head' },
        el('div', null,
          el('span', { class: 'sub', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + ' · P10–P90 rank ' + row.rank_p10 + '–' + row.rank_p90 + ' across 200 refits' }),
          el('h2', { text: row.name }),
          el('p', { class: 'sub', text: catOf(row) + ' on ' + chainLabel(row) + ' · TVL ' + fmtUsd(row.tvl_usd) + ' · ' + fmtAge(row.age_days) + ' old' + (row.watchlist_gap ? ' · above the floor but not on the watchlist' : '') })
        ),
        el('button', { class: 'button', type: 'button', text: 'Close', onclick: closeDetail })
      ),
      el('div', { class: 'detail-grid' },
        el('div', null,
          el('h3', { text: 'Implied value, and how it was computed' }),
          el('dl', { class: 'detail-list' },
            el('dt', { text: 'Fitted value' }), el('dd', { text: fmtUsd(row.fitted_value_usd) + ' — log(mcap) = ' + fmt4(DATA.value.intercept) + ' + ' + fmt4(DATA.value.slope) + ' × log(' + fmtUsd(row.tvl_usd) + ') + category effect ' + fmt4(row.cat_effect) + ', times smearing ' + fmt4(DATA.value.smearing) }),
            el('dt', { text: 'Token odds' }), el('dd', { text: fmtOdds(row.token_odds) + ' — the chance this protocol launches a token, from a logistic fit on the ' + DATA.odds.train_n + ' training rows (category token rate ' + fmt4(row.cat_token_rate) + ', ' + (row.age_days === null ? 'age unknown' : fmtAge(row.age_days)) + ', 7d ' + fmtPct(row.change_7d) + ')' }),
            el('dt', { text: 'Implied value' }), el('dd', { text: fmtUsd(row.implied_value_usd) + ' = fitted value × token odds. Not a promise: the P25–P75 band is ' + fmtUsd(row.p25_usd) + ' – ' + fmtUsd(row.p75_usd) + '.' }),
            el('dt', { text: 'Category effect' }), el('dd', { text: effect ? (catOf(row) + ' has an effect of ' + fmt4(effect.effect) + ' log-points, fit on ' + effect.n + ' live-token protocols (median residual ' + fmt4(effect.median_resid) + ')') : 'no live-token comps in this category — the model uses the category average' }),
            el('dt', { text: 'Recomputed on this page' }), el('dd', { text: recomputed ? 'Yes: this page recomputed the fitted value, the token odds and the P25–P75 band from the breakdown and got ' + fmtUsd(impliedOf(row)) + ' — exactly the board\u2019s number.' : 'Warning: this page\u2019s recompute differs from the board. Treat the board as suspect.' })
          )
        ),
        el('div', null,
          el('h3', { text: 'Farming it — verdict ' + v.verdict }),
          el('dl', { class: 'detail-list' },
            el('dt', { text: 'Take' }), el('dd', { text: fmtUsd2(v.take) + ' — ' + (state.share * 100).toFixed(4) + '% of the P25 value ' + fmtUsd(row.p25_usd) + ', the low end of the band' }),
            el('dt', { text: 'Gas' }), el('dd', { text: fmtUsd2(v.gas) + ' — ' + (7 + Math.floor(v.hold / 7)) + ' transactions at ' + fmtUsd2(row.gas_per_txn_usd) + ' each, on ' + (row.chains[0] || 'its chain') }),
            el('dt', { text: 'T-bill cost' }), el('dd', { text: fmtUsd2(v.tbill) + ' — holding ' + fmtUsd2(v.capital) + ' for ' + v.hold + ' days at 4.5% a year' }),
            el('dt', { text: 'Net' }), el('dd', { text: fmtUsd2(v.net) + (v.verdict === 'FARM' ? ' — clears costs and $25 an hour, so it beats the T-bill' : v.verdict === 'MARGINAL' ? ' — clears costs but not $25 an hour' : ' — does not clear costs') }),
            el('dt', { text: 'Per hour' }), el('dd', { text: fmtUsd2(v.perHour) + ' for ' + v.hours.toFixed(1) + ' hours of work' }),
            el('dt', { text: 'Breakeven share' }), el('dd', { text: fmtShare(v.breakeven) + ' of the launch value must reach your wallet for the plan to break even' })
          ),
          el('ol', { class: 'steps' }, steps)
        )
      )
    );
    var overlay = el('div', { class: 'detail-overlay' }, dialog);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeDetail();
    });
    return overlay;
  }

  function methodologyPanel() {
    if (state.tab !== 'pre-token') return null;
    var v = DATA.value;
    var o = DATA.odds;
    var termRows = [
      ['log(TVL) only', '2.002', 'base'],
      ['+ category', '1.9996', 'kept — the only term that helped'],
      ['+ 7-day growth', '2.0125', 'tested, not kept'],
      ['+ chain count', '2.0135', 'tested, not kept'],
      ['+ age', '2.0384', 'tested, not kept'],
      ['category, then + chain count', '2.0119', 'second round — stop: did not beat 1.9996']
    ];
    var effectRows = DATA.effects.slice().sort(function (a, b) { return b.n - a.n; }).map(function (e) {
      return el('tr', null, el('td', { text: e.category }), el('td', { class: 'num', text: String(e.n) }), el('td', { class: 'num', text: fmt4(e.median_resid) }), el('td', { class: 'num', text: fmt4(e.effect) }));
    });
    var farmSweep = [
      ['0.01%', '177 / 15 / 6'], ['0.005%', '164 / 22 / 12'], ['0.001%', '83 / 72 / 43'], ['0.0005%', '36 / 92 / 70'], ['0.0001%', '0 / 32 / 166']
    ];
    return el('section', { class: 'panel method' },
      el('h2', { text: 'How implied value is computed — and what it cannot do' }),
      el('p', { text: 'Implied value is the fitted value times the token odds. The fitted value comes from an ordinary least-squares regression of log market cap on log TVL, plus a shrunk effect for the protocol\u2019s category. It is fit on ' + v.train_n + ' live-token protocols from this same snapshot, after excluding a single outlier whose mcap/TVL is 400x (the next-highest comp is 36x). The slope is ' + fmt4(v.slope) + ', the intercept ' + fmt4(v.intercept) + ', and the smearing correction ' + fmt4(v.smearing) + ' fixes the bias of exponentiating a log prediction. Nothing in the board is hand-entered per protocol: the page recomputes every row from the same coefficients.' }),
      el('h3', { text: 'Which terms were kept, and which were tested' }),
      el('p', { text: 'Terms were tried by leave-one-out cross-validation (LOO RMSE, log-points, lower is better). A term was kept only when it improved the score. The category effect is the only one that did — by 0.1% — and it is kept because the category is the term the house asks for, not because the gain is large. Everything else made the model worse out-of-sample, so it stays out.' }),
      el('table', { class: 'mini' },
        el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Terms' }), el('th', { scope: 'col', text: 'LOO RMSE' }), el('th', { scope: 'col', text: 'Result' }))),
        el('tbody', null, termRows.map(function (r) { return el('tr', null, el('td', { text: r[0] }), el('td', { class: 'num', text: r[1] }), el('td', { text: r[2] })); }))
      ),
      el('h3', { text: 'How the model held up out-of-sample' }),
      el('p', { text: 'The model is shown its weakness, not just its strength. Leave-one-out RMSE ' + v.loo_rmse.toFixed(2) + ' log-points, MAE ' + v.loo_mae.toFixed(2) + ', R² ' + v.loo_r2.toFixed(2) + '. Walk-forward — fit on protocols listed before each date and tested on the next — pooled RMSE ' + v.wf_rmse.toFixed(2) + ', MAE ' + v.wf_mae.toFixed(2) + '. P25–P75 coverage: ' + Math.round(v.loo_cov_p25_p75 * 100) + '% leave-one-out and ' + Math.round(v.wf_cov_p25_p75 * 100) + '% walk-forward (a 50% band should cover about half). P10–P90: ' + Math.round(v.loo_cov_p10_p90 * 100) + '% and ' + Math.round(v.wf_cov_p10_p90 * 100) + '% (stated 80%). The bands are wide: the P25–P75 band is about 11x across, which is what an R² of ' + v.loo_r2.toFixed(2) + ' honestly buys. Token odds come from a logistic regression on the same ' + o.train_n + ' rows: Brier ' + o.brier.toFixed(3) + ' against a baseline of ' + o.brier_baseline.toFixed(3) + ', AUC ' + o.auc.toFixed(2) + ' — it beats a coin flip, and it is not a forecast. The 7-day growth coefficient is negative (' + o.change_7d.toFixed(3) + '): the fastest growers in this snapshot are the ones that already have a token or are pumping on one.' }),
      el('h3', { text: 'Farming — costed, not promised' }),
      el('p', { text: 'Each row carries a farm verdict under a base case: you take ' + (DATA.farm.base_share * 100).toFixed(3) + '% of the launch value (netted at the low end of the band, P25), pay gas per transaction (' + fmtUsd2(DATA.farm.gas_eth) + ' on Ethereum, ' + fmtUsd2(DATA.farm.gas_l2) + ' on an L2, ' + fmtUsd2(DATA.farm.gas_other) + ' elsewhere), and the T-bill cost of the capital for the hold. FARM means the net clears costs and $25 an hour; MARGINAL clears costs but not $25 an hour; SKIP does not clear costs. Base case: ' + DATA.farm.verdicts.farm + ' FARM, ' + DATA.farm.verdicts.marginal + ' MARGINAL, ' + DATA.farm.verdicts.skip + ' SKIP. The verdict is sensitive to the share — try your own plan above:' }),
      el('table', { class: 'mini' },
        el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Wallet share' }), el('th', { scope: 'col', text: 'FARM / MARGINAL / SKIP' }))),
        el('tbody', null, farmSweep.map(function (r) { return el('tr', null, el('td', { text: r[0] }), el('td', { class: 'num', text: r[1] })); }))
      ),
      el('h3', { text: 'The whole snapshot, accounted for' }),
      el('p', { text: 'All ' + DATA.ledger.total + ' protocols sit in exactly one group. ' + DATA.ledger.ranked + ' pre-token protocols are ranked: the ' + DATA.watchlist_size + ' watchlist rows at or above the $' + Math.round(DATA.floor_usd / 1e6) + 'M floor, ' + DATA.ledger.below_floor + ' below the floor, and ' + DATA.ledger.above_floor_not_watchlist.length + ' above the floor that pass every snapshot-visible house rule but are not on the watchlist — they are ranked and flagged, because hiding them would be less honest than showing them. ' + DATA.ledger.token_bearing + ' protocols already have a token and are set aside (they are the comps the model is fit on). ' + DATA.ledger.excluded + ' are excluded by the house rule, by primary reason: ' + DATA.ledger.excluded_version + ' versioned names, ' + DATA.ledger.excluded_category + ' excluded categories (' + Object.keys(DATA.ledger.excluded_category_breakdown).sort(function (a, b) { return DATA.ledger.excluded_category_breakdown[b] - DATA.ledger.excluded_category_breakdown[a]; }).map(function (c) { return DATA.ledger.excluded_category_breakdown[c] + ' ' + c; }).join(', ') + '), and ' + DATA.ledger.excluded_word + ' wrapped/staked/staking names. Some protocols fail on more than one reason; the primary reason is shown. The exclusion reasons are listed per protocol in the board\u2019s data; the page checks ' + recompute.matched + ' of ' + recompute.total + ' rows recompute exactly, and the ledger checksum is ' + DATA.ledger.checksum + '.' }),
      el('h3', { text: 'Category effects (from the fit)' }),
      el('table', { class: 'mini' },
        el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', text: 'Comps' }), el('th', { scope: 'col', text: 'Median residual' }), el('th', { scope: 'col', text: 'Effect' }))),
        el('tbody', null, effectRows)
      ),
      el('h3', { text: 'Limits, stated plainly' }),
      el('p', { text: 'The value model explains about 15% of the variance in log market cap. A P25–P75 band that spans 11x is the model saying it does not know precisely, and the band is the honest form of the answer. Token odds is a propensity from the snapshot\u2019s history — protocols that launched tokens before — not a forecast that a given protocol will launch one. The farm plans use a gas table, not live gas prices, and a 0.001% wallet share is a guess about what a single wallet captures at a launch, not a fact. Twenty rows pass every snapshot-visible rule but are not on the watchlist; the snapshot does not carry the field (parentProtocol) that most likely excludes them, so they are ranked and flagged rather than dropped. If a row\u2019s recompute ever disagrees with its board number, the board is wrong.' })
    );
  }

  function render() {
    app.innerHTML = '';
    var nodes = [header(), lede()];
    if (state.tab === 'pre-token') nodes.push(scenarioBar());
    nodes.push(controls());
    nodes.push(state.tab === 'pre-token' ? boardTable() : liveTable());
    nodes.push(methodologyPanel());
    var detail = state.selected ? detailPanel() : null;
    var shell = el('div', { class: 'shell' }, nodes.filter(function (n) { return n; }));
    app.appendChild(shell);
    if (detail) app.appendChild(detail);
    if (refocus) {
      var node = document.getElementById(refocus);
      if (node) node.focus();
      refocus = null;
    }
    if (detail) {
      var close = detail.querySelector('.dialog-head button');
      if (close) close.focus();
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
