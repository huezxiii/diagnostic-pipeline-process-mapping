# Stitch UI Refresh and Plain-Language Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the case study site and executive deck easy for a non-technical hiring manager to follow, using layout patterns generated in Google Stitch, without changing any data or breaking the metric bindings.

**Architecture:** Stitch generated reference screens (project `7221245060446990275`, design system `assets/d5eba60ae1594eb9a4b367ef38ad4200`, source `.stitch/DESIGN.md`). Their patterns are ported by hand into the existing static HTML, `css/styles.css` and vanilla JS. Stitch markup is never pasted in: its numbers are placeholders. A new `js/glossary.js` owns jargon definitions. `js/charts.js` gains two shared helpers (`pairBars`, a `callout` Chart.js plugin). The deck keeps 10 slides and gains subtitles and plain talking-point notes.

**Tech Stack:** Static HTML/CSS, vanilla JS (ES2020), Chart.js 4.4.4 (CDN), Mermaid 11.4.1, PptxGenJS 3.12, pytest + Playwright (Python, Chrome channel fallback), node:test + JSZip.

## Global Constraints

- No build step, no new runtime library. The site stays three static pages served from the repo root.
- Data series colors are fixed: As-Is `#eb6834`, To-Be `#2a78d6`, value-added `#1baf7a`, neutral `#8a8f98`. Chrome stays navy `#14365d`, IBM Plex Sans/Serif/Mono.
- Every number on the page that has a `data-metric` or `data-roi` binding keeps it. Static text inside a bound element is only the fallback.
- Do not edit the Mermaid blocks inside `#as-is-map` / `#to-be-map` (`tests/test_diagrams.py` compares them to `diagrams/*.mmd`) or the `<pre data-source>` code excerpts on `methods.html` (`tests/test_methods_excerpts.py`).
- Deck stays at exactly 10 slides; every figure listed in `tests/deck.test.js` stays present.
- Copy rules (humanizer skill): no em or en dashes in prose (ranges become "12 to 24 h"), no "not X but Y" staging, no arrows (→) used as connectors in prose, no decorative bold, sentence-case headings. Code, data cells and Mermaid labels are exempt.
- "In short" lines: one sentence or two short ones, 5 to 25 words, no jargon.
- No horizontal scroll at 375 px; touch targets at least 44 px for new controls; text contrast at least 4.5:1.
- Before every commit run `python -m pytest -q` and `npm test`. Both must pass.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

## File map

| File | Change |
|---|---|
| `.stitch/DESIGN.md`, `.stitch/metadata.json` | Already written / created in Task 1. Stitch design record |
| `tests/conftest.py` | Create. Shared Playwright fixtures moved out of the smoke test, plus `open_page` |
| `tests/test_pages_smoke.py` | Remove its private fixtures (now in conftest) |
| `tests/test_readability.py` | Create. All new page tests, added task by task |
| `js/glossary.js` | Create. Term definitions, tooltip, glossary list |
| `js/charts.js` | Add `pairBars`, `callout` plugin, `grace` option on `axes` |
| `js/case-study.js` | `hoursNum` format, `drawPairs`, value-stream labels, progress rail |
| `js/dashboard.js` | Plain KPI labels, pair bars, takeaways, callouts |
| `index.html`, `dashboard.html`, `methods.html` | Copy, markup for new components |
| `css/styles.css` | Styles for every new component |
| `deck/build_deck.js`, `deck/sovereign-health-exec-briefing.pptx` | Subtitles, takeaway titles, talking-point notes, slide 5 layout |
| `tests/deck.test.js` | Subtitle, notes and title tests |
| `README.md`, `PROJECT_META.md` | Copy pass, metadata |

---

### Task 1: Test fixtures, Stitch record, and case study copy

**Files:**
- Create: `tests/conftest.py`, `tests/test_readability.py`, `.stitch/metadata.json`
- Modify: `tests/test_pages_smoke.py:1-44`, `index.html` (hero and all section headings/ledes), `js/case-study.js:20-27`, `css/styles.css:205-225`
- Commit also: `.stitch/DESIGN.md` (already on disk)

**Interfaces:**
- Produces: fixtures `base_url`, `browser`, `open_page(name, width=1280) -> playwright Page` (page has attribute `js_errors: list[str]`); helper `in_short_text(html: str, section_id: str) -> list[str]` in `tests/test_readability.py`; CSS class `.in-short`; format key `hoursNum` in `case-study.js` `FORMATS`.

- [ ] **Step 1: Move fixtures into `tests/conftest.py`**

```python
"""Shared Playwright fixtures: one local static server and one browser per test session."""
import functools
import http.server
import threading
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="session")
def base_url():
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_address[1]}"
    server.shutdown()


@pytest.fixture(scope="session")
def browser():
    sync_api = pytest.importorskip("playwright.sync_api")
    with sync_api.sync_playwright() as p:
        try:
            b = p.chromium.launch()
        except Exception:
            b = p.chromium.launch(channel="chrome")
        yield b
        b.close()


@pytest.fixture
def open_page(browser, base_url):
    """open_page("index.html", width=1280) returns a loaded page; all pages close after the test."""
    pages = []

    def _open(name, width=1280):
        page = browser.new_page(viewport={"width": width, "height": 900})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(f"{base_url}/{name}", wait_until="networkidle")
        page.wait_for_timeout(800)  # chart animation and Mermaid
        page.js_errors = errors
        pages.append(page)
        return page

    yield _open
    for page in pages:
        page.close()
```

In `tests/test_pages_smoke.py` delete the `base_url` and `browser` fixtures (lines 25-44) and the now-unused imports `functools`, `http.server`, `threading`. Keep `sync_api = pytest.importorskip("playwright.sync_api")`, `ROOT`, `PAGES`, `WIDTHS` and both tests unchanged.

- [ ] **Step 2: Run the existing suite to confirm the move is clean**

Run: `python -m pytest -q tests/test_pages_smoke.py`
Expected: 7 passed (6 parametrized renders + interactions).

- [ ] **Step 3: Write the failing copy tests in `tests/test_readability.py`**

```python
"""Readability checks: the plain-language aids a non-technical reader relies on."""
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
CASE_SECTIONS = ["problem", "scope", "as-is", "bottlenecks", "value-stream", "to-be",
                 "levers", "roadmap", "impact", "roi", "conclusion"]


def read(name):
    return (ROOT / name).read_text(encoding="utf-8")


def plain(fragment):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", fragment)).strip()


def in_short_text(html, section_id):
    """Text of every .in-short paragraph in a section; asserts each directly follows the h2."""
    block = re.search(rf'<section[^>]*id="{section_id}"[^>]*>(.*?)</section>', html, re.S)
    assert block, f"no section #{section_id}"
    body = block.group(1)
    found = re.findall(r'</h2>\s*<p class="in-short">(.*?)</p>', body, re.S)
    assert len(found) == len(re.findall(r'class="in-short"', body)), f"#{section_id}: .in-short not right after h2"
    return [plain(f) for f in found]


@pytest.mark.parametrize("section", CASE_SECTIONS)
def test_case_study_sections_open_with_in_short(section):
    lines = in_short_text(read("index.html"), section)
    assert len(lines) == 1, f"#{section} needs exactly one In short line"
    words = len(lines[0].split())
    assert 5 <= words <= 25, f"#{section}: {words} words"


def test_hero_states_the_outcome_plainly():
    h1 = plain(re.search(r"<h1>(.*?)</h1>", read("index.html"), re.S).group(1))
    assert h1 == "Lab results took 18.6 hours. The fix got them to 4.6 hours without buying new machines."


@pytest.mark.parametrize("name", ["index.html", "dashboard.html", "methods.html"])
def test_prose_has_no_dashes_or_arrow_connectors(name):
    html = read(name)
    html = re.sub(r'<pre.*?</pre>', "", html, flags=re.S)       # Mermaid and code
    html = re.sub(r'<td class="num"[^>]*>.*?</td>', "", html)    # data cells and placeholders
    text = plain(re.sub(r"<(script|style)[^>]*>.*?</\1>", "", html, flags=re.S))
    assert "—" not in text and "–" not in text, f"{name}: dash in prose"
    assert " → " not in text, f"{name}: arrow used as a connector"


def test_hero_figure_is_bound_to_metrics(open_page):
    page = open_page("index.html")
    assert page.inner_text(".hero-figure .from s") == "18.6 h"
    assert page.inner_text(".hero-figure .to [data-metric]") == "4.6 h"
    assert page.inner_text("h1") == "Lab results took 18.6 hours. The fix got them to 4.6 hours without buying new machines."
    assert not page.js_errors
```

- [ ] **Step 4: Run to verify failure**

