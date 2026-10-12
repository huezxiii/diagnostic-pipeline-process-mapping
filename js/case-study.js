/*
 * case-study.js: page controller for index.html.
 * Binds [data-metric] spans to metrics.json values (static text is the fallback),
 * draws the value-stream bars, roadmap and ROI chart, and renders the Mermaid swimlanes.
 */
(function () {
  'use strict';

  const C = window.PipelineCharts;
  const metrics = window.PIPELINE_DATA && window.PIPELINE_DATA.metrics;

  // Plan financials and roadmap live in js/financials.js (shared with the deck).
  const F = window.PipelineFinancials;
  const CAPEX = F.CAPEX;
  const SAVINGS = F.SAVINGS.slice().sort((a, b) => b.value - a.value);
  const TOTAL_SAVINGS = F.totalSavings();
  const PHASES = F.PHASES;
  const WEEKS = F.WEEKS;

  const FORMATS = {
    hours: (x) => `${(x / 60).toFixed(1)} h`,
    hoursNum: (x) => (x / 60).toFixed(1),
    min: (x) => `${Math.round(x).toLocaleString('en-US')} min`,
    pct: (x) => `${(x * 100).toFixed(1)}%`,
    pct0: (x) => `${Math.round(x * 100)}%`,
    pct2: (x) => `${(x * 100).toFixed(2)}%`,
    pctPoints: (x) => `${x.toFixed(1)}%`,
  };

  function lookup(path) {
    return path.split('.').reduce((obj, key) => (obj == null ? undefined : obj[key]), metrics);
  }

  function bindMetrics() {
    if (!metrics) return;
    document.querySelectorAll('[data-metric]').forEach((el) => {
      const value = lookup(el.dataset.metric);
      const format = FORMATS[el.dataset.fmt];
      if (typeof value === 'number' && format) el.textContent = format(value);
    });
  }

  function bindRoi() {
    const roi = F.roiPct();
    const paybackMonths = F.paybackMonths();
    const values = {
      savings: C.fmt.money(TOTAL_SAVINGS),
      capex: C.fmt.money(CAPEX),
      roi: `${roi.toFixed(1)}%`,
      payback: `${paybackMonths.toFixed(1)} mo`,
    };
    document.querySelectorAll('[data-roi]').forEach((el) => { el.textContent = values[el.dataset.roi]; });
  }

  function drawValueStream() {
    if (!metrics) return;
    const scale = metrics.scenarios.as_is.mean_tat;
    document.querySelectorAll('[data-vsm]').forEach((bar) => {
      const sc = metrics.scenarios[bar.dataset.vsm];
      const m = sc.stage_means;
      const before = m.order_to_draw + m.clinic_hold + m.transport + m.exception_hold + m.accessioning + (m.testing - sc.mean_va);
      const color = bar.dataset.vsm === 'as_is' ? 'var(--series-as-is)' : 'var(--series-to-be)';
      const segments = [
        { minutes: before, color, title: `Waiting before analysis: ${Math.round(before)} min` },
        { minutes: sc.mean_va, color: 'var(--series-va)', title: `Value-added: ${Math.round(sc.mean_va)} min` },
        { minutes: m.verify_sync, color, title: `Verification & EHR sync: ${Math.round(m.verify_sync)} min` },
      ];
      bar.replaceChildren(...segments.map((s) => {
        const span = document.createElement('span');
        span.style.width = `${(s.minutes / scale) * 100}%`;
        span.style.background = s.color;
        span.title = s.title;
        return span;
      }));
      bar.setAttribute('aria-label', `${bar.dataset.vsm === 'as_is' ? 'As-Is' : 'To-Be'}: ${Math.round(sc.mean_va)} value-added minutes out of ${Math.round(sc.mean_tat).toLocaleString('en-US')}`);
    });
  }

  function drawRoadmap() {
    const host = document.getElementById('roadmap-chart');
    const rows = PHASES.map((p, i) => {
      const row = document.createElement('div');
      row.className = 'roadmap-row';
      row.setAttribute('role', 'listitem');
      const label = document.createElement('span');
      label.textContent = `Phase ${i + 1} · ${p.name}`;
      const track = document.createElement('div');
      track.className = 'roadmap-track';
      const bar = document.createElement('span');
      bar.className = 'roadmap-bar';
      bar.style.left = `${((p.start - 1) / WEEKS) * 100}%`;
      if (p.end === WEEKS) { bar.style.left = 'auto'; bar.style.right = '0'; } // keep the label inside the track
      bar.style.width = `${((p.end - p.start + 1) / WEEKS) * 100}%`;
      bar.textContent = p.start === p.end ? `Wk ${p.start}` : `Wk ${p.start}–${p.end}`;
      track.appendChild(bar);
      row.append(label, track);
      return row;
    });
    const scale = document.createElement('div');
    scale.className = 'roadmap-scale';
    scale.setAttribute('aria-hidden', 'true');
    scale.innerHTML = '<span class="label-col"></span><span class="ticks"><span>Week 1</span><span>Week 8</span><span>Week 16</span></span>';
    host.replaceChildren(...rows, scale);
  }

  function drawRoiChart() {
    C.render('c-roi', {
      type: 'bar',
      data: {
        labels: SAVINGS.map((s) => s.label),
        datasets: [{ label: 'Annual savings', data: SAVINGS.map((s) => s.value), backgroundColor: C.COLORS.toBe }],
      },
      options: {
        indexAxis: 'y',
        scales: C.axes({ horizontal: true, tickFormat: (v) => C.fmt.money(v) }),
        plugins: { legend: { display: false } },
      },
    }, (x) => C.fmt.money(x));
  }

  function showLaneFallbacks() {
    document.querySelectorAll('.swimlane').forEach((fig) => {
      const pre = fig.querySelector('pre.mermaid');
      if (pre) pre.hidden = true;
      fig.querySelector('.lane-fallback').hidden = false;
    });
  }

  async function renderSwimlanes() {
    if (!window.mermaid) return showLaneFallbacks();
    try {
      // Configure synchronously so Mermaid's own on-load pass never renders with default settings.
      window.mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'base',
        themeVariables: {
          fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
          fontSize: '14px',
          primaryColor: '#ffffff',
          primaryBorderColor: '#c9c7bd',
          primaryTextColor: '#0f1d30',
          lineColor: '#7a7e86',
          clusterBkg: '#f6f6f3',
          clusterBorder: '#e3e2dc',
          edgeLabelBackground: '#ffffff',
        },
        flowchart: { htmlLabels: true, curve: 'basis', nodeSpacing: 28, rankSpacing: 36, wrappingWidth: 420 },
      });
      // Mermaid sizes nodes from measured text, so wait for IBM Plex or labels get clipped.
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      await window.mermaid.run({ querySelector: 'pre.mermaid' });
    } catch (err) {
      console.warn('Mermaid render failed; showing step lists instead.', err);
      showLaneFallbacks();
    }
  }

  // Sections that make up each stage of the story told by the progress rail.
  const STORY = {
    problem: ['problem', 'scope'],
    cause: ['as-is', 'bottlenecks', 'value-stream'],
    fix: ['to-be', 'levers', 'roadmap'],
    result: ['impact', 'roi', 'conclusion'],
  };

  function initProgressRail() {
    const rail = document.querySelector('.progress-rail');
    if (!rail || !('IntersectionObserver' in window)) return;
    const order = Object.keys(STORY);
    const stageOf = {};
    for (const [stage, ids] of Object.entries(STORY)) ids.forEach((id) => { stageOf[id] = stage; });
    const setActive = (stage) => {
      const at = order.indexOf(stage);
      rail.querySelectorAll('[data-stage]').forEach((a) => {
        const i = order.indexOf(a.dataset.stage);
        a.classList.toggle('done', i < at);
        if (i === at) a.setAttribute('aria-current', 'step');
        else a.removeAttribute('aria-current');
      });
    };
    // A thin band across the middle of the viewport decides which section is "current".
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) setActive(stageOf[e.target.id]); });
    }, { rootMargin: '-45% 0px -50% 0px' });
    Object.keys(stageOf).forEach((id) => {
      const section = document.getElementById(id);
      if (section) io.observe(section);
    });
  }

  bindMetrics();
  bindRoi();
  drawValueStream();
  drawRoadmap();
  drawRoiChart();
  C.wireTableToggles();
  renderSwimlanes();
  initProgressRail();
})();
