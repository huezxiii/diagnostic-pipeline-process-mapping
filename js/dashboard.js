/*
 * dashboard.js: page controller for dashboard.html.
 * Holds filter state (mirrored to the URL hash), filters the decoded orders
 * through PipelineStats and renders KPI tiles, charts and the variants table.
 */
(function () {
  'use strict';

  const S = window.PipelineStats;
  const C = window.PipelineCharts;
  const $ = (sel) => document.querySelector(sel);

  if (!window.PIPELINE_DATA || !S || !C) {
    $('#data-banner').hidden = false;
    document.querySelectorAll('.chart-grid, #kpis, #controls').forEach((el) => { el.hidden = true; });
    return;
  }

  const bundle = window.PIPELINE_DATA;
  const metrics = bundle.metrics;
  const ALL = S.decode(bundle);
  const SCENARIOS = ['as_is', 'to_be'];
  const STAGE_LABEL = Object.fromEntries(metrics.stages.map((s) => [s.key, s.label]));
  const SCENARIO_N = { as_is: metrics.scenarios.as_is.n, to_be: metrics.scenarios.to_be.n };
  const DAILY_VOLUME = 3288; // 1.2M orders a year / 365
  const PRIORITY_LABEL = { stat_true: 'True STAT', stat_flagged: 'Flagged STAT', routine: 'Routine' };

  // Accessioning capacity (specimens/hour). As-Is: manual staffing, evening shift 30% thinner.
  const CAPACITY = {
    as_is: (h) => (h >= 7 && h < 15 ? 260 : h >= 15 && h < 23 ? 182 : 90),
    to_be: () => 1200, // optical sorter throughput
  };

  const DEFAULTS = { view: 'as_is', source: 'all', priority: 'all', facility: 'all' };
  const state = Object.assign({}, DEFAULTS, readHash());

  const fmtMin = (x) => (x == null ? '—' : x < 10 ? `${x.toFixed(1)} min` : C.fmt.min(x));

  // ---------- KPI tiles ----------
  const KPIS = [
    { key: 'meanTat', label: 'Average time to result', fmt: C.fmt.hours, good: 'down', note: 'Target under 5.0 h' },
    { key: 'p90Tat', label: 'Time for 9 in 10 orders', fmt: C.fmt.hours, good: 'down', note: 'The slowest 10% take longer' },
    { key: 'pce', label: 'Share of time doing real work', fmt: (x) => C.fmt.pct(x, 1), good: 'up', note: 'Hospitals aim for more than 15%' },
    { key: 'statRatio', label: 'Orders marked urgent', fmt: (x) => C.fmt.pct(x, 1), good: 'down', note: 'Target 8%' },
    { key: 'rekeyRate', label: 'Retyping errors', fmt: (x) => C.fmt.pct(x, 1), good: 'down', note: 'Mistakes at sample intake' },
    { key: 'rejectionRate', label: 'Samples rejected', fmt: (x) => C.fmt.pct(x, 1), good: 'down', note: 'Blood has to be drawn again' },
    { key: 'meanCriticalLag', label: 'Delay on dangerous results', fmt: fmtMin, good: 'down', note: 'From lab flag to doctor alert' },
  ];

  const ARROW_DOWN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M12 5v14M5 12l7 7 7-7"/></svg>';
  const ARROW_UP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';

  function renderKpis(sums) {
    const primary = state.view === 'as_is' ? 'as_is' : 'to_be';
    const s = sums[primary];
    const showDelta = primary === 'to_be';
    const html = KPIS.map((k) => {
      const value = s[k.key];
      let foot = `<p class="kpi-note">${k.note}</p>`;
      if (showDelta) {
        const before = sums.as_is[k.key];
        if (value != null && before) {
          const d = ((value - before) / before) * 100;
          const better = k.good === 'down' ? d < 0 : d > 0;
          const sign = d > 0 ? '+' : '−';
          foot = `<p class="kpi-was">was ${k.fmt(before)}</p>
            ${C.pairBars(before, value, `Before ${k.fmt(before)}, after ${k.fmt(value)}`).outerHTML}
            <p class="kpi-delta ${better ? 'good' : 'bad'}">${d < 0 ? ARROW_DOWN : ARROW_UP}
            ${sign}${Math.abs(d).toFixed(1)}% vs As-Is <span class="visually-hidden">(${better ? 'improvement' : 'worse'})</span></p>`;
        } else {
          foot = '<p class="kpi-note">No As-Is baseline for this filter</p>';
        }
      }
      return `<div class="kpi">
        <p class="kpi-label">${k.label}</p>
        <p class="kpi-value">${k.fmt(value)}</p>
        ${foot}
      </div>`;
    }).join('');
    $('#kpis').innerHTML = html;
  }

  // ---------- Charts ----------
  const shownScenarios = () => (state.view === 'compare' ? SCENARIOS : [state.view]);

  function stageChart(sums) {
    const labels = S.STAGE_KEYS.map((k) => STAGE_LABEL[k]);
    let datasets;
    if (state.view === 'compare') {
      datasets = SCENARIOS.map((sc) => ({
        label: C.SCENARIO[sc].label,
        data: S.STAGE_KEYS.map((k) => sums[sc].stageMeans[k]),
        backgroundColor: C.SCENARIO[sc].color,
      }));
      $('#stage-sub').textContent = 'Mean minutes per stage, As-Is vs To-Be. Testing includes the 42-minute analyzer run.';
    } else {
      const s = sums[state.view];
      datasets = [
        {
          label: 'Queue / non-value-added',
          data: S.STAGE_KEYS.map((k) => s.stageWaits[k]),
          backgroundColor: C.SCENARIO[state.view].color,
          borderRadius: (ctx) => (S.STAGE_KEYS[ctx.dataIndex] === 'testing' ? 0 : 4),
        },
        {
          label: 'Value-added (analyzer run)',
          data: S.STAGE_KEYS.map((k) => (k === 'testing' ? s.meanVa : 0)),
          backgroundColor: C.COLORS.va,
          borderColor: C.COLORS.surface,
          borderWidth: { left: 2, top: 0, right: 0, bottom: 0 },
          borderSkipped: false,
          borderRadius: { topRight: 4, bottomRight: 4 },
        },
      ];
      $('#stage-sub').textContent = 'Mean minutes per stage. Only the analyzer run inside testing adds value.';
    }
    const primary = state.view === 'to_be' ? 'to_be' : 'as_is';
    const waits = sums[primary].stageWaits;
    const top = S.STAGE_KEYS.reduce((a, k) => ((waits[k] ?? -1) > (waits[a] ?? -1) ? k : a), S.STAGE_KEYS[0]);
    $('#stages-takeaway').textContent = `Biggest queue: ${STAGE_LABEL[top]}, ${fmtMin(waits[top])} on average${state.view === 'compare' ? ' before the redesign' : ''}.`;
    C.render('c-stages', {
      type: 'bar',
      data: { labels, datasets },
      options: {
        indexAxis: 'y',
        scales: C.axes({ horizontal: true, stacked: state.view !== 'compare', valueTitle: 'Minutes', grace: '18%' }),
        plugins: {
          tooltip: { filter: (item) => item.raw !== 0 },
          callout: { datasetIndex: 0, index: S.STAGE_KEYS.indexOf(top), text: 'Biggest queue' },
        },
      },
    }, fmtMin);
  }

  function histogramChart(sets) {
    const BIN = 60;
    const MAX = 48 * 60;
    let edges = [];
    const datasets = shownScenarios().map((sc) => {
      const h = S.histogram(sets[sc].map((o) => o.tat), BIN, MAX);
      edges = h.edges;
      const n = sets[sc].length || 1;
      return {
        label: C.SCENARIO[sc].label,
        data: h.counts.map((c) => (c / n) * 100),
        backgroundColor: C.SCENARIO[sc].color,
        borderColor: C.COLORS.surface,
        borderWidth: { left: 1, right: 1, top: 0, bottom: 0 },
        maxBarThickness: 18,
      };
    });
    const labels = edges.map((e, i) => (i === edges.length - 1 ? `${e / 60}+` : `${e / 60}`));
    C.render('c-hist', {
      type: 'bar',
      data: { labels, datasets },
      options: {
        scales: (() => {
          const a = C.axes({ valueTitle: 'Share of orders (%)', tickFormat: (v) => `${v}%` });
          a.x.title = { display: true, text: 'Hours from order to verified result', color: C.COLORS.muted, font: { size: 11 } };
          a.x.ticks.autoSkip = true;
          a.x.ticks.maxTicksLimit = 13;
          return a;
        })(),
        plugins: {
          legend: { display: datasets.length > 1 },
          tooltip: {
            callbacks: {
              title: (items) => {
                const i = items[0].dataIndex;
                return i === edges.length - 1 ? `${edges[i] / 60}+ hours` : `${edges[i] / 60}–${edges[i] / 60 + 1} hours`;
              },
            },
          },
        },
      },
    }, (x) => C.fmt.pctPoints(x, 1));
    const within6h = (sc) => {
      const n = sets[sc].length;
      return n ? sets[sc].filter((o) => o.tat <= 360).length / n : null;
    };
    const shown = shownScenarios();
    $('#hist-takeaway').textContent = shown.length > 1
      ? `Results within 6 hours: ${C.fmt.pct(within6h('as_is'), 0)} of orders before the redesign, ${C.fmt.pct(within6h('to_be'), 0)} after.`
      : `${C.fmt.pct(within6h(shown[0]), 0)} of orders get a result within 6 hours.`;
  }

  function arrivalsChart(sets) {
    const hours = Array.from({ length: 24 }, (_, h) => h);
    const labels = hours.map((h) => String(h).padStart(2, '0'));
    const datasets = shownScenarios().map((sc) => ({
      type: 'bar',
      label: `${C.SCENARIO[sc].label} arrivals`,
      data: S.arrivalsByHour(sets[sc]).map((c) => (c / SCENARIO_N[sc]) * DAILY_VOLUME),
      backgroundColor: C.SCENARIO[sc].color,
      order: 2,
    }));
    const capScenario = state.view === 'to_be' ? 'to_be' : 'as_is';
    datasets.push({
      type: 'line',
      label: capScenario === 'as_is' ? 'Staffed capacity (manual)' : 'Sorter capacity (1,200/h)',
      data: hours.map(CAPACITY[capScenario]),
      borderColor: C.COLORS.ink,
      backgroundColor: C.COLORS.ink,
      stepped: 'middle',
      pointStyle: 'line',
      order: 1,
    });
    $('#arrival-sub').textContent = capScenario === 'as_is'
      ? 'Specimens reaching the central dock per hour on a typical day (3,288 orders), against staffed capacity. The evening shift is 30% thinner.'
      : 'Specimens reaching the central dock per hour on a typical day, against optical-sorter throughput.';
    C.render('c-arrivals', {
      type: 'bar',
      data: { labels, datasets },
      options: {
        interaction: { mode: 'index', intersect: false },
        scales: (() => {
          const a = C.axes({ valueTitle: 'Specimens per hour' });
          a.x.title = { display: true, text: 'Hour of arrival', color: C.COLORS.muted, font: { size: 11 } };
          a.x.ticks.autoSkip = true;
          a.x.ticks.maxTicksLimit = 12;
          return a;
        })(),
        plugins: { tooltip: { callbacks: { title: (items) => `${items[0].label}:00–${items[0].label}:59` } } },
      },
    }, (x) => (x == null ? '—' : `${Math.round(x).toLocaleString('en-US')} / h`));
    const capacity = hours.map(CAPACITY[capScenario]);
    const arrivals = S.arrivalsByHour(sets[capScenario]).map((c) => (c / SCENARIO_N[capScenario]) * DAILY_VOLUME);
    const over = hours.filter((h) => arrivals[h] > capacity[h]);
    const peak = hours.reduce((a, h) => (arrivals[h] > arrivals[a] ? h : a), 0);
    $('#arrivals-takeaway').textContent = over.length
      ? `Arrivals outrun intake capacity in ${over.length} of 24 hours, peaking at ${Math.round(arrivals[peak]).toLocaleString('en-US')} samples an hour around ${String(peak).padStart(2, '0')}:00.`
      : 'Arrivals stay below intake capacity in every hour of the day.';
  }

  function priorityChart(sets) {
    const labels = S.PRIORITIES.map((p) => PRIORITY_LABEL[p]);
    const datasets = shownScenarios().map((sc) => {
      const pb = S.priorityBreakdown(sets[sc]);
      return {
        label: C.SCENARIO[sc].label,
        data: S.PRIORITIES.map((p) => pb[p].meanTestingWait),
        backgroundColor: C.SCENARIO[sc].color,
      };
    });
    const primary = state.view === 'to_be' ? 'to_be' : 'as_is';
    const pb = S.priorityBreakdown(sets[primary]);
    const waitsBy = S.PRIORITIES.map((p) => pb[p].meanTestingWait);
    const trueWait = pb.stat_true.meanTestingWait;
    const flagged = pb.stat_flagged.meanTestingWait;
    const inverted = trueWait != null && waitsBy.every((w) => w == null || w <= trueWait);
    if (trueWait == null || flagged == null) $('#priority-takeaway').textContent = '';
    else if (inverted) $('#priority-takeaway').textContent = `Priority is upside down: real emergencies wait ${fmtMin(trueWait)} for testing, longer than routine orders tagged urgent (${fmtMin(flagged)}).`;
    else $('#priority-takeaway').textContent = `Real emergencies wait ${fmtMin(trueWait)} for testing; routine orders tagged urgent wait ${fmtMin(flagged)}.`;
    C.render('c-priority', {
      type: 'bar',
      data: { labels, datasets },
      options: {
        scales: C.axes({ valueTitle: 'Testing-queue wait (min)', grace: '15%' }),
        plugins: {
          legend: { display: datasets.length > 1 },
          callout: inverted ? { datasetIndex: 0, index: S.PRIORITIES.indexOf('stat_true'), text: 'Longest wait' } : false,
        },
      },
    }, fmtMin);
  }

  function paretoChart(sums) {
    const primary = state.view === 'to_be' ? 'to_be' : 'as_is';
    const rows = S.wastePareto(sums[primary]);
    if (!rows.length) return C.setEmpty('c-pareto', true);
    const cumulative = Object.fromEntries(rows.map((r) => [r.stage, r.cumulativeShare]));
    const datasets = shownScenarios().map((sc) => ({
      label: C.SCENARIO[sc].label,
      data: rows.map((r) => sums[sc].stageWaits[r.stage]),
      backgroundColor: C.SCENARIO[sc].color,
    }));
    C.render('c-pareto', {
      type: 'bar',
      data: { labels: rows.map((r) => STAGE_LABEL[r.stage]), datasets },
      options: {
        indexAxis: 'y',
        scales: C.axes({ horizontal: true, valueTitle: 'Non-value-added minutes' }),
        plugins: {
          legend: { display: datasets.length > 1 },
          tooltip: {
            callbacks: {
              afterBody: (items) => {
                const stage = rows[items[0].dataIndex].stage;
                return `Cumulative ${C.SCENARIO[primary].label} waste: ${C.fmt.pct(cumulative[stage], 0)}`;
              },
            },
          },
        },
      },
    }, fmtMin);
  }

  function defectChart(sums) {
    const labels = ['Re-key error', 'Specimen rejection', 'Manual exception'];
    const datasets = shownScenarios().map((sc) => {
      const s = sums[sc];
      return {
        label: C.SCENARIO[sc].label,
        data: [s.rekeyRate, s.rejectionRate, s.exceptionRate].map((x) => (x == null ? null : x * 100)),
        backgroundColor: C.SCENARIO[sc].color,
      };
    });
    C.render('c-defects', {
      type: 'bar',
      data: { labels, datasets },
      options: {
        scales: C.axes({ valueTitle: 'Share of orders (%)', tickFormat: (v) => `${v}%` }),
        plugins: { legend: { display: datasets.length > 1 } },
      },
    }, (x) => C.fmt.pctPoints(x, 1));
  }

  function variantsTable(sets) {
    const shown = shownScenarios();
    const breakdowns = Object.fromEntries(shown.map((sc) => [sc, S.variantBreakdown(sets[sc])]));
    const head = shown.map((sc) => `<th class="num">${C.SCENARIO[sc].label} orders</th><th class="num">Share</th><th class="num">Mean TAT</th>`).join('');
    const body = S.VARIANTS.map((variant, i) => `<tr><td>${variant}</td>${shown.map((sc) => {
      const r = breakdowns[sc][i];
      return `<td class="num">${C.fmt.int(r.n)}</td><td class="num">${C.fmt.pct(r.share, 1)}</td><td class="num">${C.fmt.hours(r.meanTat)}</td>`;
    }).join('')}</tr>`).join('');
    $('#variants').innerHTML = `<table class="data"><thead><tr><th>Path</th>${head}</tr></thead><tbody>${body}</tbody></table>`;
  }

  // ---------- Render ----------
  const CHART_IDS = ['c-stages', 'c-hist', 'c-arrivals', 'c-priority', 'c-pareto', 'c-defects'];

  function render() {
    syncControls();
    writeHash();
    const filters = { source: state.source, priority: state.priority, facility: state.facility };
    const sets = {};
    const sums = {};
    for (const sc of SCENARIOS) {
      sets[sc] = S.filterOrders(ALL, Object.assign({ scenario: sc }, filters));
      sums[sc] = S.summarize(sets[sc]);
    }
    const shown = shownScenarios();
    $('#result-count').textContent = shown
      .map((sc) => `${C.fmt.int(sets[sc].length)} ${C.SCENARIO[sc].label} orders`)
      .join(' · ');

    renderKpis(sums);
    variantsTable(sets);

    if (shown.every((sc) => sets[sc].length === 0)) {
      CHART_IDS.forEach((id) => C.setEmpty(id, true));
      document.querySelectorAll('.chart-takeaway').forEach((p) => { p.textContent = ''; });
      return;
    }
    stageChart(sums);
    histogramChart(sets);
    arrivalsChart(sets);
    priorityChart(sets);
    paretoChart(sums);
    defectChart(sums);
  }

  // ---------- Controls & URL state ----------
  function readHash() {
    const p = new URLSearchParams(location.hash.slice(1));
    const out = {};
    for (const key of Object.keys(DEFAULTS)) if (p.get(key)) out[key] = p.get(key);
    return out;
  }

  function writeHash() {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(state)) if (v !== DEFAULTS[k]) p.set(k, v);
    const hash = p.toString();
    history.replaceState(null, '', hash ? `#${hash}` : location.pathname + location.search);
  }

  function syncControls() {
    document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === state.view)));
    $('#f-source').value = state.source;
    $('#f-priority').value = state.priority;
    $('#f-facility').value = state.facility;
  }

  function buildFacilityOptions() {
    const select = $('#f-facility');
    const groups = [['Hospitals (ED & inpatient)', 'H'], ['Outpatient clinics', 'C']];
    for (const [label, prefix] of groups) {
      const og = document.createElement('optgroup');
      og.label = label;
      bundle.dict.facility.filter((f) => f.startsWith(prefix)).forEach((f) => og.appendChild(new Option(f, f)));
      select.appendChild(og);
    }
  }

  function sanitizeState() {
    if (!['as_is', 'to_be', 'compare'].includes(state.view)) state.view = DEFAULTS.view;
    if (!['all', ...bundle.dict.source].includes(state.source)) state.source = 'all';
    if (!['all', ...bundle.dict.priority].includes(state.priority)) state.priority = 'all';
    if (!['all', ...bundle.dict.facility].includes(state.facility)) state.facility = 'all';
  }

  buildFacilityOptions();
  sanitizeState();

  document.querySelectorAll('[data-view]').forEach((btn) => btn.addEventListener('click', () => {
    state.view = btn.dataset.view;
    render();
  }));
  [['#f-source', 'source'], ['#f-priority', 'priority'], ['#f-facility', 'facility']].forEach(([sel, key]) => {
    $(sel).addEventListener('change', (e) => {
      state[key] = e.target.value;
      render();
    });
  });
  $('#reset').addEventListener('click', () => {
    Object.assign(state, DEFAULTS, { view: state.view });
    render();
  });

  C.wireTableToggles();
  render();
})();
