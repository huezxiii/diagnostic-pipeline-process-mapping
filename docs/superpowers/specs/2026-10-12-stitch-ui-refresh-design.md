# Stitch UI Refresh and Plain-Language Pass: Design

Date: 2026-10-12
Status: approved in brainstorming, awaiting spec review

## Goal

Make the case study site and the executive deck easy for a non-technical hiring manager to follow, and lift the visual quality using Google Stitch as the design tool. The current identity stays: navy chrome, IBM Plex type, and the validated data colors.

Success means a reader with no lab or Lean background can answer three questions within one minute on the case study page and within three slides of the deck:

1. What was wrong? (Results took 18.6 hours. Almost all of it was waiting.)
2. What was changed? (Four process changes, no new analyzers.)
3. What did it get? (4.6 hours, $4.35M a year, paid back in 1.4 months.)

## Scope

In scope:

- `index.html` (case study), `dashboard.html`, `methods.html`
- `css/styles.css`, `js/case-study.js`, `js/charts.js`, `js/dashboard.js` where the visual changes need it
- `deck/build_deck.js` and the rebuilt `deck/sovereign-health-exec-briefing.pptx`
- `README.md` prose
- New and updated tests

Out of scope:

- New data, new metrics, changes to the generator, mining or SQL
- New pages or a build step. The site stays static, vanilla HTML/CSS/JS
- Changes to data series colors: As-Is `#eb6834`, To-Be `#2a78d6`, value-added `#1baf7a`, neutral `#8a8f98`
- Changing the deck slide count. It stays at 10 because `tests/deck.test.js` asserts it

## Audience

Non-technical hiring managers. They skim, they do not know Lean or lab terms, and they judge the work by whether the story is clear. Detail stays available but moves behind the plain summary.

## Approach

Stitch is the design studio. The repo stays the source of truth.

1. Extract a `DESIGN.md` from `css/styles.css` and the page markup (Stitch `extract-design-md` skill). Save it to `.stitch/DESIGN.md`.
2. Create a Stitch project, upload the DESIGN.md as its design system (`manage-design-system`).
3. Generate refined screens with layout and content prompts only, no colors or fonts in the prompts (`generate-design` rules): case study hero and section pattern, dashboard KPI row and chart card, methods block, and one 16:9 slide layout.
4. Pick the strongest patterns and port them by hand into the existing HTML/CSS and `build_deck.js`. Stitch markup is never pasted in wholesale, because it hard-codes numbers and would break the `data-metric` bindings.
5. Run the humanizer skill over all prose.

Stitch MCP is reached over HTTP in this session because MCP tools load only at session start. Next session, the `stitch` MCP server is available directly.

Rejected: dropping Stitch HTML in as the pages (breaks bindings, tests and deck parity); writing DESIGN.md only with no generated screens (does not use Stitch for what it is good at).

## Design

### 1. Plain-language layer

**Hero.** Lead with the outcome in one plain sentence, then the number pair. Working copy: "Lab results took 18.6 hours. The fix got them to 4.6 hours without buying new machines." Numbers stay bound to `metrics.json` through `data-metric`.

**"In short" line.** Every numbered case study section (`#problem`, `#scope`, `#as-is`, `#bottlenecks`, `#value-stream`, `#to-be`, `#levers`, `#roadmap`, `#impact`, `#roi`, `#conclusion`) opens with one sentence in a `<p class="in-short">` element, placed after the `h2` and before the existing lede. One sentence, no jargon, under 25 words.

**Jargon defined on first use.** These terms get a `<dfn>` wrapper with a `data-def` attribute on first use on each page, shown as a tooltip on hover and focus and as a tap target on touch:

| Term | Definition (working copy) |
|---|---|
| Time-to-result (TAT) | Hours from the doctor placing the order to the result reaching the patient's chart. |
| Process cycle efficiency (PCE) | Share of total time spent doing work that actually changes the sample or result. |
| STAT | An order flagged urgent, to be done ahead of everything else. |
| Priority inversion | When so many orders are flagged urgent that urgent stops meaning anything. |
| SIPOC | A one-page outline of Suppliers, Inputs, Process, Outputs and Customers, used to agree where the process starts and stops. |
| Accessioning | Logging a sample into the lab system when it arrives so it can be tested. |
| Value stream | Every step from order to result, split into time that adds value and time spent waiting. |
| Swimlane map | A process diagram with one row per team, so handoffs between teams are easy to see. |
| Re-key error | A mistake made when someone types information that already exists in another system. |

