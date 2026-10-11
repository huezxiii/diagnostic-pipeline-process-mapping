# PLAN — Diagnostic Pipeline Process Mapping Site

Spec: `docs/superpowers/specs/2026-10-12-diagnostic-pipeline-site-design.md`
Mode: superpowers-autonomous (TDD, atomic commits, recommended options auto-selected)

Commands: `python -m pytest -q` · `node --test tests/*.test.js` · `python data/generate_event_log.py` · `python analysis/process_mining_analysis.py` · `python analysis/run_sql.py` · `node deck/build_deck.js`

## Task 1 — Scaffold
- [x] `netlify.toml` (publish ".", security headers, cache for /js /css), `.gitignore`, `requirements.txt` (numpy, pandas, pytest, duckdb), `package.json` (test script, pptxgenjs dev dep), `.claude/launch.json` (python -m http.server 8080).
- Verify: files present; `pip install duckdb` succeeds.
- Commit: `chore: scaffold project`

## Task 2 — Event log generator (TDD)
- [x] RED: `tests/test_generator.py` — determinism (same seed ⇒ same frame), schema columns, every spec §4 calibration target within tolerance, `rejected ⊂ exception`, timestamps monotonic per row, population shared across scenarios.
- [x] GREEN: `data/generate_event_log.py` with `generate(seed, n) -> DataFrame`, `stage_durations(df) -> DataFrame`, CLI writing `data/event_log.csv`.
- Verify: `python -m pytest tests/test_generator.py -q` passes.
- Commit: `feat(data): seeded LIS event log generator calibrated to plan baseline`

## Task 3 — Process mining (TDD)
- [x] RED: `tests/test_mining.py` — metrics keys, stage means sum to mean TAT (±0.5), PCE = VA/TAT, variants sum to n, bottleneck rank 1 = accessioning (As-Is), `js/data.js` parses and holds 20,000 orders.
- [x] GREEN: `analysis/process_mining_analysis.py` → `data/metrics.json`, `js/data.js` (columnar).
- Commit: `feat(analysis): process mining metrics and dashboard data bundle`

## Task 4 — SQL suite (TDD)
- [x] RED: `tests/test_sql.py` — schema.sql executes in DuckDB; each named query runs; stage latency and TAT summary match metrics.json (±0.5 min); arrivals share sums to 1.
- [x] GREEN: `sql/schema.sql`, `sql/diagnostic_pipeline_analytics.sql` (`-- name:` blocks; CTEs, EXTRACT(EPOCH), PERCENTILE_CONT, AVG() OVER, RANK() OVER), `analysis/run_sql.py` → `data/sql_results.json`, `js/sql-results.js`.
- Commit: `feat(sql): PostgreSQL analytics suite validated with DuckDB`

## Task 5 — stats.js (TDD)
- [x] RED: `tests/stats.test.js` — decode, filter, mean/percentile, summarize (incl. empty ⇒ nulls), compare deltas, histogram, arrivalsByHour, priorityBreakdown, wastePareto; cross-check summarize(as_is) vs metrics.json.
- [x] GREEN: `js/stats.js` (UMD).
- Commit: `feat(stats): client-side aggregation engine`

## Task 6 — Shared shell + Dashboard page
- [x] `css/styles.css` tokens/components; `js/charts.js`; `js/dashboard.js`; `dashboard.html`.
- Verify in browser: zero console errors, scenario toggle + filters update tiles/charts, empty filter state, 375 px.
- Commit: `feat(dashboard): interactive pipeline dashboard`

## Task 7 — Case study page
- [x] `diagrams/as_is.mmd`, `diagrams/to_be.mmd`; `js/case-study.js`; `index.html` (12 sections, Mermaid with fallback).
- Verify in browser: swimlanes render, charts render, zero errors, 375 px.
- Commit: `feat(site): case study narrative page`

## Task 8 — Methods page
- [x] `methods.html`, `js/methods.js` (renders SQL blocks + result tables from `SQL_RESULTS`, mining table from metrics).
- Verify in browser. Commit: `feat(site): methods and deliverables page`

## Task 9 — Executive deck (TDD)
- [x] RED: `tests/deck.test.js` — pptx has 10 slides; contains TAT/PCE/ROI figures from metrics.json.
- [x] GREEN: `deck/build_deck.js` → `deck/sovereign-health-exec-briefing.pptx`.
- Commit: `feat(deck): 10-slide executive briefing`

## Task 10 — Docs + final verification
- [x] `README.md`, `PROJECT_META.md`, 404.html.
- [x] Full suite: pytest + node --test; browser pass on all pages (desktop + 375 px).
- Commit: `docs: README and project metadata`