Run: `python -m pytest -q tests/test_readability.py`
Expected: FAIL. `test_case_study_sections_open_with_in_short` fails for all 11 sections, the hero tests fail, and the dash test fails on `index.html` (arrows in KPI tiles and levers) and `methods.html` (arrows in the timestamp list, `12–24 h`, `16:00–17:59`; fixed in Step 7).

- [ ] **Step 5: Add `hoursNum` format to `js/case-study.js`**

In `FORMATS` (line 20) add after `hours`:

```js
    hoursNum: (x) => (x / 60).toFixed(1),
```

- [ ] **Step 6: Rewrite the hero and section copy in `index.html`**

Replace the meta description (line 7) with:

```html
  <meta name="description" content="Process mapping case study: lab results went from 18.6 hours to 4.6 by removing queues, with the same analyzers. Synthetic data, fictional organization.">
```

Replace the hero from `<p class="eyebrow">` through the closing `</div>` of `.hero-figure` (lines 36-43) with:

```html
      <p class="eyebrow">Process mapping case study · Sovereign Health System</p>
      <h1>Lab results took <span data-metric="scenarios.as_is.mean_tat" data-fmt="hoursNum">18.6</span> hours. The fix got them to <span data-metric="scenarios.to_be.mean_tat" data-fmt="hoursNum">4.6</span> hours without buying new machines.</h1>
      <p class="lede">Sovereign Health's 12 hospitals and 45 testing hubs handle 1.2 million lab orders a year. After a $6.5M analyzer upgrade, the average wait for a result rose from 4.2 to 18.6 hours. The analyzer itself accounted for 42 minutes of that.</p>
      <div class="hero-card">
        <div class="hero-figure">
          <p class="from"><span class="hero-label">Before</span><s data-metric="scenarios.as_is.mean_tat" data-fmt="hours">18.6 h</s></p>
          <svg class="hero-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          <p class="to"><span class="hero-label">After</span><span data-metric="scenarios.to_be.mean_tat" data-fmt="hours">4.6 h</span></p>
        </div>
        <p class="hero-note"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></svg><span><span data-metric="comparison.tat_reduction_pct" data-fmt="pctPoints">75.3%</span> faster with the same analyzers. The changes cost <span data-roi="capex">$520K</span>, save <span data-roi="savings">$4.35M</span> a year and pay for themselves in <span data-roi="payback">1.4 mo</span>.</span></p>
      </div>
```

The KPI grid stays as it is until Task 4, but remove its arrows now so the dash test passes: in the first two KPI tiles replace ` → ` with ` to `.

For each section, change the `h2`, insert the `.in-short` paragraph directly after the `h2`, and replace the lede where given. Exact copy:

| Section | New `h2` | `.in-short` text | New lede (omit = keep current) |
|---|---|---|---|
| `#problem` | `17.9 of the 18.6 hours was waiting` | `Samples spent almost all of that time sitting in bins, vans and queues. The test itself took 42 minutes.` | `Queues, retyping, fixed courier runs and paper tickets across five departments made up 96% of the cycle. The network paid for it in three ways.` |
| `#scope` | keep | `Before mapping anything, the teams agreed where the process starts (the doctor's order) and where it ends (the bill).` | `A SIPOC outline fixed the boundaries first, so clinical, logistics and IT teams were arguing about the same process.` |
| `#as-is` | `18 steps across five teams, with four queues` | `A sample passed through five teams and 18 steps, and it sat in a queue four times along the way.` | `Each row of this swimlane map is one team. The sample changes hands nine times and needs four manual sign-offs. Queue times are averages measured from the order timestamps.` |
| `#bottlenecks` | `Four problems caused most of the delay` | `Sample intake was the worst: a quarter of all the waiting happened at the desk where tubes are logged in by hand.` | `Ranking every step by wasted minutes put these four at the top.` |
| `#value-stream` | `Only 42 minutes of 18.6 hours was real work` | `Testing is the only step that changes the sample. Everything else, about 96% of the time, is waiting, moving or fixing mistakes.` | `Across the whole value stream, process cycle efficiency (the share of time spent on real work) was <span data-metric="scenarios.as_is.pce" data-fmt="pct">3.8%</span>. Hospitals aim for more than 15%.` |
| `#to-be` | `12 steps, with scans in place of retyping` | `The new process drops six steps. Scans and automatic messages replace the points where people retyped information.` | `Couriers now leave as soon as a box holds 25 tubes, and label problems go to the clinic's tablet for a photo check.` |
| `#levers` | keep | `Each change targets one of the four problems above, so every fix traces back to a cause.` | (none) |
| `#roadmap` | `A 16-week plan in seven phases` | `Seven phases over 16 weeks: measure first, test the new design in a pilot, then roll it out to every site.` | (none) |
| `#impact` | `Quality improves along with speed` | `Results arrive faster and with fewer errors: less retyping, fewer rejected samples and quicker alerts for dangerous values.` | `Each figure is recalculated from the synthetic order log, which is tuned to match the project's study of 10,000 past orders.` |
| `#roi` | keep | `The changes cost <span data-roi="capex">$520K</span> once and save <span data-roi="savings">$4.35M</span> every year, so they pay for themselves in under two months.` | (none) |
| `#conclusion` | `Fixing the flow of work beat buying more hardware` | `The expensive analyzer was never the bottleneck. The delays came from how samples and information moved between teams.` | `Mapping the whole pipeline, timing every queue from the order records and putting rules on what counts as urgent turned a disappointing $6.5M purchase into a service that is 75% faster and recovers $4.35M a year.` |

Markup pattern for every section:

```html
        <p class="section-num">01 · The problem</p>
        <h2>17.9 of the 18.6 hours was waiting</h2>
        <p class="in-short">Samples spent almost all of that time sitting in bins, vans and queues. The test itself took 42 minutes.</p>
        <p class="lede">Queues, retyping, fixed courier runs and paper tickets across five departments made up 96% of the cycle. The network paid for it in three ways.</p>
```

In the lever cards replace each ` → ` between `.before` and `.after` with ` to ` for now (Task 5 rebuilds these).

- [ ] **Step 7: Remove dashes and arrows from `methods.html` prose**

The dash test skips `td class="num"` cells but the first column cells are prose. In `methods.html`:
- `<td>Clinic arrivals 16:00–17:59</td>` becomes `<td>Clinic arrivals 16:00 to 17:59</td>`
- `<td class="num">12–24 h</td>` becomes `<td class="num">12 to 24 h</td>` (a plan figure, not a placeholder)
- in the "Timestamps per order" list, each `<code>A</code> → <code>B</code>: label` becomes `<code>A</code> to <code>B</code>: label` (seven items)

- [ ] **Step 8: Add hero card and In short styles to `css/styles.css`**

Replace the four rules `.hero-figure`, `.hero-figure .from`, `.hero-figure .to`, `.hero-figure .caption` (lines 209-212) with:

```css
.hero-card {
  display: inline-flex; flex-direction: column; gap: 14px; max-width: 100%;
  margin: 28px 0 24px; padding: 20px 24px;
  background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow);
}
.hero-figure { display: flex; align-items: flex-end; flex-wrap: wrap; gap: 8px 24px; }
.hero-figure p { margin: 0; display: flex; flex-direction: column; gap: 2px; }
.hero-label { font-size: 12px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
.hero-figure .to .hero-label { color: var(--series-to-be); }
.hero-figure .from s {
  font-size: clamp(28px, 5vw, 44px); font-weight: 600; color: var(--muted);
  text-decoration-thickness: 3px; text-decoration-color: var(--series-as-is);
}
.hero-figure .to [data-metric] { font-size: clamp(48px, 9vw, 80px); font-weight: 600; line-height: 1; letter-spacing: -0.02em; }
.hero-arrow { width: 28px; height: 28px; color: var(--muted); margin-bottom: 10px; }
.hero-note {
  display: flex; gap: 8px; align-items: flex-start; margin: 0; padding-top: 12px;
  border-top: 1px solid var(--line); font-size: 15px; color: var(--ink-2); max-width: 56ch;
}
.hero-note svg { width: 18px; height: 18px; flex: none; margin-top: 3px; color: var(--good-text); }

.in-short {
  max-width: 68ch; margin: 4px 0 20px; padding: 14px 18px; border-radius: var(--radius);
  background: var(--brand-soft); color: var(--ink); font-size: 17px; font-weight: 500;
}
.in-short::before {
  content: "In short"; display: block; margin-bottom: 4px;
  font-size: 12px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--brand);
}
```

- [ ] **Step 9: Write `.stitch/metadata.json`**

