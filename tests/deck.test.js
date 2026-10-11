// Builds the executive deck into a temp file and checks its structure and figures.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const JSZip = require('jszip');

const ROOT = path.join(__dirname, '..');
const metrics = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'metrics.json'), 'utf8'));
const F = require('../js/financials.js');

test('financials derive the plan ROI and payback', () => {
  const s = F.totalSavings();
  assert.equal(s, 4350000);
  assert.equal(F.roiPct().toFixed(1), '736.5');
  assert.equal(F.paybackMonths().toFixed(1), '1.4');
  assert.equal(F.PHASES.length, 7);
  assert.equal(F.PHASES[F.PHASES.length - 1].end, 16);
});

test('deck has 10 slides with figures from metrics.json', async () => {
  const out = path.join(os.tmpdir(), `deck-test-${process.pid}.pptx`);
  execFileSync(process.execPath, [path.join(ROOT, 'deck', 'build_deck.js'), out], { stdio: 'pipe' });
  const zip = await JSZip.loadAsync(fs.readFileSync(out));
  const slides = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
  assert.equal(slides.length, 10);

  let text = '';
  for (const f of slides) text += await zip.file(f).async('string');
  const a = metrics.scenarios.as_is;
  const b = metrics.scenarios.to_be;
  for (const expected of [
    `${(a.mean_tat / 60).toFixed(1)} h`,
    `${(b.mean_tat / 60).toFixed(1)} h`,
    `${(a.pce * 100).toFixed(2)}%`,
    `${metrics.comparison.tat_reduction_pct.toFixed(1)}%`,
    '736.5%',
    '$4.35M',
    'Sovereign Health System is a fictional organization',
  ]) {
    assert.ok(text.includes(expected), `deck is missing "${expected}"`);
  }
  fs.unlinkSync(out);
});
