# Diagnostic Pipeline Process Mapping Site — Design Spec

**Date:** 2026-10-12
**Source plan:** `docs/process-mapping-project-plan.md` (Sovereign Health Diagnostic Pipeline case study)
**Status:** Approved in brainstorming; pending written-spec review

## 1. Goal

A static portfolio site, deployable to Netlify with no build step, that presents the Sovereign Health process-mapping case study as:

1. a long-scroll **case study** narrative,
2. an **interactive dashboard** computed live from a synthetic LIS event log, and
3. a **methods** page exposing the Python process-mining script, the PostgreSQL query suite, and the executive deck.

Success = all three pages render with zero console errors, every dashboard number is computed from data (none hard-coded), all calibration targets in §4 are met within tolerance by automated tests, and the repo matches the sibling portfolio conventions (`customer-success-health-kpi`, `speech-analytics-dashboard-portfolio`).

## 2. Non-goals

- No backend, auth, or live database. No CSV upload or data export UI.
- No dark mode. No build tooling (Vite/React/bundlers).
- No GitHub repo creation or Netlify deploy in this scope. Repo stays local; user pushes/links Netlify.
- `pm4py` is not on the core path (pandas only); it may be mentioned as an optional extension.

## 3. Architecture

Location: `D:\Projects\diagnostic-pipeline-process-mapping` (git, branch `main`).

```
data/generate_event_log.py          seeded synthetic LIS event log -> data/event_log.csv
analysis/process_mining_analysis.py  pandas mining -> data/metrics.json + js/data.js
sql/schema.sql                       PostgreSQL table DDL for event_log
sql/diagnostic_pipeline_analytics.sql  PostgreSQL-dialect query suite (CTEs, AVG() OVER, interval math)
diagrams/as_is.mmd, diagrams/to_be.mmd  Mermaid flowcharts, one subgraph per swimlane
js/stats.js       pure filter/aggregate functions; no DOM; UMD-style so Node tests can require it
js/charts.js      Chart.js renderers (one function per chart)
js/dashboard.js   dashboard page controller (state, filters, render)
js/case-study.js  case-study page controller (Mermaid, VSM bar, ROI chart)
js/data.js        generated; window.PIPELINE_DATA = { orders, metrics }
index.html        case study
dashboard.html    interactive dashboard
methods.html      methods & deliverables
css/styles.css    shared tokens + components (Tailwind CDN for utilities)
deck/build_deck.js -> deck/sovereign-health-exec-briefing.pptx (PptxGenJS)
tests/            pytest (Python + SQL) and node:test (JS + deck)
netlify.toml      [build] publish = "."
README.md, PROJECT_META.md, requirements.txt, package.json, .gitignore
```

### Data flow

```
generate_event_log.py --seed 42 --> data/event_log.csv
process_mining_analysis.py      --> data/metrics.json  (deck, methods page)
                                --> js/data.js         (dashboard per-order rows + metrics)
analysis/run_sql.py: sql/*.sql in DuckDB over event_log.csv --> data/sql_results.json + js/sql-results.js (methods page)
```

`event_log.csv` and generated outputs are committed so Netlify serves them without running Python.

## 4. Data model and calibration

### Order record (one row per order per scenario) — LIS timestamp log

Stage durations are **not stored**; they are mined from event timestamps (true process-mining input).

| Field | Type | Notes |
|---|---|---|
| `order_id` | string | `AS-00001` / `TB-00001` (same number = same order population) |
| `scenario` | enum | `as_is`, `to_be` |
| `source` | enum | `ED` 12%, `inpatient` 28%, `outpatient` 60% |
| `facility` | string | `H01`–`H12` (ED/inpatient), `C01`–`C45` (outpatient) |
| `priority` | enum | `stat_true` (7%, both scenarios), `stat_flagged` (31% As-Is, 1% To-Be), `routine` |
| `ts_ordered` | timestamp | physician order in EHR |
| `ts_drawn` | timestamp | specimen collected |
| `ts_dispatched` | timestamp | courier pickup |
| `ts_received` | timestamp | arrival at central dock |
| `ts_exception_cleared` | timestamp | = `ts_received` unless `exception` = 1 |
| `ts_accessioned` | timestamp | accessioning complete |
| `ts_resulted` | timestamp | analyzer result |
| `ts_verified` | timestamp | verified + written to EHR |
| `va_min` | float | value-added portion of testing stage (≈42) |
| `exception`, `rekey_error`, `rejected`, `critical` | 0/1 | defect/event flags; `rejected` ⊂ `exception` |
| `critical_lag_min` | float | blank unless `critical` = 1 |