```json
{
  "projectId": "7221245060446990275",
  "title": "Sovereign Health Diagnostic Pipeline",
  "designSystem": "assets/d5eba60ae1594eb9a4b367ef38ad4200",
  "designMd": ".stitch/DESIGN.md",
  "screens": {
    "case_study": "projects/7221245060446990275/screens/3544e86a7b2f4096b7980ae9cc2b97de",
    "dashboard": "projects/7221245060446990275/screens/36c7fc4ace6a4905a76b2a7d8757ff05",
    "methods": "projects/7221245060446990275/screens/f368c3243f48434887a98bd4435ee61b",
    "slide": "projects/7221245060446990275/screens/c7ad5ea783bb4144ad77aacabd4c5474"
  },
  "note": "Screens are layout references only. Their numbers are Stitch placeholders; the site's figures come from data/metrics.json."
}
```

- [ ] **Step 10: Run tests**

Run: `python -m pytest -q`
Expected: all pass (71 existing + new readability tests).

- [ ] **Step 11: Commit**

```bash
git add tests/conftest.py tests/test_pages_smoke.py tests/test_readability.py index.html methods.html js/case-study.js css/styles.css .stitch/
git commit -m "feat(case-study): plain-language hero, In short lines and Stitch design record"
```

---

### Task 2: Jargon tooltips and glossary

**Files:**
- Create: `js/glossary.js`
- Modify: `index.html` (wrap terms, glossary section, script tag), `dashboard.html` (wrap terms in priority chart heading, script tag), `methods.html` (wrap terms, script tag), `css/styles.css`
- Test: `tests/test_readability.py`

**Interfaces:**
- Consumes: `open_page` fixture (Task 1).
- Produces: markup contract `<dfn data-term="KEY">` with KEY in `tat, pce, stat, priority-inversion, sipoc, accessioning, value-stream, swimlane, rekey`; after load each gets `data-def` and `tabindex="0"`. Shared tooltip element `#dfn-tip.dfn-tip`. `#glossary-list` (a `<dl>`) is filled with one `<div><dt/><dd/></div>` per term.

- [ ] **Step 1: Add failing tests to `tests/test_readability.py`**

```python
PAGES = ["index.html", "dashboard.html", "methods.html"]
TERMS = ["tat", "pce", "stat", "priority-inversion", "sipoc", "accessioning", "value-stream", "swimlane", "rekey"]


@pytest.mark.parametrize("name", PAGES)
def test_jargon_has_definitions(open_page, name):
    page = open_page(name)
    terms = page.locator("dfn[data-term]")
    assert terms.count() >= 2, f"{name}: no defined terms"
    defs = terms.evaluate_all("els => els.map(e => e.dataset.def || '')")
    assert all(len(d.split()) >= 5 for d in defs), defs
    assert not page.js_errors


def test_index_defines_every_term():
    keys = re.findall(r'<dfn data-term="([^"]+)"', read("index.html"))
    assert sorted(set(keys)) == sorted(TERMS)


def test_definition_shows_on_keyboard_focus(open_page):
    page = open_page("index.html")
    first = page.locator("dfn[data-term]").first
    first.focus()
    tip = page.locator("#dfn-tip")
    assert tip.is_visible()
    assert first.get_attribute("data-def") in tip.inner_text()
    page.keyboard.press("Escape")
    assert not tip.is_visible()


@pytest.mark.parametrize("name", PAGES)
def test_open_definition_never_scrolls_sideways(open_page, name):
    page = open_page(name, width=375)
    last = page.locator("dfn[data-term]").last
    last.scroll_into_view_if_needed()
    last.click()
    assert page.locator("#dfn-tip").is_visible()
    assert page.evaluate("document.documentElement.scrollWidth - window.innerWidth") <= 0


def test_glossary_lists_every_term(open_page):
    page = open_page("index.html")
    rows = page.locator("#glossary-list > div")
    assert rows.count() == len(TERMS)
    for i in range(rows.count()):
        assert rows.nth(i).locator("dt").inner_text().strip()
        assert len(rows.nth(i).locator("dd").inner_text().split()) >= 5
```

- [ ] **Step 2: Run to verify failure**

Run: `python -m pytest -q tests/test_readability.py -k "jargon or term or definition or glossary"`
Expected: FAIL (no `dfn` elements, no `#glossary-list`).

- [ ] **Step 3: Create `js/glossary.js`**

```js
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
```

- [ ] **Step 4: Wrap terms in the pages**

`index.html` (first use of each term; one `dfn` per key):

| Where | Change |
|---|---|
| `#scope` lede | `A SIPOC outline` → `A <dfn data-term="sipoc">SIPOC</dfn> outline` |
| `#as-is` lede | `this swimlane map` → `this <dfn data-term="swimlane">swimlane map</dfn>` |
| bottleneck 1 `h3` | `1. Central accessioning (Queue 3)` → `1. Central <dfn data-term="accessioning">accessioning</dfn> (Queue 3)` |
| bottleneck 1 Impact `dd` | `an 8.4% re-key error rate` → `an 8.4% <dfn data-term="rekey">re-key error</dfn> rate` |
| bottleneck 2 `h3` | `2. STAT priority inversion` → `2. <dfn data-term="stat">STAT</dfn> <dfn data-term="priority-inversion">priority inversion</dfn>` |
| `#value-stream` lede | `the whole value stream, process cycle efficiency` → `the whole <dfn data-term="value-stream">value stream</dfn>, <dfn data-term="pce">process cycle efficiency</dfn>` |
| `#impact` table first row | `<td>Mean time-to-result</td>` → `<td>Mean <dfn data-term="tat">time-to-result</dfn></td>` |

Add after the `#conclusion` section, before `</main>`:

```html
    <!-- Glossary -->
    <section class="section" id="glossary">
      <div class="container">
        <p class="section-num">Glossary</p>
        <h2>Terms used on this page</h2>
        <dl class="glossary-list" id="glossary-list"></dl>
      </div>
    </section>
```

`dashboard.html`: change `<h2>STAT priority inversion</h2>` to `<h2><dfn data-term="stat">STAT</dfn> <dfn data-term="priority-inversion">priority inversion</dfn></h2>`.

`methods.html`: in the timestamp list change `: accessioning</li>` to `: <dfn data-term="accessioning">accessioning</dfn></li>`; in the calibration table change `<td>Mean time-to-result</td>` to `<td>Mean <dfn data-term="tat">time-to-result</dfn></td>` and `<td>Process cycle efficiency</td>` to `<td><dfn data-term="pce">Process cycle efficiency</dfn></td>`.

On all three pages add `<script src="js/glossary.js"></script>` directly before the page controller script (`js/case-study.js`, `js/dashboard.js`, `js/methods.js`).

- [ ] **Step 5: Add styles to `css/styles.css`** (before the `/* ---------- Responsive ---------- */` block)

```css
/* ---------- Definitions & glossary ---------- */
dfn[data-term] {
  font-style: normal; cursor: help;
  text-decoration: underline dotted; text-decoration-color: var(--ink-2); text-underline-offset: 3px;
}
.dfn-tip {
  position: absolute; z-index: 60; max-width: min(320px, calc(100vw - 32px));
  background: var(--surface); border: 1px solid var(--line-strong); border-radius: var(--radius-sm);
  box-shadow: var(--shadow); padding: 10px 12px; font-size: 14px; line-height: 1.45; color: var(--ink);
  font-family: var(--font-sans); font-weight: 400; letter-spacing: 0; text-transform: none;
}
.dfn-tip strong {
  display: block; margin-bottom: 4px; font-family: var(--font-mono); font-size: 11px; font-weight: 500;
  letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted);
}
.glossary-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: 16px 0 0; }
.glossary-list > div { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 14px 16px; }
.glossary-list dt { font-weight: 600; margin-bottom: 4px; }
.glossary-list dd { margin: 0; font-size: 15px; color: var(--ink-2); }
```

In the `@media (max-width: 760px)` block add `.glossary-list` to the single-column selector list.

- [ ] **Step 6: Run tests**

Run: `python -m pytest -q`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add js/glossary.js index.html dashboard.html methods.html css/styles.css tests/test_readability.py
git commit -m "feat: plain-language definitions for jargon and a case study glossary"
```

---

### Task 3: Story progress rail

**Files:**
- Modify: `index.html` (header), `js/case-study.js`, `css/styles.css`
- Test: `tests/test_readability.py`

**Interfaces:**
- Produces: `.progress-rail` with four `a[data-stage]` (`problem`, `cause`, `fix`, `result`); the active one has `aria-current="step"`, earlier ones class `done`. Function `initProgressRail()` in `case-study.js`.

- [ ] **Step 1: Add failing test**

```python
def test_progress_rail_tracks_the_story(open_page):
    page = open_page("index.html")
    texts = [re.sub(r"\s+", "", t) for t in page.locator(".progress-rail a[data-stage]").all_inner_texts()]
    assert texts == ["1Problem", "2Cause", "3Fix", "4Result"]
    page.evaluate("document.getElementById('levers').scrollIntoView({block: 'start'})")
    page.wait_for_timeout(300)
    assert page.locator('.progress-rail [aria-current="step"]').get_attribute("data-stage") == "fix"
    assert page.locator(".progress-rail a.done").count() == 2
    assert page.locator(".progress-rail").is_visible()  # sticky header keeps it on screen
