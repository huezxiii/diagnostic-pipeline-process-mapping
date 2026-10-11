/*
 * financials.js: plan figures that cannot be mined from the event log
 * (capital cost, savings categories, roadmap). Shared by the case study and the deck.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PipelineFinancials = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CAPEX = 520000;
  const SAVINGS = [
    { label: 'ED bed-blockage & penalty reduction', value: 2400000 },
    { label: 'Lab & courier overtime elimination', value: 850000 },
    { label: 'Preventable inpatient length of stay', value: 680000 },
    { label: 'Re-collection & rework avoidance', value: 420000 },
  ];
  const PHASES = [
    { name: 'Charter & baseline VSM', start: 1, end: 2 },
    { name: 'Process mining & LIS log analysis', start: 3, end: 5 },
    { name: 'Root cause (fishbone & FMEA)', start: 6, end: 7 },
    { name: 'To-Be architecture & pilot', start: 8, end: 10 },
    { name: 'Central hub & ED deployment', start: 11, end: 13 },
    { name: 'System-wide rollout & SOP training', start: 14, end: 15 },
    { name: 'Audit & control plan', start: 16, end: 16 },
  ];
  const WEEKS = 16;

  const totalSavings = () => SAVINGS.reduce((a, s) => a + s.value, 0);
  const roiPct = () => ((totalSavings() - CAPEX) / CAPEX) * 100;
  const paybackMonths = () => CAPEX / (totalSavings() / 12);

  return { CAPEX, SAVINGS, PHASES, WEEKS, totalSavings, roiPct, paybackMonths };
});