Derived stages: order→draw = drawn−ordered; clinic hold = dispatched−drawn; transport = received−dispatched; exception hold = exception_cleared−received; accessioning = accessioned−exception_cleared; testing = resulted−accessioned; verify/sync = verified−resulted; TAT = verified−ordered.

Generation is backward for arrival: the arrival time at the dock is sampled first (As-Is outpatient: exactly 60% in 16:00–17:59), then earlier timestamps are subtracted and later ones added. Stage samples are gamma-distributed with source/priority/arrival-hour multipliers, then each stage is rescaled to its target mean. Rates are assigned by exact counts. Order population (source, facility, `stat_true`, `critical`) is shared across scenarios so Compare is like-for-like.

10,000 orders per scenario (20,000 rows). Seeded (`--seed 42`), so output is deterministic.

### Stage allocation (assumption — plan gives only totals)

| Stage (mean minutes, all orders) | As-Is | To-Be |
|---|---|---|
| 1. Order → draw (`t_order_to_draw`) | 95 | 45 |
| 2. Clinic hold / Queue 1 (`t_clinic_hold`) | 168 | 35 |
| 3. Transport + dock / Queue 2 (`t_transport`) | 110 | 50 |
| 4. Accessioning / Queue 3 (`t_accessioning`) | 270 | 12 |
| 5. Sort + testing, incl. 42 VA / Queue 4 (`t_testing`) | 162 | 60 |
| 6. Verification + EHR sync (`t_verify_sync`) | 158 | 73.6 |
| Exception holding (mean across all orders) | 153 | 0.4 |
| **Total TAT** | **1,116** | **276** |

As-Is exception holding = 14.2% of orders × ~1,080 min (18 h). To-Be = ~1.8% × 22 min.

### Calibration targets (tested)

Tolerance: ±2% relative for means; ±0.5 percentage points for rates.

| Metric | As-Is | To-Be |
|---|---|---|
| Mean TAT | 1,116 min (18.6 h) | 276 min (4.6 h) |
| Mean value-added time | 42 min | 42 min |
| PCE (VA / TAT) | 3.76% | 15.2% |
| STAT ratio (`stat_true` + `stat_flagged`) | 38% | 8% |
| Re-key error rate | 8.4% | 0.1% |
| Rejection rate | 3.2% | 0.4% |
| Exception (manual intervention) rate | 14.2% | ≤ 2.0% |
| Mean critical-value lag | 48 min | 4 min |
| Mean clinic hold (all orders) | 168 min (2.8 h) | 35 min |
| Mean accessioning queue | 270 min (4.5 h) | 12 min |
| Mean exception resolution (exception orders only) | ~1,080 min (18 h) | 22 min |
| Outpatient arrivals 16:00–17:59 | 60% | < 25% |
| Mean `stat_true` testing wait, excl. VA (To-Be) | — | ≤ 30 min |
| Priority inversion (As-Is) | median `stat_true` testing wait ≥ median `stat_flagged` testing wait | — |

## 5. Pages

Shared: sticky top nav (Case Study / Dashboard / Methods), footer disclaimer: *"Sovereign Health System is a fictional organization. All data is synthetic and generated for portfolio demonstration."* Light theme; clinical palette (deep navy primary, teal accent, amber/red reserved for queues and waste, green for value-added). Responsive to 375 px. Hand-written CSS with design tokens (no Tailwind play-CDN, which logs a production warning). Pinned CDNs: Chart.js 4.4.x, Mermaid 11.x, Prism 1.29; Google Fonts IBM Plex Sans/Serif/Mono. Generated data ships as `window` globals (`js/data.js`, `js/sql-results.js`) so pages also work from `file://`.

### `index.html` — Case Study

1. Hero: "18.6 h → 4.6 h" headline; KPI tiles (TAT, PCE, STAT ratio, payback 1.4 mo).
2. Problem & impact: $4.8M ED penalties, 14.2% rework, $1.2M overtime; $6.5M hardware context.
3. SIPOC: five-column grid; process boundaries (start/end point).
4. As-Is swimlane: Mermaid, 5 lanes, **18 mapped steps**, queue nodes highlighted with wait times.
5. Bottleneck taxonomy: 4 cards (location, mechanism, impact).
6. Value stream bar: 42 min VA vs 1,074 min NVA; PCE 3.76% vs >15% benchmark.
7. To-Be swimlane: Mermaid, 5 lanes, 12 steps.
8. Four re-engineering levers: intervention + before → after.
9. 16-week roadmap: 7-phase Gantt strip.
10. Before/after table (6 metrics from plan §7).
11. ROI: savings breakdown bars ($4.35M), capex $520K, ROI 736.5%, payback 1.4 months.
12. Conclusion + CTAs to Dashboard and Methods.

