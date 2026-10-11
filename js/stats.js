/*
 * stats.js: pure aggregation engine for the diagnostic pipeline dashboard.
 * No DOM access. Works in the browser (window.PipelineStats) and in Node (require).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PipelineStats = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const STAGE_KEYS = [
    'order_to_draw', 'clinic_hold', 'transport', 'exception_hold',
    'accessioning', 'testing', 'verify_sync',
  ];
  const STAGE_COLS = {
    order_to_draw: 'otd', clinic_hold: 'hold', transport: 'trn', exception_hold: 'exc',
    accessioning: 'acc', testing: 'tst', verify_sync: 'ver',
  };
  const PRIORITIES = ['stat_true', 'stat_flagged', 'routine'];

  /** Expand the columnar bundle into one object per order. */
  function decode(bundle) {
    const { dict, cols } = bundle;
    const n = cols.sc.length;
    const orders = new Array(n);
    for (let i = 0; i < n; i++) {
      const stages = {};
      let tat = 0;
      for (const key of STAGE_KEYS) {
        const v = cols[STAGE_COLS[key]][i];
        stages[key] = v;
        tat += v;
      }
      orders[i] = {
        scenario: dict.scenario[cols.sc[i]],
        source: dict.source[cols.src[i]],
        priority: dict.priority[cols.pri[i]],
        facility: dict.facility[cols.fac[i]],
        collectedHour: cols.ch[i],
        arrivalHour: cols.ah[i],
        stages,
        tat,
        va: cols.va[i],
        exception: cols.ef[i],
        rekey: cols.rk[i],
        rejected: cols.rj[i],
        critical: cols.cr[i],
        lag: cols.lag[i],
      };
    }
    return orders;
  }

  /** Keep orders matching every set filter; 'all' or undefined means no filter. */
  function filterOrders(orders, filters) {
    const active = Object.entries(filters || {}).filter(([, v]) => v !== undefined && v !== 'all');
    if (!active.length) return orders.slice();
    return orders.filter((o) => active.every(([k, v]) => o[k] === v));
  }

  function mean(values) {
    if (!values.length) return null;
    let sum = 0;
    for (const v of values) sum += v;
    return sum / values.length;
  }

  /** Linear-interpolated percentile (matches pandas' default). p in [0, 1]. */
  function percentile(values, p) {
    if (!values.length) return null;
    const sorted = Float64Array.from(values).sort();
    const idx = p * (sorted.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  }

  function rate(orders, key) {
    return orders.length ? orders.reduce((a, o) => a + o[key], 0) / orders.length : null;
  }

  /** Headline KPIs, stage means and per-stage non-value-added wait for a set of orders. */
  function summarize(orders) {
    const n = orders.length;
    const tats = orders.map((o) => o.tat);
    const meanTat = mean(tats);
    const meanVa = mean(orders.map((o) => o.va));
    const stageMeans = {};
    const stageWaits = {};
    for (const key of STAGE_KEYS) {
      stageMeans[key] = mean(orders.map((o) => o.stages[key]));
      stageWaits[key] = stageMeans[key];
    }
    stageWaits.testing = mean(orders.map((o) => o.stages.testing - o.va));
    const crit = orders.filter((o) => o.critical === 1 && o.lag !== null).map((o) => o.lag);
    return {
      n,
      meanTat,
      medianTat: percentile(tats, 0.5),
      p90Tat: percentile(tats, 0.9),
      meanVa,
      pce: n ? meanVa / meanTat : null,
      statRatio: n ? orders.filter((o) => o.priority !== 'routine').length / n : null,
      rekeyRate: rate(orders, 'rekey'),
      rejectionRate: rate(orders, 'rejected'),
      exceptionRate: rate(orders, 'exception'),
      meanCriticalLag: mean(crit),
      stageMeans,
      stageWaits,
    };
  }

  /** Percentage change from before to after for every shared numeric key. */
  function compare(before, after) {
    const out = {};
    for (const key of Object.keys(before)) {
      const b = before[key];
      const a = after[key];
      if (typeof b === 'object' && b !== null) continue;
      const ok = typeof a === 'number' && typeof b === 'number' && b !== 0;
      out[key] = { before: b, after: a, deltaPct: ok ? ((a - b) / b) * 100 : null };
    }
    return out;
  }

  /** Fixed-width bins from 0; the last bucket collects everything >= maxValue. */
  function histogram(values, binWidth, maxValue) {
    const edges = [];
    for (let e = 0; e <= maxValue; e += binWidth) edges.push(e);
    const counts = new Array(edges.length).fill(0);
    for (const v of values) {
      const i = Math.min(Math.floor(v / binWidth), edges.length - 1);
      counts[Math.max(i, 0)]++;
    }
    return { edges, counts };
  }

  function arrivalsByHour(orders) {
    const counts = new Array(24).fill(0);
    for (const o of orders) counts[o.arrivalHour]++;
    return counts;
  }

  function priorityBreakdown(orders) {
    const out = {};
    for (const p of PRIORITIES) {
      const subset = orders.filter((o) => o.priority === p);
      const waits = subset.map((o) => o.stages.testing - o.va);
      out[p] = {
        n: subset.length,
        meanTat: mean(subset.map((o) => o.tat)),
        meanTestingWait: mean(waits),
        medianTestingWait: percentile(waits, 0.5),
      };
    }
    return out;
  }

  /** Stages sorted by non-value-added minutes, with cumulative share of total waste. */
  function wastePareto(summary) {
    if (!summary.n) return [];
    const rows = STAGE_KEYS.map((stage) => ({ stage, minutes: summary.stageWaits[stage] }))
      .sort((a, b) => b.minutes - a.minutes);
    const total = rows.reduce((a, r) => a + r.minutes, 0);
    let running = 0;
    for (const r of rows) {
      running += r.minutes;
      r.cumulativeShare = total ? running / total : 0;
    }
    return rows;
  }

  const VARIANTS = ['Clean path', 'Re-key correction', 'Exception resolved', 'Rejected, re-collected'];

  /** Process path variants (same rules as the Python mining script and SQL suite). */
  function variantBreakdown(orders) {
    const groups = VARIANTS.map(() => []);
    for (const o of orders) {
      const i = o.rejected ? 3 : o.exception ? 2 : o.rekey ? 1 : 0;
      groups[i].push(o.tat);
    }
    return VARIANTS.map((variant, i) => ({
      variant,
      n: groups[i].length,
      share: orders.length ? groups[i].length / orders.length : null,
      meanTat: mean(groups[i]),
    }));
  }

  return {
    STAGE_KEYS, PRIORITIES, VARIANTS, decode, filterOrders, mean, percentile, summarize,
    compare, histogram, arrivalsByHour, priorityBreakdown, wastePareto, variantBreakdown,
  };
});
