---
project_name: "diagnostic-pipeline-process-mapping"
primary_language: "HTML/JS"
technologies: ["Chart.js", "Mermaid", "Prism", "Python", "pandas", "NumPy", "DuckDB", "PostgreSQL", "Playwright", "Node.js", "PptxGenJS", "Netlify"]
type: "DASH-WEB"
domain: "DATA-ANALYTICS"
stage: "ACTIVE"
stack: "JS-VANILLA"
tags: ["process-mapping", "value-stream-mapping", "process-mining", "healthcare-operations", "lab-turnaround", "sipoc", "swimlane", "bottleneck-analysis", "roi", "synthetic-data", "netlify", "powerpoint"]
run_command: "python -m http.server 8080"
launch_url: "http://localhost:8080"
---

# Project Overview
A three-page static site (case study, interactive dashboard, methods) for a fictional health system's lab diagnostic pipeline. Process mapping and event-log mining cut mean time-to-result from 18.6 h to 4.6 h. Not yet deployed: Netlify-ready, repository local only.

## Technologies Used
* **Languages:** HTML5, CSS3, JavaScript (ES2020), Python 3.12+, SQL (PostgreSQL dialect)
* **Frameworks/Libraries:** Chart.js 4.4.4, Mermaid 11.4.1, Prism 1.29 (CDN, pinned with SRI), NumPy, pandas, PptxGenJS 3.12
* **Databases/Tools:** Node.js, DuckDB (SQL validation), pytest, node:test, Playwright (headless smoke tests), Netlify

## Key Details
* **Core Functionality:** Case-study narrative with SIPOC, Mermaid As-Is (18 steps) and To-Be (12 steps) swimlanes, value stream bars, levers, roadmap and ROI. The dashboard has an As-Is / To-Be / Compare toggle, source, priority and facility filters, 7 KPI tiles, 6 charts with table views and path variants. The methods page shows calibration results, mining excerpts, SQL queries beside their results, and downloads. There is also a 10-slide executive deck.
* **Notable Architecture:** Seeded generator writes an 8-timestamp LIS event log (20,000 rows) calibrated to the plan baseline. A pandas mining script produces `metrics.json` and a columnar `js/data.js`. A PostgreSQL query suite is validated in DuckDB against the Python output. `js/stats.js` is a DOM-free UMD aggregation engine shared by the browser and Node tests. `js/financials.js` is the single source for capex, savings and the roadmap (site and deck). The palette is validated for color-vision deficiency; As-Is is orange, To-Be blue, value-added green. Static, with no build step; `netlify.toml` publishes the repo root.
* **Entry points:** `index.html`, `dashboard.html`, `methods.html`. Serve with `python -m http.server 8080`.
* **Tests:** `python -m pytest -q` (generator, mining, SQL, diagrams, excerpts, Playwright page smoke) and `npm test` (stats engine, deck).