Case-study figures come from `metrics.json` where a computed equivalent exists (TAT, PCE, rates); financial figures (savings, capex, ROI) are plan constants defined once in `js/case-study.js`.

### `dashboard.html` — Interactive Dashboard

- Controls: scenario toggle (As-Is / To-Be / Compare); filters: source, priority, facility (multi-select or "All").
- KPI tiles: mean TAT, P90 TAT, PCE, STAT %, re-key error %, rejection %, mean critical lag. Compare mode shows To-Be value with delta vs As-Is.
- Charts:
  1. Stage latency, stacked VA vs wait per stage (value stream).
  2. TAT distribution histogram.
  3. Accessioning arrivals by hour vs staffed capacity line (evening staffing −30%).
  4. Priority inversion: TAT / testing wait by priority class.
  5. Waste Pareto by stage (NVA minutes, cumulative %).
  6. Defect rates (re-key, rejection, exception).
- All values computed in `stats.js` from filtered `PIPELINE_DATA.orders`.

### `methods.html` — Methods & Deliverables

1. Data generation & calibration (incl. stage-allocation assumption, seed, tolerance).
2. Python process mining: key excerpt + output table from `metrics.json`.
3. SQL suite: each query Prism-highlighted beside its result table from `sql_results.json`; note "PostgreSQL dialect, validated with DuckDB".
4. Swimlane sources (`.mmd`).
5. Downloads: `event_log.csv`, `.sql`, `.py`, deck `.pptx`.

## 6. Executive deck

`deck/build_deck.js` (PptxGenJS, Node) reads `data/metrics.json` and writes a 10-slide deck structured as *What? / So What? / Now What?*: title, situation, TAT breakdown, bottlenecks, VSM/PCE, To-Be design, levers, roadmap, impact & ROI, ask/next steps. Native charts where useful. Last in build order; may slip without blocking the site.

## 7. Error handling

| Failure | Behavior |
|---|---|
| `js/data.js` missing/invalid | Banner "Data unavailable"; charts skipped; no thrown errors |
| Filters match 0 orders | Tiles show "—" and an empty-state message; no NaN |
| Mermaid CDN fails | Fallback ordered list of steps per lane |
| Chart.js CDN fails | KPI tiles still render; chart areas show fallback text |

## 8. Testing (TDD — tests precede implementation)

- **pytest — generator:** same seed ⇒ identical CSV hash; every §4 calibration target within tolerance.
- **pytest — mining:** `metrics.json` has required keys; stage means sum to mean TAT (±0.5 min); PCE = VA / TAT.
- **pytest — SQL:** run `sql/diagnostic_pipeline_analytics.sql` in DuckDB over `event_log.csv`; stage-latency and TAT results match Python metrics (±0.5 min). `duckdb` is a dev-only dependency.
- **node:test — `stats.js`:** filtering, mean, P90, PCE, Compare deltas, empty-filter returns nulls not NaN.
- **node:test — deck:** output .pptx contains 10 slides; key figures equal `metrics.json` values.
- **Browser verification:** load all three pages in the in-app browser; zero console errors; check 375 px and desktop layouts; toggle scenario and filters on dashboard.

Commands: `python -m pytest`, `node --test tests/`.

## 9. Build order

1. Scaffold (`netlify.toml`, `.gitignore`, `requirements.txt`, `package.json`) + generator with calibration tests.
2. Mining script → `metrics.json`, `js/data.js`.
3. SQL suite + DuckDB tests → `sql_results.json`.
4. `stats.js` + node tests.
5. Dashboard page.
6. Case study page + Mermaid swimlanes.
7. Methods page.
8. Executive deck.
9. README, `PROJECT_META.md`, final verification.

## 10. Plan corrections recorded

- Plan states "28 discrete operational steps"; its As-Is swimlane lists 18. Site uses **18 mapped steps**; the 28 figure is dropped.
- Plan §1 goal "< 5.0 h (73%)" and §7 projection "4.6 h (75.3%)" are both kept: target vs projected outcome.
- Fictional-organization disclaimer added (the name "Sovereign Health" was used by a real former company).
