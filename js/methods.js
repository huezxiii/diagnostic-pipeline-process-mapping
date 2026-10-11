/*
 * methods.js: page controller for methods.html.
 * Fills calibration results from metrics.json, builds the bottleneck table and
 * renders every SQL query beside the result captured by analysis/run_sql.py.
 */
(function () {
  'use strict';

  const metrics = window.PIPELINE_DATA && window.PIPELINE_DATA.metrics;
  const sql = window.SQL_RESULTS;
  const MAX_ROWS = 10;

  const FORMATS = {
    hours2: (x) => `${(x / 60).toFixed(2)} h`,
    pct: (x) => `${(x * 100).toFixed(1)}%`,
    pct2: (x) => `${(x * 100).toFixed(2)}%`,
    min1: (x) => `${x.toFixed(1)} min`,
  };

  const el = (tag, props = {}, children = []) => {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...children);
    return node;
  };

  const cellText = (v) => {
    if (v == null) return '—';
    if (typeof v === 'number') return v.toLocaleString('en-US', { maximumFractionDigits: 2 });
    return String(v);
  };

  function table(columns, rows, numeric) {
    const thead = el('thead', {}, [el('tr', {}, columns.map((c, i) => el('th', { textContent: c, className: numeric(i) ? 'num' : '' })))]);
    const tbody = el('tbody', {}, rows.map((r) => el('tr', {}, r.map((v, i) => el('td', { textContent: cellText(v), className: numeric(i) ? 'num' : '' })))));
    return el('table', { className: 'data' }, [thead, tbody]);
  }

  function bindMetrics() {
    if (!metrics) return;
    document.querySelectorAll('[data-metric]').forEach((node) => {
      const value = node.dataset.metric.split('.').reduce((o, k) => (o == null ? undefined : o[k]), metrics);
      const format = FORMATS[node.dataset.fmt];
      if (typeof value === 'number' && format) node.textContent = format(value);
    });
  }

  function miningTable() {
    const host = document.getElementById('mining-table');
    if (!metrics) {
      host.textContent = 'metrics.json bundle unavailable.';
      return;
    }
    const label = Object.fromEntries(metrics.stages.map((s) => [s.key, s.label]));
    const toBe = Object.fromEntries(metrics.scenarios.to_be.bottlenecks.map((b) => [b.stage, b]));
    const rows = metrics.scenarios.as_is.bottlenecks.map((b) => [
      b.rank, label[b.stage], b.mean_wait.toFixed(1), `${(b.share_of_nva * 100).toFixed(1)}%`,
      toBe[b.stage].mean_wait.toFixed(1), toBe[b.stage].rank,
    ]);
    host.replaceChildren(table(['Rank', 'Stage', 'As-Is min', 'Share of waste', 'To-Be min', 'To-Be rank'], rows, (i) => i !== 1));
  }

  function sqlBlocks() {
    const host = document.getElementById('sql-blocks');
    if (!sql) {
      host.textContent = 'SQL results bundle (js/sql-results.js) unavailable. Run python analysis/run_sql.py.';
      return;
    }
    document.getElementById('sql-engine').textContent = `Executed with ${sql.engine} against data/event_log.csv; written in the ${sql.dialect} dialect.`;
    const blocks = sql.queries.map((q) => {
      const code = el('code', { className: 'language-sql', textContent: q.sql });
      const firstText = q.rows.length ? q.rows[0].map((v) => typeof v === 'number') : [];
      const shown = q.rows.slice(0, MAX_ROWS);
      const meta = q.rows.length > MAX_ROWS
        ? `Showing ${MAX_ROWS} of ${q.rows.length.toLocaleString('en-US')} rows.`
        : `${q.rows.length} rows.`;
      const block = el('article', { className: 'method-block', id: `q-${q.name}` }, [
        el('h3', { textContent: q.title }),
        el('p', { className: 'desc', textContent: q.description }),
        el('div', { className: 'code-result' }, [
          el('pre', { className: 'code' }, [code]),
          el('div', {}, [
            el('div', { className: 'card table-wrap' }, [table(q.columns, shown, (i) => firstText[i])]),
            el('p', { className: 'result-meta', textContent: meta }),
          ]),
        ]),
      ]);
      if (window.Prism) window.Prism.highlightElement(code);
      return block;
    });
    host.replaceChildren(...blocks);
  }

  bindMetrics();
  miningTable();
  sqlBlocks();
})();
