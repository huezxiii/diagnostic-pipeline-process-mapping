/*
 * glossary.js: plain-language definitions for jargon, shared by every page.
 * Fills each <dfn data-term> with its definition (shown as a tooltip on hover,
 * keyboard focus or tap) and renders the #glossary-list section when present.
 */
(function () {
  'use strict';

  const TERMS = {
    tat: ['Time-to-result (TAT)', "Hours from the doctor placing the order to the result reaching the patient's chart."],
    pce: ['Process cycle efficiency (PCE)', 'Share of total time spent on work that actually changes the sample or the result.'],
    stat: ['STAT', 'An order flagged urgent, to be done ahead of everything else.'],
    'priority-inversion': ['Priority inversion', 'When so many orders are flagged urgent that urgent stops meaning anything.'],
    sipoc: ['SIPOC', 'A one-page outline of Suppliers, Inputs, Process, Outputs and Customers, used to agree where the process starts and stops.'],
    accessioning: ['Accessioning', 'Logging a sample into the lab system when it arrives so it can be tested.'],
    'value-stream': ['Value stream', 'Every step from order to result, split into time that adds value and time spent waiting.'],
    swimlane: ['Swimlane map', 'A process diagram with one row per team, so handoffs between teams are easy to see.'],
    rekey: ['Re-key error', 'A mistake made when someone types information that already exists in another system.'],
  };

  const GAP = 16; // keep the tooltip inside the page gutter
  let tip = null;
  let current = null;

  function ensureTip() {
    if (tip) return tip;
    tip = document.createElement('div');
    tip.id = 'dfn-tip';
    tip.className = 'dfn-tip';
    tip.setAttribute('role', 'tooltip');
    tip.hidden = true;
    document.body.appendChild(tip);
    return tip;
  }

  function show(el) {
    const entry = TERMS[el.dataset.term];
    if (!entry) return;
    const t = ensureTip();
    const label = document.createElement('strong');
    label.textContent = entry[0];
    t.replaceChildren(label, document.createTextNode(entry[1]));
    t.hidden = false;
    if (current && current !== el) current.removeAttribute('aria-describedby');
    current = el;
    el.setAttribute('aria-describedby', 'dfn-tip');
    const r = el.getBoundingClientRect();
    const pageWidth = document.documentElement.clientWidth;
    t.style.left = '0px';
    const left = Math.min(Math.max(r.left, GAP), pageWidth - GAP - t.offsetWidth);
    t.style.left = `${left + window.scrollX}px`;
    t.style.top = `${r.bottom + window.scrollY + 6}px`;
  }

  function hide() {
    if (!tip || tip.hidden) return;
    tip.hidden = true;
    if (current) current.removeAttribute('aria-describedby');
    current = null;
  }

  function wireTerms() {
    document.querySelectorAll('dfn[data-term]').forEach((el) => {
      const entry = TERMS[el.dataset.term];
      if (!entry) return;
      el.dataset.def = entry[1];
      el.tabIndex = 0;
      el.addEventListener('mouseenter', () => show(el));
      el.addEventListener('mouseleave', () => { if (document.activeElement !== el) hide(); });
      el.addEventListener('focus', () => show(el));
      el.addEventListener('blur', hide);
      el.addEventListener('click', (e) => { e.stopPropagation(); show(el); });
    });
    document.addEventListener('click', hide);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
    window.addEventListener('resize', hide);
  }

  function renderGlossary() {
    const list = document.getElementById('glossary-list');
    if (!list) return;
    list.replaceChildren(...Object.values(TERMS).map(([term, def]) => {
      const row = document.createElement('div');
      const dt = document.createElement('dt');
      dt.textContent = term;
      const dd = document.createElement('dd');
      dd.textContent = def;
      row.append(dt, dd);
      return row;
    }));
  }

  wireTerms();
  renderGlossary();
})();
