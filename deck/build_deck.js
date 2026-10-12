/*
 * build_deck.js: 10-slide executive briefing ("What? So What? Now What?").
 * Every operational figure is read from data/metrics.json; financials and the
 * roadmap come from js/financials.js, the same source the case study uses.
 *
 * Usage: node deck/build_deck.js [output.pptx]
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const PptxGenJS = require('pptxgenjs');
const F = require('../js/financials.js');

const ROOT = path.join(__dirname, '..');
const OUT = process.argv[2] || path.join(__dirname, 'sovereign-health-exec-briefing.pptx');
const metrics = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'metrics.json'), 'utf8'));
const A = metrics.scenarios.as_is;
const B = metrics.scenarios.to_be;
const CMP = metrics.comparison;

// ---------- Palette & type ----------
const NAVY = '14365D';
const INK = '0F1D30';
const MUTED = '5F6672';
const LINE = 'E3E2DC';
const TINT = 'F3F5F8';
const ICE = 'CADCFC';
const AS_IS = 'EB6834';
const TO_BE = '2A78D6';
const VA = '1BAF7A';
const HEAD = 'Cambria';
const BODY = 'Calibri';
const DISCLAIMER = 'Sovereign Health System is a fictional organization. All data is synthetic and generated for portfolio demonstration.';

// ---------- Formatting ----------
const hours = (min) => `${(min / 60).toFixed(1)} h`;
const hoursNb = (min) => `${(min / 60).toFixed(1)} h`; // titles: keep number and unit together
const mins = (min) => `${Math.round(min)} min`;
const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`;
const money = (x) => (x >= 1e6 ? `$${(x / 1e6).toFixed(2)}M` : `$${Math.round(x / 1e3)}K`);
const STAGE_LABEL = Object.fromEntries(metrics.stages.map((s) => [s.key, s.label]));

const pres = new PptxGenJS();
pres.layout = 'LAYOUT_WIDE'; // 13.333 x 7.5 in
pres.title = 'Diagnostic Pipeline Turnaround: Executive Briefing';
pres.subject = 'Process mapping and throughput optimization case study';
pres.author = 'Portfolio case study';
pres.theme = { headFontFace: HEAD, bodyFontFace: BODY };

// ---------- Layouts ----------
pres.defineSlideMaster({
  title: 'DARK',
  background: { color: NAVY },
  objects: [
    { placeholder: { options: { name: 'kicker', type: 'body', x: 0.8, y: 1.2, w: 11.7, h: 0.4, fontFace: BODY, fontSize: 14, bold: true, color: ICE, charSpacing: 2, margin: 0 }, text: '' } },
    { placeholder: { options: { name: 'title', type: 'title', x: 0.8, y: 1.7, w: 11.7, h: 1.6, fontFace: HEAD, fontSize: 40, bold: true, color: 'FFFFFF', valign: 'top', align: 'left', margin: 0 }, text: '' } },
  ],
});

pres.defineSlideMaster({
  title: 'CONTENT',
  background: { color: 'FFFFFF' },
  margin: [0.5, 0.6, 0.6, 0.6],
  objects: [
    { placeholder: { options: { name: 'kicker', type: 'body', x: 0.6, y: 0.4, w: 9, h: 0.35, fontFace: BODY, fontSize: 12, bold: true, color: MUTED, charSpacing: 2, margin: 0 }, text: '' } },
    { placeholder: { options: { name: 'title', type: 'title', x: 0.6, y: 0.8, w: 12.1, h: 0.6, fontFace: HEAD, fontSize: 28, bold: true, color: INK, valign: 'top', align: 'left', margin: 0 }, text: '' } },
    { text: { text: DISCLAIMER, options: { x: 0.6, y: 7.0, w: 10, h: 0.3, fontFace: BODY, fontSize: 9, color: MUTED, margin: 0 } } },
  ],
  slideNumber: { x: 12.2, y: 7.0, w: 0.5, h: 0.3, fontFace: BODY, fontSize: 9, color: MUTED, align: 'right' },
});

// ---------- Helpers ----------
let section = '';
function notes(say, detail) {
  return `Talking point: ${say}\n\nDetail: ${detail}`;
}

function contentSlide(kicker, title, subtitle, say, detail) {
  const s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: section });
  s.addText(kicker.toUpperCase(), { placeholder: 'kicker' });
  s.addText(title, { placeholder: 'title' });
  s.addText(subtitle, {
    x: 0.6, y: 1.42, w: 12.1, h: 0.4, fontFace: BODY, fontSize: 16, color: MUTED, margin: 0, isTextBox: true, objectName: 'subtitle',
  });
  s.addNotes(notes(say, detail));
  return s;
}

function card(s, x, y, w, h, name) {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, fill: { color: TINT }, line: { color: TINT }, rectRadius: 0.08, objectName: name });
}

function stat(s, x, y, w, value, label, color = INK, size = 44) {
  s.addText(value, { x, y, w, h: 0.9, fontFace: HEAD, fontSize: size, bold: true, color, margin: 0, isTextBox: true });
  s.addText(label, { x, y: y + 0.95, w, h: 0.9, fontFace: BODY, fontSize: 14, color: MUTED, valign: 'top', margin: 0, isTextBox: true });
}

function bullets(s, items, opts) {
  s.addText(items.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i < items.length - 1 } })),
    Object.assign({ fontFace: BODY, fontSize: 15, color: INK, valign: 'top', paraSpaceAfter: 8, margin: 0, isTextBox: true }, opts));
}

const CHART_BASE = {
  catAxisLabelColor: MUTED, valAxisLabelColor: MUTED,
  catAxisLabelFontFace: BODY, valAxisLabelFontFace: BODY, dataLabelFontFace: BODY,
  catAxisLabelFontSize: 12, valAxisLabelFontSize: 11, dataLabelFontSize: 11, dataLabelColor: INK,
  valGridLine: { color: LINE, size: 0.75 }, catGridLine: { style: 'none' },
  showValue: true,
};

// ===================== Slide 1: title =====================
section = 'What?';
pres.addSection({ title: section });
{
  const s = pres.addSlide({ masterName: 'DARK', sectionTitle: section });
  s.addText('SOVEREIGN HEALTH SYSTEM · EXECUTIVE BRIEFING', { placeholder: 'kicker' });
  s.addText(`Cutting lab result time from ${hoursNb(A.mean_tat)} to ${hoursNb(B.mean_tat)}`, { placeholder: 'title' });
  s.addText('The fix uses the same analyzers and staff. It changes how samples and information move between teams.', {
    x: 0.8, y: 2.7, w: 10.5, h: 1.0, fontFace: BODY, fontSize: 20, color: ICE, valign: 'top', margin: 0, isTextBox: true, objectName: 'subtitle',
  });
  s.addText(DISCLAIMER, { x: 0.8, y: 6.7, w: 11.7, h: 0.4, fontFace: BODY, fontSize: 11, color: ICE, margin: 0, isTextBox: true });
  s.addNotes(notes(`Lab results now take ${hours(A.mean_tat)} on average, up from 4.2 h. This briefing shows where the time goes and asks for ${money(F.CAPEX)} to bring it down to ${hours(B.mean_tat)}.`, 'Structure: what is happening, why it matters, what we do about it.'));
}

// ===================== Slide 2: situation =====================
{
  const s = contentSlide('What? · Situation', `Testing takes 42 minutes of an ${hoursNb(A.mean_tat)} wait`,
    'The new analyzers work. Samples spend the rest of the day waiting around them.',
    `The analyzers work on each sample for ${mins(A.mean_va)}. The other ${hours(A.mean_tat - A.mean_va)} is spent waiting before and after.`,
    'The analyzer upgrade did its job. Everything around it did not scale: 96% of the cycle is queueing, transit, re-keying and exception handling.');
  const items = [
    [hours(A.mean_tat), 'Mean time-to-result today, up from 4.2 h before the expansion', AS_IS],
    [mins(A.mean_va), 'Value-added analyzer and centrifuge time per order', VA],
    ['$6.5M', 'Spent on high-throughput analyzers that now sit idle between batch waves', INK],
  ];
  items.forEach(([v, l, c], i) => {
    const x = 0.6 + i * 4.1;
    card(s, x, 2.1, 3.8, 2.6, `stat-card-${i + 1}`);
    stat(s, x + 0.3, 2.4, 3.2, v, l, c, 48);
  });
  s.addText([
    { text: '12 hospitals and 45 diagnostic hubs', options: { bold: true } },
    { text: ' send 1.2 million lab orders a year through one central lab. The bottleneck is not the analyzer; it is how specimens and data reach it.' },
  ], { x: 0.6, y: 5.2, w: 12.1, h: 1.0, fontFace: BODY, fontSize: 16, color: INK, valign: 'top', margin: 0, isTextBox: true });
}

// ===================== Slide 3: where the time goes =====================
{
  const ranked = A.bottlenecks;
  const top = ranked[0];
  const s = contentSlide('What? · Where the time goes', `Sample intake holds ${pct(top.share_of_nva, 0)} of all waiting time`,
    'Logging samples in on arrival (accessioning) is the biggest single queue.',
    `The biggest single wait is at sample intake, where tubes are logged in by hand. ${pct(A.outpatient_peak_arrival_share, 0)} of clinic samples arrive between 4 and 6 PM, just as evening staffing drops.`,
    'Minutes come from timestamps mined across 10,000 orders. Testing shows queue time only; the 42-minute analyzer run is excluded.');
  s.addChart(pres.charts.BAR, [{
    name: 'As-Is non-value-added minutes',
    labels: ranked.map((b) => STAGE_LABEL[b.stage]),
    values: ranked.map((b) => Math.round(b.mean_wait)),
  }], Object.assign({}, CHART_BASE, {
    x: 0.6, y: 1.9, w: 7.6, h: 4.8, barDir: 'bar', catAxisOrientation: 'maxMin',
    chartColors: [AS_IS], showLegend: false, dataLabelPosition: 'outEnd', barGapWidthPct: 60,
    showTitle: true, title: 'Mean waiting minutes per order, As-Is', titleFontFace: BODY, titleFontSize: 13, titleColor: MUTED,
  }));
  card(s, 8.6, 1.9, 4.1, 4.8, 'commentary');
  bullets(s, [
    `${pct(A.outpatient_peak_arrival_share, 0)} of clinic specimens land between 4 and 6 PM, when evening staffing drops 30%`,
    `Exception holds average ${hours(A.mean_exception_resolution)} for the ${pct(A.exception_rate)} of orders that hit one`,
    `Clinic holding bins add ${hours(A.stage_means.clinic_hold)} because couriers run on a fixed clock`,
  ], { x: 8.9, y: 2.2, w: 3.5, h: 4.2 });
}

// ===================== Slide 4: bottlenecks =====================
section = 'So What?';
pres.addSection({ title: section });
{
  const s = contentSlide('So What? · Root causes', 'Four problems cause most of the delay',
    'Each problem has a matching fix on slide 8.',
    `Four problems cause most of the delay, and each has a fix later in the deck. One is that ${pct(A.stat_ratio, 0)} of orders are marked urgent, so real emergencies get stuck behind routine work.`,
    'Ranked by non-value-added minutes from the event log.');
  const p = A.priority;
  const cards = [
    [hours(A.stage_means.accessioning), 'Accessioning wave', `Batch arrivals meet manual rescans; ${pct(A.rekey_error_rate)} of entries need re-keying`],
    [pct(A.stat_ratio, 0), 'STAT inflation', `True ED STATs wait ${mins(p.stat_true.mean_testing_wait)} for testing, longer than flagged-routine STATs (${mins(p.stat_flagged.mean_testing_wait)})`],
    [hours(A.stage_means.clinic_hold), 'Fixed courier clock', `Specimens idle in clinic bins; ${pct(A.rejection_rate)} are rejected for degradation`],
    [hours(A.mean_exception_resolution), 'Paper exception tickets', 'Label mismatches travel by inter-office mail while samples expire'],
  ];
  cards.forEach(([v, t, d], i) => {
    const x = 0.6 + (i % 2) * 6.15;
    const y = 1.9 + Math.floor(i / 2) * 2.5;
    card(s, x, y, 5.95, 2.3, `bottleneck-${i + 1}`);
    s.addText(v, { x: x + 0.3, y: y + 0.25, w: 2.3, h: 0.8, fontFace: HEAD, fontSize: 34, bold: true, color: AS_IS, margin: 0, isTextBox: true });
    s.addText(t, { x: x + 2.7, y: y + 0.3, w: 3.0, h: 0.5, fontFace: BODY, fontSize: 18, bold: true, color: INK, margin: 0, isTextBox: true });
    s.addText(d, { x: x + 0.3, y: y + 1.15, w: 5.35, h: 0.95, fontFace: BODY, fontSize: 14, color: MUTED, valign: 'top', margin: 0, isTextBox: true });
  });
}

// ===================== Slide 5: value stream =====================
{
  const s = contentSlide('So What? · Value stream', `Only ${pct(A.pce, 0)} of the ${hoursNb(A.mean_tat)} is real work`,
    'The rest is samples waiting in queues between teams.',
    'For every hour a sample spends in the system, less than three minutes is real work. The rest is waiting, transport and fixing mistakes.',
    'Process cycle efficiency = value-added time / total cycle time. The healthcare benchmark is above 15%.');
  card(s, 0.6, 1.95, 4.2, 4.6, 'waiting-share');
  s.addText(pct(1 - A.pce, 0), { x: 0.9, y: 2.2, w: 3.6, h: 1.3, fontFace: HEAD, fontSize: 72, bold: true, color: AS_IS, margin: 0, isTextBox: true });
  s.addText(`of the ${hours(A.mean_tat)} is waiting, moving or rework`, { x: 0.9, y: 3.5, w: 3.6, h: 0.7, fontFace: BODY, fontSize: 16, color: INK, valign: 'top', margin: 0, isTextBox: true });
  s.addText([
    { text: `Process cycle efficiency: ${pct(A.pce, 2)} today`, options: { breakLine: true } },
    { text: `${pct(B.pce, 2)} after the redesign (benchmark above 15%)` },
  ], { x: 0.9, y: 4.6, w: 3.6, h: 1.0, fontFace: BODY, fontSize: 13, color: MUTED, valign: 'top', margin: 0, isTextBox: true });
  s.addChart(pres.charts.BAR, [
    { name: 'Value-added', labels: ['As-Is', 'To-Be'], values: [Math.round(A.mean_va), Math.round(B.mean_va)] },
    { name: 'Waiting, transit, rework', labels: ['As-Is', 'To-Be'], values: [Math.round(A.mean_tat - A.mean_va), Math.round(B.mean_tat - B.mean_va)] },
  ], Object.assign({}, CHART_BASE, {
    x: 5.1, y: 1.95, w: 7.6, h: 4.6, barDir: 'bar', barGrouping: 'stacked', catAxisOrientation: 'maxMin',
    chartColors: [VA, 'B7BCC4'], dataLabelPosition: 'ctr', showLegend: true, legendPos: 'b', legendFontFace: BODY, legendFontSize: 12, legendColor: MUTED,
    showTitle: true, title: 'Minutes per order', titleFontFace: BODY, titleFontSize: 13, titleColor: MUTED, barGapWidthPct: 70,
  }));
}

// ===================== Slide 6: impact =====================
{
  const s = contentSlide('So What? · Business impact', 'The delay costs $6.0M a year before patient risk',
    'Hospital penalties and overtime come straight out of the budget.',
    `The delay costs about $6M a year in penalties and overtime. Doctors also wait ${mins(A.mean_critical_lag)} to hear about dangerous results.`,
    'Penalties and overtime are annual figures from finance. Patient risk shows up as ED length of stay and a 48-minute critical-value lag.');
  const items = [
    ['$4.8M', 'ED penalties, bed blockage and walk-outs (+3.4 h ED length of stay)'],
    ['$1.2M', 'Unbudgeted overtime and expedited freight'],
    ['14.2%', 'Orders needing manual intervention or re-collection'],
    [mins(A.mean_critical_lag), 'From a panic-value flag to the physician phone call'],
  ];
  items.forEach(([v, l], i) => {
    const x = 0.6 + i * 3.1;
    card(s, x, 2.1, 2.85, 3.0, `impact-${i + 1}`);
    stat(s, x + 0.25, 2.4, 2.4, v, l, i < 2 ? INK : AS_IS, 36);
  });
  s.addText('Leaving the process as it is means paying for idle analyzers, overtime and ED congestion at the same time.', {
    x: 0.6, y: 5.5, w: 12.1, h: 0.8, fontFace: BODY, fontSize: 16, italic: true, color: INK, margin: 0, isTextBox: true,
  });
}

// ===================== Slide 7: to-be design =====================
section = 'Now What?';
pres.addSection({ title: section });
{
  const s = contentSlide('Now What? · To-Be design', 'The new process has 12 steps and no retyping',
    'Scans and automatic messages replace the steps where people retyped data.',
    `The new process removes six steps and every point where people retype data. Logging samples in drops from ${hours(A.stage_means.accessioning)} to ${mins(B.stage_means.accessioning)}.`,
    'Steps fall from 18 to 12. Every remaining handoff is a scan or an API call.');
  const lanes = [
    ['Order entry', 'Auto-barcoded EHR orders and smart phlebotomy scans'],
    ['Logistics', 'Pickup triggered at 25 tubes, direct to the hub'],
    ['Accessioning', 'Robotic unloading and optical sorting at 1,200 tubes/h'],
    ['Analytics', 'Rule-engine triage and 92% auto-verification'],
    ['EHR sync', 'FHIR writeback and push alerts for critical values'],
  ];
  lanes.forEach(([t, d], i) => {
    const x = 0.6 + i * 2.5;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 2.2, w: 2.2, h: 3.3, fill: { color: i === 2 ? NAVY : TINT }, line: { color: i === 2 ? NAVY : TINT }, rectRadius: 0.08, objectName: `lane-${i + 1}` });
    s.addText(`${i + 1}`, { x: x + 0.25, y: 2.45, w: 0.6, h: 0.6, fontFace: HEAD, fontSize: 28, bold: true, color: i === 2 ? ICE : TO_BE, margin: 0, isTextBox: true });
    s.addText(t, { x: x + 0.25, y: 3.15, w: 1.8, h: 0.5, fontFace: BODY, fontSize: 17, bold: true, color: i === 2 ? 'FFFFFF' : INK, margin: 0, isTextBox: true });
    s.addText(d, { x: x + 0.25, y: 3.7, w: 1.75, h: 1.6, fontFace: BODY, fontSize: 14, color: i === 2 ? 'FFFFFF' : MUTED, valign: 'top', margin: 0, isTextBox: true });
    if (i < lanes.length - 1) {
      s.addShape(pres.shapes.RIGHT_ARROW, { x: x + 2.23, y: 3.7, w: 0.25, h: 0.3, fill: { color: 'B7BCC4' }, line: { color: 'B7BCC4' } });
    }
  });
  s.addText(`Accessioning, the largest As-Is queue, drops from ${hours(A.stage_means.accessioning)} to ${mins(B.stage_means.accessioning)}.`, {
    x: 0.6, y: 5.9, w: 12.1, h: 0.5, fontFace: BODY, fontSize: 16, color: INK, margin: 0, isTextBox: true,
  });
}

// ===================== Slide 8: levers =====================
{
  const s = contentSlide('Now What? · Levers', 'Four changes, each aimed at one queue',
    'None of the fixes depend on staff working faster.',
    'Each change targets one of the four problems from slide 4. The table shows the before and after for each one.',
    'Before/after values for accessioning, clinic hold and exceptions are mined means from the simulated To-Be scenario.');
  const head = ['Lever', 'Targets', 'Before', 'After'].map((t) => ({ text: t, options: { bold: true, color: 'FFFFFF', fill: { color: NAVY } } }));
  const rows = [
    ['Optical accessioning sorters', 'Accessioning queue', hours(A.stage_means.accessioning), mins(B.stage_means.accessioning)],
    ['Volume-triggered courier dispatch', 'Clinic holding time', hours(A.stage_means.clinic_hold), mins(B.stage_means.clinic_hold)],
    ['STAT governance in the EHR', 'STAT order share', pct(A.stat_ratio, 0), pct(B.stat_ratio, 0)],
    ['Digital exception portal', 'Exception resolution', hours(A.mean_exception_resolution), mins(B.mean_exception_resolution)],
  ].map((r) => r.map((t, i) => ({ text: t, options: { bold: i === 3, color: i === 3 ? TO_BE : INK, align: i >= 2 ? 'right' : 'left' } })));
  s.addTable([head, ...rows], {
    x: 0.6, y: 2.0, w: 12.1, colW: [4.6, 3.5, 2.0, 2.0], rowH: 0.7, fontFace: BODY, fontSize: 16,
    border: { type: 'solid', pt: 0.75, color: LINE }, valign: 'middle', margin: [0, 0.15, 0, 0.15],
  });
  s.addText('Each lever removes a queue, so most of the before and after gap is waiting time that disappears.', {
    x: 0.6, y: 5.9, w: 12.1, h: 0.6, fontFace: BODY, fontSize: 16, italic: true, color: INK, margin: 0, isTextBox: true,
  });
}

// ===================== Slide 9: impact & ROI =====================
{
  const s = contentSlide('Now What? · Impact', `${CMP.tat_reduction_pct.toFixed(1)}% faster, ${money(F.totalSavings())} a year, paid back in ${F.paybackMonths().toFixed(1)} months`,
    `The money comes back in ${F.paybackMonths().toFixed(1)} months, and every quality measure improves.`,
    `Results come back ${CMP.tat_reduction_pct.toFixed(1)}% faster and the program saves ${money(F.totalSavings())} a year. It pays for itself in ${F.paybackMonths().toFixed(1)} months.`,
    'ROI = (annual savings - capex) / capex. Savings categories: ED penalties $2.4M, overtime $850K, length of stay $680K, rework $420K.');
  const head = ['Metric', 'As-Is', 'To-Be'].map((t, i) => ({ text: t, options: { bold: true, color: 'FFFFFF', fill: { color: NAVY }, align: i ? 'right' : 'left' } }));
  const rows = [
    ['Mean time-to-result', hours(A.mean_tat), hours(B.mean_tat)],
    ['Process cycle efficiency', pct(A.pce, 2), pct(B.pce, 2)],
    ['Re-key error rate', pct(A.rekey_error_rate), pct(B.rekey_error_rate)],
    ['Specimen rejection', pct(A.rejection_rate), pct(B.rejection_rate)],
    ['STAT order share', pct(A.stat_ratio, 0), pct(B.stat_ratio, 0)],
    ['Critical-value lag', mins(A.mean_critical_lag), mins(B.mean_critical_lag)],
  ].map((r) => r.map((t, i) => ({ text: t, options: { align: i ? 'right' : 'left', color: i === 2 ? TO_BE : INK, bold: i === 2 } })));
  s.addTable([head, ...rows], {
    x: 0.6, y: 1.9, w: 7.4, colW: [3.8, 1.8, 1.8], rowH: 0.62, fontFace: BODY, fontSize: 15,
    border: { type: 'solid', pt: 0.75, color: LINE }, valign: 'middle', margin: [0, 0.15, 0, 0.15],
  });
  const figs = [
    [`${F.roiPct().toFixed(1)}%`, 'First-year net ROI'],
    [money(F.totalSavings()), `Annual savings on ${money(F.CAPEX)} capex`],
    [`${F.paybackMonths().toFixed(1)} mo`, 'Payback period'],
  ];
  figs.forEach(([v, l], i) => {
    const y = 1.9 + i * 1.6;
    card(s, 8.4, y, 4.3, 1.45, `roi-${i + 1}`);
    s.addText(v, { x: 8.7, y: y + 0.15, w: 3.8, h: 0.7, fontFace: HEAD, fontSize: 32, bold: true, color: i === 0 ? TO_BE : INK, margin: 0, isTextBox: true });
    s.addText(l, { x: 8.7, y: y + 0.88, w: 3.8, h: 0.4, fontFace: BODY, fontSize: 14, color: MUTED, margin: 0, isTextBox: true });
  });
}

// ===================== Slide 10: decision & roadmap =====================
{
  const s = pres.addSlide({ masterName: 'DARK', sectionTitle: section });
  s.addText('NOW WHAT? · DECISION', { placeholder: 'kicker' });
  s.addText(`Approve ${money(F.CAPEX)} and a ${F.WEEKS}-week program`, { placeholder: 'title' });
  s.addText('Starting needs two things: the capital and a named executive sponsor.', {
    x: 0.8, y: 3.1, w: 11.7, h: 0.5, fontFace: BODY, fontSize: 18, color: ICE, margin: 0, isTextBox: true, objectName: 'subtitle',
  });
  s.addNotes(notes(`We need two things today: approval for ${money(F.CAPEX)} and an executive sponsor. The first results arrive with the central hub and ED rollout in weeks 11 to 13.`, 'Ask: approve capital and name an executive sponsor for the central hub and ED deployment in weeks 11 to 13.'));
  const x0 = 5.2;
  const span = 7.3;
  F.PHASES.forEach((p, i) => {
    const y = 3.7 + i * 0.42;
    s.addText(`${i + 1}. ${p.name}`, { x: 0.8, y, w: 4.2, h: 0.4, fontFace: BODY, fontSize: 14, color: 'FFFFFF', valign: 'middle', margin: 0, isTextBox: true });
    s.addShape(pres.shapes.RECTANGLE, { x: x0, y: y + 0.06, w: span, h: 0.28, fill: { color: '1F4673' }, line: { color: '1F4673' } });
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: x0 + ((p.start - 1) / F.WEEKS) * span, y: y + 0.06, w: ((p.end - p.start + 1) / F.WEEKS) * span, h: 0.28,
      fill: { color: ICE }, line: { color: ICE }, rectRadius: 0.05, objectName: `phase-${i + 1}`,
    });
  });
  s.addText('Week 1', { x: x0, y: 6.62, w: 1.2, h: 0.3, fontFace: BODY, fontSize: 11, color: ICE, margin: 0, isTextBox: true });
  s.addText(`Week ${F.WEEKS}`, { x: x0 + span - 1.2, y: 6.62, w: 1.2, h: 0.3, fontFace: BODY, fontSize: 11, color: ICE, align: 'right', margin: 0, isTextBox: true });
  s.addText(DISCLAIMER, { x: 0.8, y: 6.95, w: 11.7, h: 0.3, fontFace: BODY, fontSize: 9, color: ICE, margin: 0, isTextBox: true });
}

pres.writeFile({ fileName: OUT }).then((file) => console.log(`wrote ${file}`));
