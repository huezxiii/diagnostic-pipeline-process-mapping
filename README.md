# Diagnostic Pipeline Process Mapping

A portfolio case study on lab turnaround time. It shows how process mapping and event-log mining cut mean time-to-result from 18.6 hours to 4.6 hours without new analyzer hardware.

- **Live site:** [https://diagnostic-pipeline-process-mapping.netlify.app](https://diagnostic-pipeline-process-mapping.netlify.app)
- **GitHub:** [https://github.com/huezxiii/diagnostic-pipeline-process-mapping](https://github.com/huezxiii/diagnostic-pipeline-process-mapping)

Sovereign Health System is a fictional organization. All data is synthetic and generated for portfolio demonstration.

## What's in the site

| Page | What it shows |
|---|---|
| `index.html` | Case study: problem, SIPOC, As-Is and To-Be swimlanes, bottlenecks, value stream, levers, roadmap, impact and ROI |
| `dashboard.html` | Interactive dashboard over 20,000 synthetic orders, with a scenario toggle (As-Is, To-Be or Compare), filters for source, priority and facility, seven KPI tiles, six charts that each have a table view, and path variants |
| `methods.html` | How the numbers were made: calibration results, Python mining excerpts, every SQL query beside its result, downloads |

Every dashboard figure is computed in the browser from the filtered orders. Case-study figures are bound to `data/metrics.json`, so the page, dashboard and deck always agree.

## Pipeline

```
data/generate_event_log.py           seeded generator -> data/event_log.csv (8 timestamps per order)
analysis/process_mining_analysis.py  pandas mining    -> data/metrics.json, js/data.js
analysis/run_sql.py                  SQL suite in DuckDB -> data/sql_results.json, js/sql-results.js
deck/build_deck.js                   PptxGenJS        -> deck/sovereign-health-exec-briefing.pptx
```

- The event log uses seed 42 and 10,000 orders per scenario. Stage times are gamma-distributed with source, priority and arrival-hour effects, then calibrated to the plan's baseline (18.6 h TAT, 3.76% PCE, 38% STAT, 8.4% re-key errors and so on). Stage durations are not stored; the mining script derives them from the timestamps.
- The SQL is written in PostgreSQL dialect (CTEs, `EXTRACT(EPOCH …)`, `PERCENTILE_CONT`, `RANK() OVER`, rolling `AVG() OVER`) and validated by running it in DuckDB. Results must match the Python metrics.
- One assumption: the plan gives totals only, so the 1,116-minute As-Is cycle is allocated across stages (see `docs/superpowers/specs/`).

## Run locally

Open `index.html` directly, or serve the folder:

```bash
python -m http.server 8080
```

Regenerate data and the deck:

```bash
pip install -r requirements.txt
python data/generate_event_log.py
python analysis/process_mining_analysis.py
python analysis/run_sql.py
npm install
npm run deck
```

## Tests

```bash
python -m pytest -q
npm test
```

- `tests/test_generator.py`: determinism and every calibration target
- `tests/test_mining.py`, `tests/test_sql.py`: metrics structure, and SQL results equal Python results
- `tests/stats.test.js`: the browser aggregation engine, cross-checked against `metrics.json`
- `tests/deck.test.js`: 10 slides and key figures
- `tests/test_diagrams.py`, `tests/test_methods_excerpts.py`: embedded diagrams and code excerpts match their sources
- `tests/test_pages_smoke.py`: headless Chromium (Playwright) loads every page at 1280 px and 375 px, with no console errors and no horizontal scroll, and runs dashboard interactions. Needs network access for the CDN scripts.

## Deploy (Netlify)

No build step. `netlify.toml` publishes the repo root and sets security headers. Link the repo in Netlify, or run:

```bash
netlify deploy --prod --dir .
```

## Stack

HTML, CSS and vanilla JavaScript, Chart.js 4.4.4, Mermaid 11.4.1 and Prism 1.29 (pinned with SRI), Python (numpy, pandas, DuckDB, pytest, Playwright) and PptxGenJS.