```

- [ ] **Step 2: Run to verify failure**

Run: `python -m pytest -q tests/test_readability.py::test_progress_rail_tracks_the_story`
Expected: FAIL (no `.progress-rail`).

- [ ] **Step 3: Add the rail to the `index.html` header** (inside `<header class="site-nav">`, after the closing `</div>` of `.container`)

```html
    <nav class="progress-rail" aria-label="Story progress">
      <ol>
        <li><a href="#problem" data-stage="problem"><span class="dot" aria-hidden="true">1</span>Problem</a></li>
        <li><a href="#as-is" data-stage="cause"><span class="dot" aria-hidden="true">2</span>Cause</a></li>
        <li><a href="#to-be" data-stage="fix"><span class="dot" aria-hidden="true">3</span>Fix</a></li>
        <li><a href="#impact" data-stage="result"><span class="dot" aria-hidden="true">4</span>Result</a></li>
      </ol>
    </nav>
```

- [ ] **Step 4: Add `initProgressRail` to `js/case-study.js`** (before the call list at the bottom) and call it last

```js
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
```

Bottom of the file:

```js
  renderSwimlanes();
  initProgressRail();
```

- [ ] **Step 5: Styles**

```css
/* ---------- Progress rail (case study) ---------- */
.progress-rail { border-top: 1px solid var(--line); }
.progress-rail ol {
  list-style: none; margin: 0 auto; padding: 0 var(--gutter); max-width: var(--max);
  display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px;
}
.progress-rail a {
  display: flex; align-items: center; gap: 8px; min-height: 44px;
  font-size: 13px; font-weight: 500; color: var(--muted); text-decoration: none;
}
.progress-rail a::after { content: ""; flex: 1; height: 2px; border-radius: 1px; background: var(--line); }
.progress-rail li:last-child a::after { display: none; }
.progress-rail .dot {
  display: grid; place-items: center; flex: none; width: 22px; height: 22px; border-radius: 50%;
  font-family: var(--font-mono); font-size: 12px; background: var(--surface-2); color: var(--ink-2);
}
.progress-rail a.done { color: var(--ink-2); }
.progress-rail a.done .dot { background: var(--brand); color: var(--brand-ink); }
.progress-rail a.done::after { background: var(--brand); }
.progress-rail a[aria-current="step"] { color: var(--brand); font-weight: 600; }
.progress-rail a[aria-current="step"] .dot { background: var(--surface); color: var(--brand); box-shadow: 0 0 0 2px var(--brand); }
:root:has(.progress-rail) { scroll-padding-top: 116px; }
```

In `@media (max-width: 480px)` add:

```css
  .progress-rail a::after { display: none; }
  .progress-rail a { font-size: 12px; gap: 6px; }
```

- [ ] **Step 6: Run tests**

Run: `python -m pytest -q`
Expected: all pass, including the 375 px smoke test (no sideways scroll).

- [ ] **Step 7: Commit**

```bash
git add index.html js/case-study.js css/styles.css tests/test_readability.py
git commit -m "feat(case-study): sticky Problem, Cause, Fix, Result progress rail"
```

---

### Task 4: Before and after bars, and labelled value stream

**Files:**
- Modify: `js/charts.js`, `js/case-study.js`, `js/dashboard.js:53-79`, `index.html` (hero KPI grid, `#vsm`), `css/styles.css`
- Test: `tests/test_readability.py`

**Interfaces:**
- Produces: `PipelineCharts.pairBars(before: number, after: number, label: string) -> HTMLElement` (a `.pair` with two `.pair-track > .pair-bar.as-is|.to-be`, widths as `%` of the larger value, minimum 2%). `drawPairs()` in `case-study.js`. Value-stream label hooks `[data-vsm-waiting=as_is|to_be]`, `[data-vsm-work=as_is|to_be]`. Dashboard tiles gain `.kpi-was` and `.pair` in To-Be and Compare views.

- [ ] **Step 1: Add failing tests**

```python
def test_hero_kpis_show_before_after_bars(open_page):
    page = open_page("index.html")
    tiles = page.locator("#hero-kpis .kpi")
    assert tiles.count() == 4
    for i in range(4):
        bars = tiles.nth(i).locator(".pair .pair-bar")
        assert bars.count() == 2
        assert "100%" in bars.evaluate_all("els => els.map(e => e.style.width)")


def test_value_stream_labels_waiting_share(open_page):
    page = open_page("index.html")
    assert page.inner_text('[data-vsm-waiting="as_is"]') == "Waiting: 96.2% (17.9 h)"
    assert page.inner_text('[data-vsm-work="as_is"]') == "Real work: 42 min (3.8%)"
    assert page.inner_text('[data-vsm-waiting="to_be"]') == "Waiting: 84.8% (3.9 h)"


def test_dashboard_kpis_pair_only_when_comparing(open_page):
    page = open_page("dashboard.html")
    assert page.locator("#kpis .pair").count() == 0
    page.click("[data-view=to_be]")
    assert page.locator("#kpis .pair").count() == 7
    assert page.locator("#kpis .kpi-was").first.inner_text().startswith("was ")
```

- [ ] **Step 2: Run to verify failure**

Run: `python -m pytest -q tests/test_readability.py -k "pair or value_stream"`
Expected: FAIL.

- [ ] **Step 3: Add `pairBars` to `js/charts.js`** (above `applyDefaults();`) and export it

```js
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
```

Export line becomes:

```js
  root.PipelineCharts = { COLORS, SCENARIO, fmt, available, axes, render, setEmpty, wireTableToggles, pairBars };
```

- [ ] **Step 4: Replace the hero KPI grid in `index.html`**

```html
      <div class="kpi-grid" id="hero-kpis">
        <div class="kpi" data-pair="pce">
          <p class="kpi-label">Share of time doing real work</p>
          <p class="kpi-pair-values"><s data-metric="scenarios.as_is.pce" data-fmt="pct">3.8%</s><span data-metric="scenarios.to_be.pce" data-fmt="pct">15.2%</span></p>
          <p class="kpi-note">Hospitals aim for more than 15%</p>
        </div>
        <div class="kpi" data-pair="stat_ratio">
          <p class="kpi-label">Orders marked urgent</p>
          <p class="kpi-pair-values"><s data-metric="scenarios.as_is.stat_ratio" data-fmt="pct0">38%</s><span data-metric="scenarios.to_be.stat_ratio" data-fmt="pct0">8%</span></p>
          <p class="kpi-note">Urgent means urgent again</p>
        </div>
        <div class="kpi" data-pair="rejection_rate">
          <p class="kpi-label">Samples rejected</p>
          <p class="kpi-pair-values"><s data-metric="scenarios.as_is.rejection_rate" data-fmt="pct">3.2%</s><span data-metric="scenarios.to_be.rejection_rate" data-fmt="pct">0.4%</span></p>
          <p class="kpi-note">Fewer repeat blood draws</p>
        </div>
        <div class="kpi" data-pair="mean_critical_lag">
          <p class="kpi-label">Delay on dangerous results</p>
          <p class="kpi-pair-values"><s data-metric="scenarios.as_is.mean_critical_lag" data-fmt="min">48 min</s><span data-metric="scenarios.to_be.mean_critical_lag" data-fmt="min">4 min</span></p>
          <p class="kpi-note">From lab flag to doctor alert</p>
        </div>
      </div>
      <ul class="legend" aria-hidden="true">
        <li><span class="swatch" style="background:var(--series-as-is)"></span>Before (As-Is)</li>
        <li><span class="swatch" style="background:var(--series-to-be)"></span>After (To-Be)</li>
      </ul>
```

- [ ] **Step 5: Replace the `#vsm` rows in `index.html`**

```html
        <div id="vsm">
          <div class="vsm-row">
            <h3>As-Is <span><span data-metric="scenarios.as_is.mean_tat" data-fmt="hours">18.6 h</span> in total</span></h3>
            <p class="vsm-head"><span class="vsm-waiting" data-vsm-waiting="as_is">Waiting: 96.2% (17.9 h)</span><span class="vsm-work" data-vsm-work="as_is">Real work: 42 min (3.8%)</span></p>
            <div class="vsm-bar" data-vsm="as_is" role="img" aria-label="As-Is: 42 value-added minutes out of 1,116"></div>
          </div>
          <div class="vsm-row">
            <h3>To-Be <span><span data-metric="scenarios.to_be.mean_tat" data-fmt="hours">4.6 h</span> in total</span></h3>
            <p class="vsm-head"><span class="vsm-waiting" data-vsm-waiting="to_be">Waiting: 84.8% (3.9 h)</span><span class="vsm-work" data-vsm-work="to_be">Real work: 42 min (15.2%)</span></p>
            <div class="vsm-bar" data-vsm="to_be" role="img" aria-label="To-Be: 42 value-added minutes out of 276"></div>
          </div>
```

