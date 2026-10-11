// Tests for js/stats.js, the client-side aggregation engine behind the dashboard.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const S = require('../js/stats.js');

// Two As-Is orders and two To-Be orders, hand-checkable.
const fixture = {
  dict: {
    scenario: ['as_is', 'to_be'],
    source: ['ED', 'inpatient', 'outpatient'],
    priority: ['stat_true', 'stat_flagged', 'routine'],
    facility: ['C01', 'H01'],
  },
  cols: {
    sc:   [0, 0, 1, 1],
    src:  [0, 2, 0, 2],
    pri:  [0, 2, 0, 2],
    fac:  [1, 0, 1, 0],
    ch:   [9, 10, 9, 10],
    ah:   [16, 17, 11, 12],
    otd:  [10, 20, 5, 5],
    hold: [10, 100, 5, 20],
    trn:  [10, 50, 5, 10],
    exc:  [0, 600, 0, 0],
    acc:  [100, 300, 5, 5],
    tst:  [70, 50, 42, 50],
    ver:  [100, 80, 38, 10],
    va:   [40, 40, 40, 40],
    ef:   [0, 1, 0, 0],
    rk:   [1, 0, 0, 0],
    rj:   [0, 1, 0, 0],
    cr:   [1, 0, 1, 0],
    lag:  [50, null, 4, null],
  },
};

const orders = S.decode(fixture);

test('decode builds order objects with total TAT', () => {
  assert.equal(orders.length, 4);
  const o = orders[1];
  assert.equal(o.scenario, 'as_is');
  assert.equal(o.source, 'outpatient');
  assert.equal(o.priority, 'routine');
  assert.equal(o.facility, 'C01');
  assert.equal(o.arrivalHour, 17);
  assert.equal(o.stages.exception_hold, 600);
  assert.equal(o.tat, 20 + 100 + 50 + 600 + 300 + 50 + 80);
  assert.equal(o.lag, null);
});

test('filterOrders treats "all" and undefined as no filter', () => {
  assert.equal(S.filterOrders(orders, { scenario: 'as_is' }).length, 2);
  assert.equal(S.filterOrders(orders, { scenario: 'all', source: 'ED' }).length, 2);
  assert.equal(S.filterOrders(orders, { scenario: 'to_be', priority: 'routine', facility: 'C01' }).length, 1);
  assert.equal(S.filterOrders(orders, {}).length, 4);
});

test('mean and percentile', () => {
  assert.equal(S.mean([1, 2, 3, 4]), 2.5);
  assert.equal(S.mean([]), null);
  assert.equal(S.percentile([1, 2, 3, 4, 5], 0.5), 3);
  assert.equal(S.percentile([10, 20], 0.9), 19); // linear interpolation, pandas default
  assert.equal(S.percentile([], 0.9), null);
});

test('summarize computes KPIs', () => {
  const s = S.summarize(S.filterOrders(orders, { scenario: 'as_is' }));
  assert.equal(s.n, 2);
  assert.equal(s.meanTat, (300 + 1200) / 2);
  assert.equal(s.meanVa, 40);
  assert.equal(s.pce, 40 / 750);
  assert.equal(s.statRatio, 0.5);
  assert.equal(s.rekeyRate, 0.5);
  assert.equal(s.rejectionRate, 0.5);
  assert.equal(s.exceptionRate, 0.5);
  assert.equal(s.meanCriticalLag, 50);
  assert.equal(s.stageMeans.accessioning, 200);
  assert.equal(s.stageWaits.testing, (30 + 10) / 2);
  const totalWait = Object.values(s.stageWaits).reduce((a, b) => a + b, 0);
  assert.equal(totalWait, s.meanTat - s.meanVa);
});

test('summarize on empty input returns nulls, never NaN', () => {
  const s = S.summarize([]);
  assert.equal(s.n, 0);
  for (const key of ['meanTat', 'p90Tat', 'pce', 'statRatio', 'rekeyRate', 'meanCriticalLag']) {
    assert.equal(s[key], null, key);
  }
  for (const v of Object.values(s.stageMeans)) assert.equal(v, null);
});

test('compare returns percentage deltas and guards nulls', () => {
  const c = S.compare({ meanTat: 1000, pce: 0.04 }, { meanTat: 250, pce: 0.16 });
  assert.equal(c.meanTat.deltaPct, -75);
  assert.ok(Math.abs(c.pce.deltaPct - 300) < 1e-9);
  const n = S.compare({ meanTat: null }, { meanTat: 5 });
  assert.equal(n.meanTat.deltaPct, null);
});

test('histogram bins with overflow bucket', () => {
  const h = S.histogram([0, 5, 59, 60, 61, 500], 60, 180);
  assert.deepEqual(h.edges, [0, 60, 120, 180]);
  assert.deepEqual(h.counts, [3, 2, 0, 1]);
});

test('arrivalsByHour counts 24 buckets', () => {
  const a = S.arrivalsByHour(orders);
  assert.equal(a.length, 24);
  assert.equal(a[16], 1);
  assert.equal(a.reduce((x, y) => x + y, 0), 4);
});

test('priorityBreakdown reports testing wait per class', () => {
  const p = S.priorityBreakdown(S.filterOrders(orders, { scenario: 'as_is' }));
  assert.equal(p.stat_true.n, 1);
  assert.equal(p.stat_true.meanTestingWait, 30);
  assert.equal(p.stat_flagged.n, 0);
  assert.equal(p.stat_flagged.meanTestingWait, null);
});

test('wastePareto sorts stages and accumulates share', () => {
  const s = S.summarize(S.filterOrders(orders, { scenario: 'as_is' }));
  const p = S.wastePareto(s);
  assert.equal(p[0].stage, 'exception_hold');
  assert.ok(Math.abs(p[p.length - 1].cumulativeShare - 1) < 1e-9);
  assert.deepEqual(S.wastePareto(S.summarize([])), []);
});

test('summarize on the real bundle matches metrics.json', () => {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'data.js'), 'utf8'), ctx);
  const bundle = ctx.window.PIPELINE_DATA;
  const all = S.decode(bundle);
  for (const scenario of ['as_is', 'to_be']) {
    const s = S.summarize(S.filterOrders(all, { scenario }));
    const m = bundle.metrics.scenarios[scenario];
    assert.equal(s.n, m.n);
    assert.ok(Math.abs(s.meanTat - m.mean_tat) < 0.5, `${scenario} meanTat ${s.meanTat}`);
    assert.ok(Math.abs(s.pce - m.pce) < 0.001);
    assert.ok(Math.abs(s.statRatio - m.stat_ratio) < 1e-9);
    assert.ok(Math.abs(s.rekeyRate - m.rekey_error_rate) < 1e-9);
    assert.ok(Math.abs(s.p90Tat - m.p90_tat) < 1);
  }
});
