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

async function buildDeck() {
  const out = path.join(os.tmpdir(), `deck-read-${process.pid}-${Date.now()}.pptx`);
  execFileSync(process.execPath, [path.join(ROOT, 'deck', 'build_deck.js'), out], { stdio: 'pipe' });
  const zip = await JSZip.loadAsync(fs.readFileSync(out));
  fs.unlinkSync(out);
  return zip;
}

const strip = (xml) => xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

test('every slide has a takeaway title and a plain subtitle', async () => {
  const zip = await buildDeck();
  const files = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
  assert.equal(files.length, 10);
  for (const f of files) {
    const xml = await zip.file(f).async('string');
    assert.ok(xml.includes('name="subtitle"'), `${f} has no subtitle`);
    const shape = xml.split('<p:sp>').find((s) => s.includes('type="title"'));
    const title = [...shape.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]).join('');
    assert.ok(title.split(/\s+/).length >= 5, `${f} title too short: "${title}"`);
    assert.ok(!title.trim().endsWith(':'), `${f} title ends with a colon`);
  }
});

test('every slide has a two-sentence talking point in its notes', async () => {
  const zip = await buildDeck();
  const files = Object.keys(zip.files).filter((f) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(f));
  assert.equal(files.length, 10);
  for (const f of files) {
    const text = strip(await zip.file(f).async('string'));
    const m = text.match(/Talking point: (.*?)(?: Detail: |$)/);
    assert.ok(m, `${f} has no talking point`);
    const sentences = (m[1].match(/[.!?](\s|$)/g) || []).length;
    assert.ok(sentences >= 2, `${f} talking point has ${sentences} sentence(s)`);
  }
});