Keep the existing `.vsm-legend` and the "Bars share one scale" note after the second row unchanged, then add before the closing `</div>` of `#vsm`:

```html
          <p class="takeaway">A faster analyzer could only shrink the 42 minutes of testing. The 17.9 hours of waiting would stay.</p>
```

- [ ] **Step 6: Fill the labels and pairs in `js/case-study.js`**

Inside `drawValueStream`, after `bar.setAttribute('aria-label', ...)`:

```js
      const key = bar.dataset.vsm;
      const waiting = document.querySelector(`[data-vsm-waiting="${key}"]`);
      if (waiting) waiting.textContent = `Waiting: ${((1 - sc.pce) * 100).toFixed(1)}% (${((sc.mean_tat - sc.mean_va) / 60).toFixed(1)} h)`;
      const work = document.querySelector(`[data-vsm-work="${key}"]`);
      if (work) work.textContent = `Real work: ${Math.round(sc.mean_va)} min (${(sc.pce * 100).toFixed(1)}%)`;
```

New function, called right after `bindRoi();`:

```js
  function drawPairs() {
    if (!metrics) return;
    document.querySelectorAll('.kpi[data-pair]').forEach((tile) => {
      const key = tile.dataset.pair;
      const values = tile.querySelector('.kpi-pair-values');
      const label = `Before ${values.children[0].textContent}, after ${values.children[1].textContent}`;
      tile.querySelector('.pair')?.remove();
      values.after(C.pairBars(metrics.scenarios.as_is[key], metrics.scenarios.to_be[key], label));
    });
  }
```

- [ ] **Step 7: Dashboard tiles in `js/dashboard.js`**

In `renderKpis`, replace the `foot = ...kpi-delta...` assignment with:

```js
          foot = `<p class="kpi-was">was ${k.fmt(before)}</p>
            ${C.pairBars(before, value, `Before ${k.fmt(before)}, after ${k.fmt(value)}`).outerHTML}
            <p class="kpi-delta ${better ? 'good' : 'bad'}">${d < 0 ? ARROW_DOWN : ARROW_UP}
            ${sign}${Math.abs(d).toFixed(1)}% vs As-Is <span class="visually-hidden">(${better ? 'improvement' : 'worse'})</span></p>`;
```

- [ ] **Step 8: Styles**

```css
/* ---------- Before/after pairs ---------- */
.kpi-pair-values { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 10px; margin: 0; font-size: 26px; font-weight: 600; line-height: 1.1; }
.kpi-pair-values s { font-size: 17px; font-weight: 500; color: var(--muted); text-decoration-color: var(--series-as-is); text-decoration-thickness: 2px; }
.kpi-was { font-size: 12px; color: var(--muted); margin: 2px 0 0; }
.pair { display: grid; gap: 4px; margin: 10px 0 0; }
.pair-track { display: block; height: 6px; border-radius: 3px; background: var(--surface-2); overflow: hidden; }
.pair-bar { display: block; height: 100%; border-radius: 3px; }
.pair-bar.as-is { background: var(--series-as-is); }
.pair-bar.to-be { background: var(--series-to-be); }
#hero-kpis + .legend { margin-top: 10px; }

.vsm-head {
  display: flex; justify-content: space-between; flex-wrap: wrap; gap: 4px 16px;
  margin: 6px 0 0; font-family: var(--font-mono); font-size: 13px;
}
.vsm-waiting { color: var(--ink-2); }
.vsm-work { color: var(--series-va-text); }
.vsm-row .vsm-bar { margin-top: 8px; }
.takeaway { margin: 16px 0 0; padding: 12px 16px; max-width: 68ch; border-radius: var(--radius); background: var(--surface-2); font-size: 15px; }
```

Add the token to `:root` under the data series block (contrast 5:1 on the canvas):

```css
  --series-va-text: #0b7a54;
```

- [ ] **Step 9: Run tests**

Run: `python -m pytest -q`
Expected: all pass. `test_dashboard_interactions` still finds `.kpi-delta.good` five or more times.

- [ ] **Step 10: Commit**

```bash
git add js/charts.js js/case-study.js js/dashboard.js index.html css/styles.css tests/test_readability.py
git commit -m "feat: before/after bars on KPI tiles and a labelled waiting-vs-work value stream"
```

---

### Task 5: Pair each fix with its problem

**Files:**
- Modify: `index.html` (`#bottlenecks`, `#levers`), `css/styles.css:271-276`
- Test: `tests/test_readability.py`

**Interfaces:**
- Produces: bottleneck ids `b-accessioning`, `b-stat`, `b-courier`, `b-exceptions`; lever ids `l-sorters`, `l-stat`, `l-dispatch`, `l-portal`; links `a.fixed-by` (problem to fix) and `a.fixes` (fix to problem).

- [ ] **Step 1: Failing test**

```python
def test_every_fix_links_to_its_problem():
    html = read("index.html")
    fixes = dict(re.findall(r'<article class="card lever" id="([^"]+)">.*?<a class="fixes" href="#([^"]+)"', html, re.S))
    fixed_by = dict(re.findall(r'<article class="card bottleneck" id="([^"]+)">.*?<a class="fixed-by" href="#([^"]+)"', html, re.S))
    assert len(fixes) == 4 and len(fixed_by) == 4
    for lever, problem in fixes.items():
        assert fixed_by[problem] == lever, f"{lever} and {problem} do not point at each other"
    lever_order = re.findall(r'<article class="card lever" id="([^"]+)"', html)
    assert lever_order == ["l-sorters", "l-stat", "l-dispatch", "l-portal"]
```

- [ ] **Step 2: Run to verify failure**

Run: `python -m pytest -q tests/test_readability.py::test_every_fix_links_to_its_problem`
Expected: FAIL.

- [ ] **Step 3: Bottleneck cards** — add the id to each `<article class="card bottleneck">` and a link as the last child of the article:

| Card | id | Link |
|---|---|---|
| 1 Central accessioning | `b-accessioning` | `<p class="pair-link"><a class="fixed-by" href="#l-sorters">Fixed by: optical sorters</a></p>` |
| 2 STAT priority inversion | `b-stat` | `<p class="pair-link"><a class="fixed-by" href="#l-stat">Fixed by: rules for urgent orders</a></p>` |
| 3 Fixed courier schedules | `b-courier` | `<p class="pair-link"><a class="fixed-by" href="#l-dispatch">Fixed by: pickups when a box is full</a></p>` |
| 4 Paper exception tickets | `b-exceptions` | `<p class="pair-link"><a class="fixed-by" href="#l-portal">Fixed by: a digital exception portal</a></p>` |

- [ ] **Step 4: Rebuild the lever grid** in problem order. Replace the `.grid-2` inside `#levers` with:

```html
        <div class="grid-2">
          <article class="card lever" id="l-sorters">
            <p class="pair-link"><a class="fixes" href="#b-accessioning">Fixes problem 1: the intake queue</a></p>
            <h3>Optical accessioning sorters</h3>
            <p>Robotic sorters scan, uncap and spin 1,200 tubes an hour, so nobody retypes labels.</p>
            <p class="before-after"><span class="before"><small>Before</small><s>4.5 h</s></span><span class="after"><small>After</small><span data-metric="scenarios.to_be.stage_means.accessioning" data-fmt="min">12 min</span></span></p>
          </article>
          <article class="card lever" id="l-stat">
            <p class="pair-link"><a class="fixes" href="#b-stat">Fixes problem 2: too many urgent orders</a></p>
            <h3>Rules for urgent orders in the EHR</h3>
            <p>An order only counts as urgent with an objective reason, such as an active ED visit or abnormal vital signs. Overrides need the medical director's approval.</p>
            <p class="before-after"><span class="before"><small>Before</small><s>38% urgent</s></span><span class="after"><small>After</small><span><span data-metric="scenarios.to_be.stat_ratio" data-fmt="pct0">8%</span> urgent</span></span></p>
          </article>
          <article class="card lever" id="l-dispatch">
            <p class="pair-link"><a class="fixes" href="#b-courier">Fixes problem 3: fixed courier times</a></p>
            <h3>Pickups when a box is full</h3>
            <p>When 25 tubes are scanned into a smart box, the nearest courier gets dispatched automatically.</p>
            <p class="before-after"><span class="before"><small>Before</small><s>2.8 h</s></span><span class="after"><small>After</small><span data-metric="scenarios.to_be.stage_means.clinic_hold" data-fmt="min">35 min</span></span></p>
          </article>
          <article class="card lever" id="l-portal">
            <p class="pair-link"><a class="fixes" href="#b-exceptions">Fixes problem 4: paper tickets</a></p>
            <h3>Digital exception portal</h3>
            <p>A label mismatch sends a notice to the clinic's tablet for a photo check in place of a paper ticket.</p>
            <p class="before-after"><span class="before"><small>Before</small><s>18 h</s></span><span class="after"><small>After</small><span data-metric="scenarios.to_be.mean_exception_resolution" data-fmt="min">22 min</span></span></p>
          </article>
        </div>
```

