"""Run the PostgreSQL-dialect SQL suite against the event log using DuckDB.

DuckDB stands in for PostgreSQL so the queries can be validated without a
database server. Writes ``data/sql_results.json`` and ``js/sql-results.js``
(the methods page shows each query next to its result).

Usage:
    python analysis/run_sql.py
"""
from __future__ import annotations

import datetime as dt
import decimal
import json
import re
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[1]
SQL_DIR = ROOT / "sql"


def connect(csv_path: Path) -> duckdb.DuckDBPyConnection:
    """Create the schema and load the CSV into an in-memory DuckDB database."""
    con = duckdb.connect()
    con.execute((SQL_DIR / "schema.sql").read_text(encoding="utf-8"))
    con.execute(
        "INSERT INTO event_log SELECT * FROM read_csv(?, header = true, nullstr = '')",
        [str(csv_path)],
    )
    return con


def parse_queries(text: str) -> list[dict]:
    """Split the suite on '-- name:' headers, collecting '-- title:' and '-- desc:' metadata."""
    queries = []
    for block in re.split(r"(?m)^-- name:\s*", text)[1:]:
        lines = block.splitlines()
        meta = {"name": lines[0].strip(), "title": "", "description": ""}
        body = []
        for line in lines[1:]:
            if line.startswith("-- title:"):
                meta["title"] = line.split(":", 1)[1].strip()
            elif line.startswith("-- desc:"):
                meta["description"] = line.split(":", 1)[1].strip()
            else:
                body.append(line)
        meta["sql"] = "\n".join(body).strip()
        queries.append(meta)
    return queries


def _plain(value):
    if isinstance(value, decimal.Decimal):
        return float(value)
    if isinstance(value, (dt.date, dt.datetime)):
        return value.isoformat()
    return value


def run_queries(con, queries: list[dict]) -> list[dict]:
    results = []
    for q in queries:
        cur = con.execute(q["sql"])
        columns = [d[0] for d in cur.description]
        rows = [[_plain(v) for v in row] for row in cur.fetchall()]
        results.append({**q, "columns": columns, "rows": rows})
    return results


def main() -> None:
    con = connect(ROOT / "data" / "event_log.csv")
    queries = parse_queries((SQL_DIR / "diagnostic_pipeline_analytics.sql").read_text(encoding="utf-8"))
    results = run_queries(con, queries)
    payload = {"engine": f"DuckDB {duckdb.__version__}", "dialect": "PostgreSQL", "queries": results}
    (ROOT / "data" / "sql_results.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")
    (ROOT / "js" / "sql-results.js").write_text(
        "window.SQL_RESULTS=" + json.dumps(payload, separators=(",", ":")) + ";\n", encoding="utf-8"
    )
    for r in results:
        print(f"{r['name']:20s} {len(r['rows']):4d} rows")


if __name__ == "__main__":
    main()
