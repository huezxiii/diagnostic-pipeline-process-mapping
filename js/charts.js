/*
 * charts.js: thin Chart.js layer shared by the dashboard and case study.
 * Owns chart defaults (dataviz mark specs), the chart registry, number
 * formatting, empty states and the accessible table view for every chart.
 */
(function (root) {
  'use strict';

  const css = getComputedStyle(document.documentElement);
  const v = (name) => css.getPropertyValue(name).trim();

  const COLORS = {
    asIs: v('--series-as-is') || '#eb6834',
    toBe: v('--series-to-be') || '#2a78d6',
    va: v('--series-va') || '#1baf7a',
    neutral: v('--series-neutral') || '#8a8f98',
    ink: v('--ink') || '#0f1d30',
    ink2: v('--ink-2') || '#4a5160',
    muted: v('--muted') || '#7a7e86',
    grid: '#ecebe5',
    axis: v('--line-strong') || '#c9c7bd',
    surface: '#ffffff',
  };

  const SCENARIO = {
    as_is: { label: 'As-Is', color: COLORS.asIs },
    to_be: { label: 'To-Be', color: COLORS.toBe },
  };

  const fmt = {
    int: (x) => (x == null ? '—' : Math.round(x).toLocaleString('en-US')),
    min: (x) => (x == null ? '—' : `${Math.round(x).toLocaleString('en-US')} min`),
    hours: (x) => (x == null ? '—' : `${(x / 60).toFixed(1)} h`),
    pct: (x, d = 1) => (x == null ? '—' : `${(x * 100).toFixed(d)}%`),
    pctPoints: (x, d = 1) => (x == null ? '—' : `${x.toFixed(d)}%`),
    money: (x) => (x == null ? '—' : x >= 1e6 ? `$${(x / 1e6).toFixed(2)}M` : `$${Math.round(x / 1e3)}K`),
  };

  const available = () => typeof root.Chart === 'function';
  const registry = new Map(); // canvas id -> { chart, format }

  /** Chart.js plugin: writes a short label next to one bar (options.plugins.callout). */
  const calloutPlugin = {
    id: 'callout',
    afterDatasetsDraw(chart, _args, opts) {
      if (!opts || !opts.text) return;
      const meta = chart.getDatasetMeta(opts.datasetIndex || 0);
      const el = meta && !meta.hidden && meta.data[opts.index];
      if (!el) return;
      const horizontal = chart.options.indexAxis === 'y';
      const valueScale = horizontal ? chart.scales.x : chart.scales.y;
      let { x, y } = el;
      if (valueScale.options.stacked) {
        // Label the end of the whole stack, not just this dataset's segment.
        for (const m of chart.getSortedVisibleDatasetMetas()) {
          const seg = m.data[opts.index];
          if (!seg) continue;
          if (horizontal) x = Math.max(x, seg.x);
          else y = Math.min(y, seg.y);
        }
      }
      const { ctx } = chart;
      ctx.save();
      ctx.font = '600 12px "IBM Plex Sans", system-ui, sans-serif';
      ctx.fillStyle = COLORS.ink;
      if (horizontal) {
        ctx.textBaseline = 'middle';
        const textW = ctx.measureText(opts.text).width;
        if (x + 8 + textW > chart.chartArea.right) {
          // No room beside the bar end: write it inside the bar on a light pill.
          const padX = 4, padY = 3, h = 12 + padY * 2;
          const left = x - 8 - textW - padX;
          if (left < chart.chartArea.left) { ctx.restore(); return; }
          ctx.fillStyle = COLORS.surface;
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(left, y - h / 2, textW + padX * 2, h, 4);
          else ctx.rect(left, y - h / 2, textW + padX * 2, h);
          ctx.fill();
          ctx.fillStyle = COLORS.ink;
          ctx.textAlign = 'right';
          ctx.fillText(opts.text, x - 8, y);
        } else {
          ctx.textAlign = 'left';
          ctx.fillText(opts.text, x + 8, y);
        }
      } else {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(opts.text, x, y - 6);
      }
      ctx.restore();
    },
  };

  function applyDefaults() {
    if (!available()) return;
    root.Chart.register(calloutPlugin);
    const d = root.Chart.defaults;
    d.font.family = '"IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif';
    d.font.size = 12;
    d.color = COLORS.ink2;
    d.borderColor = COLORS.grid;
    d.maintainAspectRatio = false;
    d.animation.duration = 300;
    d.plugins.legend.position = 'top';
    d.plugins.legend.align = 'start';
    d.plugins.legend.labels.usePointStyle = true;
    d.plugins.legend.labels.pointStyle = 'rectRounded';
    d.plugins.legend.labels.boxWidth = 10;
    d.plugins.legend.labels.boxHeight = 10;
    d.plugins.legend.labels.color = COLORS.ink2;
    d.plugins.tooltip.backgroundColor = '#0f1d30';
    d.plugins.tooltip.padding = 10;
    d.plugins.tooltip.cornerRadius = 6;
    d.plugins.tooltip.boxPadding = 4;
    d.plugins.tooltip.usePointStyle = true;
    d.datasets.bar.maxBarThickness = 24;
    d.datasets.bar.borderRadius = 4;
    d.datasets.bar.borderSkipped = 'start';
    d.datasets.line.borderWidth = 2;
    d.datasets.line.pointRadius = 0;
    d.datasets.line.pointHoverRadius = 5;
  }

  /** Value axis + category axis styling: hairline grid on the value axis only. */
  function axes({ horizontal = false, stacked = false, valueTitle = '', tickFormat, max, grace } = {}) {
    const value = {
      beginAtZero: true,
      stacked,
      max,
      grace,
      grid: { color: COLORS.grid, drawTicks: false },
      border: { display: false },
      ticks: { color: COLORS.muted, padding: 6, callback: tickFormat },
      title: valueTitle ? { display: true, text: valueTitle, color: COLORS.muted, font: { size: 11 } } : undefined,
    };
    const category = {
      stacked,
      grid: { display: false },
      border: { color: COLORS.axis },
      ticks: { color: COLORS.ink2, autoSkip: !horizontal, maxRotation: 0 },
    };
    return horizontal ? { x: value, y: category } : { x: category, y: value };
  }

  function boxFor(canvasId) {
    return document.getElementById(canvasId)?.closest('.chart-box');
  }

  /** Create or replace the chart on a canvas. `format` formats values in tooltips and the table view. */
  function render(canvasId, config, format = (x) => x) {
    const box = boxFor(canvasId);
    if (!box) return null;
    setEmpty(canvasId, false);
    if (!available()) {
      showFallback(box, 'Chart library failed to load. Use the table view for values.');
      registry.set(canvasId, { chart: null, format, data: config.data });
      return null;
    }
    const existing = registry.get(canvasId);
    if (existing && existing.chart) existing.chart.destroy();
    config.options = config.options || {};
    config.options.plugins = config.options.plugins || {};
    const tt = (config.options.plugins.tooltip = config.options.plugins.tooltip || {});
    tt.callbacks = Object.assign({
      label: (ctx) => {
        const val = ctx.parsed[config.options.indexAxis === 'y' ? 'x' : 'y'];
        return ` ${ctx.dataset.label}: ${format(val, ctx)}`;
      },
    }, tt.callbacks || {});
    const chart = new root.Chart(document.getElementById(canvasId), config);
    registry.set(canvasId, { chart, format, data: config.data });
    refreshTable(canvasId);
    return chart;
  }

  function showFallback(box, message) {
    let fb = box.querySelector('.chart-fallback');
    if (!fb) {
      fb = document.createElement('div');
      fb.className = 'chart-fallback';
      box.appendChild(fb);
    }
    fb.textContent = message;
    const canvas = box.querySelector('canvas');
    if (canvas) canvas.hidden = true;
  }

  /** Toggle the empty state for a chart (no orders match the filters). */
  function setEmpty(canvasId, isEmpty, message = 'No orders match these filters.') {
    const box = boxFor(canvasId);
    if (!box) return;
    let es = box.querySelector('.empty-state');
    const canvas = box.querySelector('canvas');
    if (isEmpty) {
      const entry = registry.get(canvasId);
      if (entry && entry.chart) entry.chart.destroy();
      registry.delete(canvasId);
      if (!es) {
        es = document.createElement('div');
        es.className = 'empty-state';
        box.appendChild(es);
      }
      es.textContent = message;
      es.hidden = false;
      if (canvas) canvas.hidden = true;
    } else {
      if (es) es.hidden = true;
      if (canvas && available()) canvas.hidden = false;
    }
    refreshTable(canvasId);
  }

  function buildTable(entry) {
    const { data, format } = entry;
    const table = document.createElement('table');
    table.className = 'data';
    const head = table.createTHead().insertRow();
    const th0 = document.createElement('th');
    th0.textContent = 'Category';
    head.appendChild(th0);
    for (const ds of data.datasets) {
      const th = document.createElement('th');
      th.className = 'num';
      th.textContent = ds.label;
      head.appendChild(th);
    }
    const body = table.createTBody();
    data.labels.forEach((label, i) => {
      const row = body.insertRow();
      const c0 = row.insertCell();
      c0.textContent = Array.isArray(label) ? label.join(' ') : label;
      for (const ds of data.datasets) {
        const c = row.insertCell();
        c.className = 'num';
        c.textContent = format(ds.data[i], { dataIndex: i, dataset: ds });
      }
    });
    return table;
  }

  function refreshTable(canvasId) {
    const card = document.getElementById(canvasId)?.closest('.chart-card');
    if (!card) return;
    const btn = card.querySelector('.table-toggle');
    const holder = card.querySelector('.chart-table');
    if (!btn || !holder) return;
    const on = btn.getAttribute('aria-pressed') === 'true';
    holder.replaceChildren();
    const entry = registry.get(canvasId);
    if (on && entry) holder.appendChild(buildTable(entry));
    if (on && !entry) holder.textContent = 'No data for the current filters.';
    holder.hidden = !on;
    boxFor(canvasId).hidden = on;
  }

  /** Wire every .table-toggle inside root to switch its card between chart and table view. */
  function wireTableToggles(scope = document) {
    scope.querySelectorAll('.chart-card .table-toggle').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pressed = btn.getAttribute('aria-pressed') === 'true';
        btn.setAttribute('aria-pressed', String(!pressed));
        btn.textContent = pressed ? 'Table' : 'Chart';
        const canvas = btn.closest('.chart-card').querySelector('canvas');
        refreshTable(canvas.id);
      });
    });
  }

  /** Before/after mini bars scaled to the larger value. `label` is read by screen readers. */
  function pairBars(before, after, label) {
    const wrap = document.createElement('div');
    wrap.className = 'pair';
    wrap.setAttribute('role', 'img');
    wrap.setAttribute('aria-label', label);
    const max = Math.max(before, after) || 1;
    for (const [cls, value] of [['as-is', before], ['to-be', after]]) {
      const track = document.createElement('span');
      track.className = 'pair-track';
      const bar = document.createElement('span');
      bar.className = `pair-bar ${cls}`;
      bar.style.width = `${Math.max((value / max) * 100, 2)}%`;
      track.appendChild(bar);
      wrap.appendChild(track);
    }
    return wrap;
  }

  applyDefaults();

  root.PipelineCharts = { COLORS, SCENARIO, fmt, available, axes, render, setEmpty, wireTableToggles, pairBars };
})(window);