- [ ] **Step 5: Styles** — replace the `.lever .before-after`, `.lever .before`, `.lever .after`, `.lever .tag` rules with:

```css
.lever .before-after { display: flex; align-items: flex-end; gap: 24px; flex-wrap: wrap; margin-top: 12px; }
.lever .before-after small { display: block; font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); }
.lever .before s { font-size: 16px; color: var(--muted); text-decoration-color: var(--series-as-is); }
.lever .after > span { font-weight: 600; font-size: 22px; }
.pair-link { margin: 0 0 10px; }
.bottleneck .pair-link { margin: 14px 0 0; }
.pair-link a {
  display: inline-flex; align-items: center; min-height: 32px; padding: 4px 12px; border-radius: 999px;
  background: var(--brand-soft); color: var(--brand); font-size: 13px; font-weight: 500; text-decoration: none;
}
.pair-link a:hover { text-decoration: underline; }
```

- [ ] **Step 6: Run tests**

Run: `python -m pytest -q`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add index.html css/styles.css tests/test_readability.py
git commit -m "feat(case-study): link each fix to the problem it removes"
```

---

### Task 6: Dashboard that explains itself

**Files:**
- Modify: `dashboard.html`, `js/charts.js`, `js/dashboard.js`, `css/styles.css`
- Test: `tests/test_readability.py`

**Interfaces:**
- Consumes: `pairBars` (Task 4).
- Produces: `PipelineCharts.axes({..., grace})`; global Chart.js plugin id `callout` with options `{ datasetIndex: number, index: number, text: string }` (or `false`); per-card `p.how-to-read`; `p.chart-takeaway` with ids `stages-takeaway`, `hist-takeaway`, `arrivals-takeaway`, `priority-takeaway`.

- [ ] **Step 1: Failing tests**

```python
def test_every_chart_explains_how_to_read_it(open_page):
    page = open_page("dashboard.html")
    cards = page.locator(".chart-card")
    assert cards.count() == 7
    for i in range(7):
        text = cards.nth(i).locator(".how-to-read").inner_text()
        assert text.startswith("How to read this:") and len(text.split()) >= 10, text


def test_charts_call_out_the_key_point(open_page):
    page = open_page("dashboard.html")
    assert page.evaluate("Chart.getChart('c-stages').options.plugins.callout.text") == "Biggest queue"
    assert page.inner_text("#stages-takeaway").startswith("Biggest queue: Central Accessioning")
    assert page.evaluate("Chart.getChart('c-priority').options.plugins.callout.text") == "Longest wait"
    assert "upside down" in page.inner_text("#priority-takeaway")
    assert "within 6 hours" in page.inner_text("#hist-takeaway")
    assert "capacity" in page.inner_text("#arrivals-takeaway")
    page.click("[data-view=to_be]")
    assert "upside down" not in page.inner_text("#priority-takeaway")


def test_takeaways_clear_when_no_orders_match(open_page):
    page = open_page("dashboard.html")
    page.select_option("#f-source", "ED")
    page.select_option("#f-facility", "C01")
    assert all(t.strip() == "" for t in page.locator(".chart-takeaway").all_inner_texts())
    assert "NaN" not in page.inner_text("main")
```

- [ ] **Step 2: Run to verify failure**

Run: `python -m pytest -q tests/test_readability.py -k "how_to_read or call_out or takeaways"`
Expected: FAIL.

- [ ] **Step 3: Callout plugin and `grace` in `js/charts.js`**

In `axes`, add `grace` to the destructured options and to the value axis:

```js
  function axes({ horizontal = false, stacked = false, valueTitle = '', tickFormat, max, grace } = {}) {
    const value = {
      beginAtZero: true,
      stacked,
      max,
      grace,
```

Add above `applyDefaults`:

```js
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
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(opts.text, x + 8, y);
      } else {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(opts.text, x, y - 6);
      }
      ctx.restore();
    },
  };
```

In `applyDefaults`, first line after the `available()` guard:

```js
    root.Chart.register(calloutPlugin);
```

- [ ] **Step 4: Dashboard markup in `dashboard.html`**

Lede (replace the `.page-head .lede`):

```html
      <p class="lede">Each scenario holds 10,000 lab orders, with every step timed from the lab system's records. Switch between the old process (As-Is), the redesign (To-Be) or both, then filter by where the order came from. Every number and chart updates to match.</p>
```

Headings, captions and takeaways. In each card insert the `.how-to-read` paragraph directly after the closing `</div>` of `.chart-head`, and the takeaway paragraph after `.chart-table` where an id is given:

| Card (canvas / id) | New `h2` | How to read this | Takeaway `p` |
|---|---|---|---|
| `c-stages` | `Waiting time at each step` | `Each bar is one step of the journey. Longer bars mean samples waited there longer. Green is the only time a sample is being tested.` | `<p class="chart-takeaway" id="stages-takeaway" aria-live="polite"></p>` |
| `c-hist` | `How long orders take` | `Each bar shows the share of orders that got a result after that many hours. Bars bunched on the left mean fast, predictable results.` | `<p class="chart-takeaway" id="hist-takeaway" aria-live="polite"></p>` |
| `c-arrivals` | `Sample arrivals vs intake capacity` | `Bars show how many samples reach the lab each hour. The line shows how many the intake desk can log. Bars above the line build a queue.` | `<p class="chart-takeaway" id="arrivals-takeaway" aria-live="polite"></p>` |
| `c-priority` | keep (with the Task 2 `dfn`s) | `Average minutes each type of order waits for testing. Real emergencies should wait the least.` | `<p class="chart-takeaway" id="priority-takeaway" aria-live="polite"></p>` |
| `c-pareto` | `Wasted minutes, biggest first` | `Steps ranked by minutes lost to waiting. Fixing the top few removes most of the delay.` | (none) |
| `c-defects` | `Errors and repeat work` | `Share of orders that needed retyping, a new sample or manual fixing. Lower is better.` | (none) |
| `#variants` card | `Routes orders take` | `Each row is a route an order took through the lab. Detours from the normal path add hours.` | (none) |

Markup for a caption:

```html
        <p class="how-to-read"><strong>How to read this:</strong> Each bar is one step of the journey. Longer bars mean samples waited there longer. Green is the only time a sample is being tested.</p>
```

- [ ] **Step 5: Plain KPI labels in `js/dashboard.js`** — replace `KPIS`:

```js
  const KPIS = [
    { key: 'meanTat', label: 'Average time to result', fmt: C.fmt.hours, good: 'down', note: 'Target under 5.0 h' },
    { key: 'p90Tat', label: 'Time for 9 in 10 orders', fmt: C.fmt.hours, good: 'down', note: 'The slowest 10% take longer' },
    { key: 'pce', label: 'Share of time doing real work', fmt: (x) => C.fmt.pct(x, 1), good: 'up', note: 'Hospitals aim for more than 15%' },
    { key: 'statRatio', label: 'Orders marked urgent', fmt: (x) => C.fmt.pct(x, 1), good: 'down', note: 'Target 8%' },
    { key: 'rekeyRate', label: 'Retyping errors', fmt: (x) => C.fmt.pct(x, 1), good: 'down', note: 'Mistakes at sample intake' },
    { key: 'rejectionRate', label: 'Samples rejected', fmt: (x) => C.fmt.pct(x, 1), good: 'down', note: 'Blood has to be drawn again' },
    { key: 'meanCriticalLag', label: 'Delay on dangerous results', fmt: fmtMin, good: 'down', note: 'From lab flag to doctor alert' },
  ];
```

- [ ] **Step 6: Takeaways and callouts in `js/dashboard.js`**

`stageChart(sums)`: before `C.render`, add

```js
    const primary = state.view === 'to_be' ? 'to_be' : 'as_is';
    const waits = sums[primary].stageWaits;
    const top = S.STAGE_KEYS.reduce((a, k) => ((waits[k] ?? -1) > (waits[a] ?? -1) ? k : a), S.STAGE_KEYS[0]);
    $('#stages-takeaway').textContent = `Biggest queue: ${STAGE_LABEL[top]}, ${fmtMin(waits[top])} on average${state.view === 'compare' ? ' before the redesign' : ''}.`;
```