The case study page also gets a short glossary section at the bottom (`#glossary`) listing the same terms. Dashboard and methods pages use the `<dfn>` tooltips only.

The tooltip is CSS plus a small script in a new `js/glossary.js` shared by all three pages. It must work with keyboard focus and must not cause horizontal scroll at 375 px.

**Progress rail.** The case study gets a sticky rail with four stages: Problem, Cause, Fix, Result. It maps sections to stages (Problem: `#problem`, `#scope`; Cause: `#as-is`, `#bottlenecks`, `#value-stream`; Fix: `#to-be`, `#levers`, `#roadmap`; Result: `#impact`, `#roi`, `#conclusion`). The current stage highlights on scroll through `IntersectionObserver`. On phones the rail becomes a slim top bar.

### 2. Visual upgrades

Exact layouts come from the Stitch screens. The required changes:

- **KPI tiles** (case study hero and dashboard): show before and after as two small paired bars in As-Is and To-Be colors, with the numbers as direct labels. The text arrow form ("3.8% → 15.2%") goes.
- **Value stream** (`#vsm`): one wide stacked bar, waiting versus working, with a direct label on the waiting share ("96% waiting"). Stage detail sits under it.
- **Bottlenecks and levers**: each lever card names and links to the bottleneck it removes, so the cause and fix read as pairs.
- **Dashboard charts**: each chart card gets a one-line "How to read this" caption, and the key point is annotated on the chart itself (largest queue on stage latency, the STAT spike on priority inversion). Annotation is a Chart.js plugin in `js/charts.js`, no new library.
- **Chrome refinements**: spacing, card hierarchy and section rhythm from the Stitch screens. Navy, IBM Plex and the light theme stay.

Accessibility rules carry over: status color always paired with icon and label, focus rings stay, contrast at least 4.5:1 for text.

### 3. Deck

- Still 10 slides, still built from `metrics.json` and `js/financials.js`.
- Every title is the takeaway as a full sentence. Most already are; slide 1 and the "Four bottlenecks" and "Five lanes" slides get rewritten.
- One headline number per slide, shown large.
- A plain subtitle under each title saying what the slide means for the business.
- Every slide has speaker notes in plain words. Today only slides 1 and 10 have notes.
- Visual style matches the refreshed site: same spacing and tile treatment, same data colors.

### 4. Copy

The humanizer skill runs over all prose on the three pages, the deck text and notes, and the README. Numbers, labels bound to data, and code excerpts on the methods page are not rewritten.

## Testing

Tests are written before implementation.

New tests:

- `tests/test_pages_smoke.py` (or a new `tests/test_readability.py` using the same Playwright fixtures):
  - each listed case study section contains exactly one `.in-short` paragraph, under 25 words
  - each glossary term appears in `#glossary` with a non-empty definition
  - each `<dfn>` has a non-empty `data-def`, and its tooltip becomes visible on keyboard focus
  - the progress rail exists and marks one stage active after scrolling to `#levers`
  - each dashboard chart card has a "How to read this" caption
- `tests/deck.test.js`:
  - every slide has non-empty speaker notes
  - every content slide title ends without a trailing colon and is at least five words

Existing tests must still pass: `python -m pytest -q` and `npm test`, including the Playwright smoke test at 1280 and 375 px (no console errors, no horizontal scroll) and deck figure parity with `metrics.json`.

Visual review: before and after full-page screenshots of all three pages at 1280 and 375 px, saved through `SCREENSHOT_DIR`, plus slide images of the rebuilt deck.

## Risks

- **Stitch output style drift.** Stitch leans toward generic SaaS layouts. Mitigation: DESIGN.md carries the current identity, prompts stay on layout and content, and only patterns that fit get ported.
- **Tooltip on touch devices.** Hover does not exist on phones. Mitigation: tap toggles, tap elsewhere closes, and the glossary section covers the case study regardless.
- **Copy changes breaking tests.** `tests/test_methods_excerpts.py` and the deck tests read text. Mitigation: humanizer does not touch bound numbers or code excerpts, and tests run after each page.
