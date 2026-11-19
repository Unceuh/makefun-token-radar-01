// Token Radar dashboard (model radar-2). It reads window.RADAR (data.js, written beside dashboard/
// by main.ts) and renders the ranked board, its filters, a per-protocol detail view with the model's
// own breakdown and the protocol's farm plan, and the methodology with the comps table. No network:
// every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', watchlist: false, tab: 'pre-token', sort: 'implied', dir: -1, selected: null };
  var refocus = null;

  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
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

  // == PURE MODEL (mirrors lib/model.ts) ==
  // Recomputes a row's implied value from the breakdown data.js carries. The comp multiple is the
  // row's own (lib/model.ts rounds it before pricing, so it is exact here); the growth, chain and
  // maturity multipliers are recomputed from the row's growth_pct, chain_count and age_days with the
  // model constants, because the multipliers data.js stores are rounded to four decimals and
  // multiplying them directly drifts from the board's number. Comps are never recomputed here:
  // data.js carries no raw snapshot, only each row's multiple.
  function impliedOf(row, model) {
    var base = row.tvl_usd * row.comp_multiple;
    var growthMult = 1 + (row.growth_pct / 100) * model.growth_weight;
    var chainMult = 1 + Math.min(model.chain_max, model.chain_step * Math.max(0, row.chain_count - 1));
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturityMult = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    return Math.max(1, Math.round(base * growthMult * chainMult * maturityMult));
  }
  // == END PURE MODEL ==

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
  function isWatchlist(r) { return r.tvl_usd >= DATA.floor_usd; }
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
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.watchlist) params.set('watchlist', '1');
    if (state.tab === 'live') params.set('tab', 'live');
    if (state.selected) params.set('p', state.selected);
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
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'rank') { av = a.rank; bv = b.rank; }
      else if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
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
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor. Implied value is a model, not a promise.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))
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
    var watch = el('input', { type: 'checkbox', id: 'watchlist', checked: state.watchlist ? 'checked' : null, disabled: state.tab === 'live' ? 'disabled' : null, 'aria-label': 'Watchlist only' });
    watch.addEventListener('change', function () { state.watchlist = watch.checked; refocus = 'watchlist'; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; writeHash(); render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; writeHash(); render(); } });
    var countText = state.tab === 'pre-token'
      ? filteredRows().length + ' of ' + DATA.board_size + ' rows'
      : filteredLive().length + ' of ' + DATA.live_size + ' live-token protocols';
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSelect),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      el('label', { class: 'check', for: 'watchlist' }, watch, 'Watchlist only'),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: countText })
    );
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
      el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.watchlist = false; writeHash(); render(); } })
    ));
  }

  function boardTable() {
    var list = sortedRows(filteredRows());
    if (list.length === 0) return emptyPanel('Clear the search or pick another category, chain or watchlist setting to see the board again.');
    var max = 1;
    list.forEach(function (r) { if (r.implied_value_usd > max) max = r.implied_value_usd; });
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: catOf(r) + ' on ' + chainLabel(r) })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Pre-token protocols, strongest implied value first. Select a row for its model breakdown and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('rank', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
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
          el('caption', { text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var noCompCats = Array.from(new Set(DATA.rows.filter(function (r) { return r.comp_n === 0; }).map(function (r) { return r.comp_category || 'Other'; }))).length;
    var formula = 'implied = round( TVL x comp x (1 + clamp(7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ')'
      + ' x (1 + min(' + m.chain_max + ', ' + m.chain_step + ' x max(0, chains - 1)))'
      + ' x (' + m.maturity_floor + ' + min(age, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') )';
    var compRows = DATA.comps.map(function (c) {
      return el('tr', null,
        el('td', { text: c.category || 'Other' }),
        el('td', { class: 'num', text: String(c.n) }),
        el('td', { class: 'num', text: fmt4(c.median) }),
        el('td', { class: 'num', text: fmt4(c.multiple) })
      );
    });
    compRows.push(el('tr', null,
      el('td', { text: 'Global fallback (no comps)' }),
      el('td', { class: 'num', text: '—' }),
      el('td', { class: 'num', text: fmt4(DATA.global_multiple) }),
      el('td', { class: 'num', text: fmt4(DATA.global_multiple) })
    ));
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula', text: formula }),
      el('p', { html: '<b>Comps.</b> The comp multiple is priced off the market: for each category, the median market-cap / TVL of the live-token protocols in it that already trade. A category with n comps leans on its own median with weight n / (n + ' + m.shrink_n + ') and on the global median (' + fmt4(DATA.global_multiple) + ') with the rest; the result is clamped to ' + m.comp_floor + '–' + m.comp_cap + ', so no thin category prices a token above its own TVL. ' + noCompCats + ' of the board\u2019s categories have no live-token comps at all and use the global median outright.' }),
      el('p', { html: '<b>Growth, chains, maturity.</b> Seven-day TVL growth is clamped to ' + m.growth_floor + '%…+' + m.growth_cap + '% and counts at half weight. Each chain past the first adds ' + (m.chain_step * 100) + '%, up to +' + (m.chain_max * 100) + '%. Maturity runs from ' + m.maturity_floor + ' for a protocol listed today to 1.0 after ' + m.maturity_days + ' days; an unknown listing date counts as ' + m.unknown_age_days + ' days.' }),
      el('p', { html: '<b>What \u201cno token\u201d means.</b> A protocol is shown as pre-token because its DefiLlama record carries no market cap, CoinGecko id or symbol. That is the snapshot\u2019s record, not proof that no token exists.' }),
      el('p', { html: '<b>Live tokens, set aside.</b> Protocols whose token already trades are shown with their market cap, which is a fact, not a model, and never enter the ranking.' }),
      el('p', { html: '<b>Farm plans.</b> Each plan is generated from the protocol\u2019s own category, chains, TVL and age — 21 category templates, no protocol name hard-coded — with what each step costs and how long it takes.' }),
      el('div', { class: 'panel' },
        el('div', { class: 'table-wrap comp-scroll' },
          el('table', null,
            el('caption', { text: 'Comp multiples by category: the live-token protocols each category is priced off.' }),
            el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', text: 'Live comps' }), el('th', { scope: 'col', text: 'Median mcap / TVL' }), el('th', { scope: 'col', text: 'Multiple applied' }))),
            el('tbody', null, compRows)
          )
        )
      )
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function parseStep(s) {
    var costAt = s.indexOf(' Cost: ');
    var timeAt = s.indexOf(' Time: ');
    if (costAt < 0) return { action: s, cost: '', time: '' };
    var cost = timeAt > costAt ? s.slice(costAt + 7, timeAt) : s.slice(costAt + 7);
    var time = timeAt >= 0 ? s.slice(timeAt + 7) : '';
    if (cost.charAt(cost.length - 1) === '.') cost = cost.slice(0, -1);
    if (time.charAt(time.length - 1) === '.') time = time.slice(0, -1);
    return { action: s.slice(0, costAt), cost: cost, time: time };
  }

  function kvRow(label, valueNode, rowClass) {
    return el('tr', { class: rowClass || null }, el('th', { scope: 'row', text: label }), el('td', null, valueNode));
  }

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var recomputed = impliedOf(row, DATA.model);
    var matches = recomputed === row.implied_value_usd;
    var compNote = row.comp_n === 0
      ? 'No live-token comps in this category — the global median is used.'
      : row.comp_n + ' live-token protocol' + (row.comp_n === 1 ? '' : 's') + ' in this category.';
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: catOf(row) + ' on ' + ((row.chains && row.chains.length) ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value — the breakdown' }),
      el('table', { class: 'kv' }, el('tbody', null,
        kvRow('Comparable category', el('span', { text: (row.comp_category || 'Other') + ' — ' + compNote })),
        kvRow('Live-token comps', el('span', { class: 'num', text: String(row.comp_n) })),
        kvRow('Category median mcap / TVL', el('span', { class: 'num', text: row.comp_median === null ? 'none' : fmt4(row.comp_median) })),
        kvRow('Comp multiple applied', el('span', { class: 'num', text: fmt4(row.comp_multiple) })),
        kvRow('Base value — TVL x multiple', el('span', { class: 'num', text: fmtUsd(row.base_value_usd) })),
        kvRow('7-day growth, clamped', el('span', { class: 'num', text: fmtPct(row.growth_pct) })),
        kvRow('Growth multiplier', el('span', { class: 'num', text: fmt4(row.growth_multiplier) })),
        kvRow('Chains', el('span', { class: 'num', text: String(row.chain_count) })),
        kvRow('Chain multiplier', el('span', { class: 'num', text: fmt4(row.chain_multiplier) })),
        kvRow('Age with no token', el('span', { class: 'num', text: fmtAge(row.age_days) + (row.age_days === null ? ' — counted as 365 days' : '') })),
        kvRow('Maturity multiplier', el('span', { class: 'num', text: fmt4(row.maturity_multiplier) })),
        kvRow('Implied value', el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }), 'total'),
        kvRow('Recomputed from this breakdown', el('span', { class: matches ? 'match-ok' : 'match-bad', text: fmtUsd(recomputed) + (matches ? ' — matches the board' : ' — differs from the board') }), 'total')
      )),
      el('p', { text: 'TVL ' + fmtUsd(row.tvl_usd) + ' · 7d ' + fmtPct(row.change_7d) + ' · listed ' + (row.listed_at || 'unknown') + '. Model ' + DATA.model_version + ': the same function scores every protocol. This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, (row.farm_steps || []).map(function (s) {
        var p = parseStep(s);
        var meta = [p.cost ? 'Cost: ' + p.cost : '', p.time ? 'Time: ' + p.time : ''].filter(function (x) { return x; }).join(' · ');
        return el('li', null, el('b', { text: p.action }), meta ? el('span', { class: 'cost', text: meta }) : null);
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
    if (refocus) {
      var f = document.getElementById(refocus);
      refocus = null;
      if (f) {
        f.focus();
        if (f.setSelectionRange && f.type === 'search') { var len = f.value.length; f.setSelectionRange(len, len); }
      }
    }
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