and change its options to

```js
      options: {
        indexAxis: 'y',
        scales: C.axes({ horizontal: true, stacked: state.view !== 'compare', valueTitle: 'Minutes', grace: '18%' }),
        plugins: {
          tooltip: { filter: (item) => item.raw !== 0 },
          callout: { datasetIndex: 0, index: S.STAGE_KEYS.indexOf(top), text: 'Biggest queue' },
        },
      },
```

`histogramChart(sets)`: after `C.render(...)`, add

```js
    const within6h = (sc) => {
      const n = sets[sc].length;
      return n ? sets[sc].filter((o) => o.tat <= 360).length / n : null;
    };
    const shown = shownScenarios();
    $('#hist-takeaway').textContent = shown.length > 1
      ? `Results within 6 hours: ${C.fmt.pct(within6h('as_is'), 0)} of orders before the redesign, ${C.fmt.pct(within6h('to_be'), 0)} after.`
      : `${C.fmt.pct(within6h(shown[0]), 0)} of orders get a result within 6 hours.`;
```

`arrivalsChart(sets)`: after `C.render(...)`, add

```js
    const capacity = hours.map(CAPACITY[capScenario]);
    const arrivals = S.arrivalsByHour(sets[capScenario]).map((c) => (c / SCENARIO_N[capScenario]) * DAILY_VOLUME);
    const over = hours.filter((h) => arrivals[h] > capacity[h]);
    const peak = hours.reduce((a, h) => (arrivals[h] > arrivals[a] ? h : a), 0);
    $('#arrivals-takeaway').textContent = over.length
      ? `Arrivals outrun intake capacity in ${over.length} of 24 hours, peaking at ${Math.round(arrivals[peak]).toLocaleString('en-US')} samples an hour around ${String(peak).padStart(2, '0')}:00.`
      : 'Arrivals stay below intake capacity in every hour of the day.';
```

`priorityChart(sets)`: before `C.render`, add

```js
    const primary = state.view === 'to_be' ? 'to_be' : 'as_is';
    const pb = S.priorityBreakdown(sets[primary]);
    const waitsBy = S.PRIORITIES.map((p) => pb[p].meanTestingWait);
    const trueWait = pb.stat_true.meanTestingWait;
    const flagged = pb.stat_flagged.meanTestingWait;
    const inverted = trueWait != null && waitsBy.every((w) => w == null || w <= trueWait);
    if (trueWait == null || flagged == null) $('#priority-takeaway').textContent = '';
    else if (inverted) $('#priority-takeaway').textContent = `Priority is upside down: real emergencies wait ${fmtMin(trueWait)} for testing, longer than routine orders tagged urgent (${fmtMin(flagged)}).`;
    else $('#priority-takeaway').textContent = `Real emergencies wait ${fmtMin(trueWait)} for testing; routine orders tagged urgent wait ${fmtMin(flagged)}.`;
```

and its options to

```js
      options: {
        scales: C.axes({ valueTitle: 'Testing-queue wait (min)', grace: '15%' }),
        plugins: {
          legend: { display: datasets.length > 1 },
          callout: inverted ? { datasetIndex: 0, index: S.PRIORITIES.indexOf('stat_true'), text: 'Longest wait' } : false,
        },
      },
```

In `render()`, in the empty branch before `return`:

```js
      document.querySelectorAll('.chart-takeaway').forEach((p) => { p.textContent = ''; });
```

- [ ] **Step 7: Styles**

```css
.how-to-read { margin: -4px 0 12px; max-width: 70ch; font-size: 13px; color: var(--ink-2); }
.how-to-read strong { color: var(--ink); font-weight: 600; }
.chart-takeaway { margin: 12px 0 0; padding: 10px 14px; border-radius: var(--radius-sm); background: var(--brand-soft); font-size: 14px; color: var(--ink); }
.chart-takeaway:empty { display: none; }
```

- [ ] **Step 8: Run tests**

Run: `python -m pytest -q`
Expected: all pass, including `test_dashboard_interactions` (empty state count is still 6).

- [ ] **Step 9: Commit**

```bash
git add dashboard.html js/charts.js js/dashboard.js css/styles.css tests/test_readability.py
git commit -m "feat(dashboard): how-to-read captions, live takeaways and on-chart callouts"
```

---

### Task 7: Methods page a non-coder can follow

**Files:**
- Modify: `methods.html`, `css/styles.css`
- Test: `tests/test_readability.py`

**Interfaces:**
- Produces: `ol.pipeline-strip` with four `li.step`; `.in-short` after each methods `h2`.

- [ ] **Step 1: Failing tests**

```python
METHODS_SECTIONS = ["data", "mining", "sql", "diagrams", "downloads"]


def test_methods_explains_the_pipeline_in_four_steps():
    strip = re.search(r'<ol class="pipeline-strip".*?</ol>', read("methods.html"), re.S)
    assert strip, "no pipeline strip"
    assert len(re.findall(r'<li class="step">', strip.group(0))) == 4
    for path in re.findall(r"<code>([^<]+)</code>", strip.group(0)):
        assert (ROOT / path).exists(), path


@pytest.mark.parametrize("section", METHODS_SECTIONS)
def test_methods_sections_open_with_in_short(section):
    lines = in_short_text(read("methods.html"), section)
    assert len(lines) == 1 and 5 <= len(lines[0].split()) <= 25
```

- [ ] **Step 2: Run to verify failure**

Run: `python -m pytest -q tests/test_readability.py -k methods`
Expected: FAIL.

- [ ] **Step 3: Page head and pipeline strip** — replace the `.page-head .lede` and add the strip after `</nav>` inside `.page-head`:

```html
      <p class="lede">All the data here is synthetic. One Python script generates the orders, a second measures them, and a set of SQL queries checks the measurements. The case study, dashboard and deck all read the same results.</p>
```

```html
      <ol class="pipeline-strip" aria-label="How the numbers flow">
        <li class="step"><p class="step-num">01</p><h3>Generate 20,000 orders</h3><p>A seeded script makes realistic lab orders with eight timestamps each.</p><code>data/generate_event_log.py</code></li>
        <li class="step"><p class="step-num">02</p><h3>Measure each step in Python</h3><p>pandas works out how long every order waited at each step.</p><code>analysis/process_mining_analysis.py</code></li>
        <li class="step"><p class="step-num">03</p><h3>Check every figure in SQL</h3><p>Separate SQL queries recompute the numbers, and a test fails if the two disagree.</p><code>sql/diagnostic_pipeline_analytics.sql</code></li>
        <li class="step"><p class="step-num">04</p><h3>Build the site and deck</h3><p>The case study, dashboard and slides all read one results file.</p><code>data/metrics.json</code></li>
      </ol>
```

- [ ] **Step 4: In short lines and headings** (insert directly after each `h2`)

| Section | `h2` | `.in-short` |
|---|---|---|
| `#data` | keep | `The orders are synthetic, but tuned to match the real project's numbers, and tests check every target.` |
| `#mining` | `How long each step took, measured from timestamps` | `A Python script works out how long each order spent at every step and ranks the steps by wasted time.` |
| `#sql` | keep | `The same numbers are worked out a second time in SQL, and a test checks that both answers match.` |
| `#diagrams` | keep | `The process maps are written as code, so a test can check the site shows exactly the same steps.` |
| `#downloads` | keep | `Everything used to build the site is here: the deck, the data and the scripts.` |

- [ ] **Step 5: Styles**

```css
.pipeline-strip {
  list-style: none; margin: 24px 0 0; padding: 0;
  display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; counter-reset: none;
}
.pipeline-strip .step {
  display: flex; flex-direction: column; gap: 6px; padding: 16px;
  background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius);
}
.pipeline-strip .step-num { margin: 0; font-family: var(--font-mono); font-size: 12px; color: var(--muted); }
.pipeline-strip h3 { margin: 0; font-size: 15px; }
.pipeline-strip p { margin: 0; font-size: 14px; color: var(--ink-2); flex: 1; }
.pipeline-strip code {
  align-self: flex-start; margin-top: 6px; padding: 2px 8px; border-radius: 4px;
  background: var(--surface-2); font-size: 12px; overflow-wrap: anywhere;
}
```

Responsive: in `@media (max-width: 960px)` add `.pipeline-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); }`; in `@media (max-width: 480px)` add `.pipeline-strip { grid-template-columns: minmax(0, 1fr); }`.

- [ ] **Step 6: Run tests**

Run: `python -m pytest -q`
Expected: all pass, including `test_excerpts_match_sources` (code excerpts untouched).

- [ ] **Step 7: Commit**

```bash
git add methods.html css/styles.css tests/test_readability.py
git commit -m "feat(methods): four-step pipeline strip and In short lines"
```

---

### Task 8: Deck with takeaway titles, plain subtitles and talking points

**Files:**
- Modify: `deck/build_deck.js`, `tests/deck.test.js`
- Regenerate: `deck/sovereign-health-exec-briefing.pptx`

**Interfaces:**
- Produces: `contentSlide(kicker, title, subtitle, say, detail)`; helper `notes(say, detail) -> string` producing `Talking point: <say>\n\nDetail: <detail>`; every slide has a text box with `objectName: 'subtitle'`.

- [ ] **Step 1: Failing tests in `tests/deck.test.js`**

```js
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: the two new tests FAIL (no subtitles, no talking points); existing tests pass.

- [ ] **Step 3: Master title and helpers in `deck/build_deck.js`**

In the `CONTENT` master, change the title placeholder to one line at 28 pt: `h: 0.6`, `fontSize: 28`.

Replace `contentSlide` with:

```js
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
```

- [ ] **Step 4: Update every slide.** Keep each slide's body; change only the calls listed. `waitH` below is `hours(A.mean_tat - A.mean_va)` (17.9 h).

Slide 1 (DARK):
- title: `` `Cutting lab result time from ${hoursNb(A.mean_tat)} to ${hoursNb(B.mean_tat)}` ``
- add `objectName: 'subtitle'` to the existing subtitle text box and change its text to `'The fix uses the same analyzers and staff. It changes how samples and information move between teams.'`
- notes: `` notes(`Lab results now take ${hours(A.mean_tat)} on average, up from 4.2 h. This briefing shows where the time goes and asks for ${money(F.CAPEX)} to bring it down to ${hours(B.mean_tat)}.`, 'Structure: what is happening, why it matters, what we do about it.') ``

Slides 2 to 9 (`contentSlide(kicker, title, subtitle, say, detail)`):

| # | title | subtitle | say | detail |
|---|---|---|---|---|
| 2 | `` `Testing takes 42 minutes of an ${hoursNb(A.mean_tat)} wait` `` | `'The new analyzers work. Samples spend the rest of the day waiting around them.'` | `` `The analyzers work on each sample for ${mins(A.mean_va)}. The other ${hours(A.mean_tat - A.mean_va)} is spent waiting before and after.` `` | `'The analyzer upgrade did its job. Everything around it did not scale: 96% of the cycle is queueing, transit, re-keying and exception handling.'` |
| 3 | `` `Sample intake holds ${pct(top.share_of_nva, 0)} of all waiting time` `` | `'Logging samples in when they arrive is the biggest single queue.'` | `` `The biggest single wait is at sample intake, where tubes are logged in by hand. ${pct(A.outpatient_peak_arrival_share, 0)} of clinic samples arrive between 4 and 6 PM, just as evening staffing drops.` `` | `'Minutes come from timestamps mined across 10,000 orders. Testing shows queue time only; the 42-minute analyzer run is excluded.'` |
| 4 | `'Four problems cause most of the delay'` | `'Each problem has a matching fix on slide 8.'` | `` `Four problems cause most of the delay, and each has a fix later in the deck. One is that ${pct(A.stat_ratio, 0)} of orders are marked urgent, so real emergencies get stuck behind routine work.` `` | `'Ranked by non-value-added minutes from the event log.'` |
| 5 | `` `Only ${pct(A.pce, 0)} of the ${hoursNb(A.mean_tat)} is real work` `` | `'The rest is samples waiting in queues between teams.'` | `'For every hour a sample spends in the system, less than three minutes is real work. The rest is waiting, transport and fixing mistakes.'` | `'Process cycle efficiency = value-added time / total cycle time. The healthcare benchmark is above 15%.'` |
| 6 | `'The delay costs $6.0M a year before patient risk'` | `'Hospital penalties and overtime come straight out of the budget.'` | `` `The delay costs about $6M a year in penalties and overtime. Doctors also wait ${mins(A.mean_critical_lag)} to hear about dangerous results.` `` | `'Penalties and overtime are annual figures from finance. Patient risk shows up as ED length of stay and a 48-minute critical-value lag.'` |
| 7 | `'The new process has 12 steps and no retyping'` | `'Scans and automatic messages replace the steps where people retyped data.'` | `` `The new process removes six steps and every point where people retype data. Logging samples in drops from ${hours(A.stage_means.accessioning)} to ${mins(B.stage_means.accessioning)}.` `` | `'Steps fall from 18 to 12. Every remaining handoff is a scan or an API call.'` |
| 8 | `'Four changes, each aimed at one queue'` | `'None of the fixes depend on staff working faster.'` | `'Each change targets one of the four problems from slide 4. The table shows the before and after for each one.'` | `'Before/after values for accessioning, clinic hold and exceptions are mined means from the simulated To-Be scenario.'` |
| 9 | keep | `'The money comes back within two months, and every quality measure improves.'` | `` `Results come back ${CMP.tat_reduction_pct.toFixed(1)}% faster and the program saves ${money(F.totalSavings())} a year. It pays for itself in ${F.paybackMonths().toFixed(1)} months.` `` | `'ROI = (annual savings - capex) / capex. Savings categories: ED penalties $2.4M, overtime $850K, length of stay $680K, rework $420K.'` |

Slide 5 layout (from the Stitch slide): a big waiting share on the left, the existing stacked chart on the right. Full slide 5 block:

```js
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
```

Slide 10 (DARK):
- add after the title:

```js
  s.addText('Starting needs two things: the capital and a named executive sponsor.', {
    x: 0.8, y: 2.35, w: 11.7, h: 0.5, fontFace: BODY, fontSize: 18, color: ICE, margin: 0, isTextBox: true, objectName: 'subtitle',
  });
```

- notes: `` notes(`We need two things today: approval for ${money(F.CAPEX)} and an executive sponsor. The first results arrive with the central hub and ED rollout in weeks 11 to 13.`, 'Ask: approve capital and name an executive sponsor for the central hub and ED deployment in weeks 11 to 13.') ``
- The DARK master title sits at y 1.7 to 3.3 with 40 pt type; if the subtitle collides, move the subtitle to `y: 3.1` and the roadmap rows start (`3.0 + i * 0.48`) to `3.7 + i * 0.42`.

- [ ] **Step 5: Run tests and rebuild**

Run: `npm test` then `npm run deck`
Expected: all node tests pass; `wrote deck/sovereign-health-exec-briefing.pptx`.

- [ ] **Step 6: Visual check of the deck**

If LibreOffice is installed (`soffice --version`), render slides to PNG: `soffice --headless --convert-to pdf --outdir <scratchpad> deck/sovereign-health-exec-briefing.pptx`, then view pages. Check that no title wraps to two lines and the slide 10 subtitle does not overlap the title. If LibreOffice is not available, say so in the final report instead of claiming a visual check.

- [ ] **Step 7: Commit**

```bash
git add deck/build_deck.js deck/sovereign-health-exec-briefing.pptx tests/deck.test.js
git commit -m "feat(deck): takeaway titles, plain subtitles and talking-point notes"
```

---

### Task 9: Copy pass, metadata and final verification

**Files:**
- Modify: `README.md`, `PROJECT_META.md`, any prose left on the three pages
- Test: full suites

- [ ] **Step 1: Humanizer pass (file mode)** over remaining prose in `index.html`, `dashboard.html`, `methods.html` and `README.md`. Change prose only: leave code blocks, `data-*` bound text, Mermaid, table data and link targets alone. Known items: problem impact cards ("triggering penalties, bed blockage and walk-outs" is fine; check rhythm), bottleneck `dd` text, dashboard chart subtitles, methods generation bullets, README "What's in the site" table and Pipeline section. No new facts, numbers or claims.

- [ ] **Step 2: Update `PROJECT_META.md`** with the project-meta-sync skill: add the glossary, progress rail, before/after bars, dashboard takeaways, deck notes, and `.stitch/` design record under Key Details. Stage stays `PROD`.

- [ ] **Step 3: Full verification**

Run: `python -m pytest -q` and `npm test`
Expected: all pass.

Run with screenshots: `SCREENSHOT_DIR=<scratchpad>/after python -m pytest -q tests/test_pages_smoke.py`
Then view `index-1280.png`, `index-375.png`, `dashboard-1280.png`, `dashboard-375.png`, `methods-1280.png`, `methods-375.png`. Check against the spec: In short lines visible, rail sticky, tooltips not clipped, pair bars visible, no overlap at 375 px.

- [ ] **Step 4: Commit**

```bash
git add README.md PROJECT_META.md index.html dashboard.html methods.html
git commit -m "docs: plain-language copy pass and project metadata"
```
