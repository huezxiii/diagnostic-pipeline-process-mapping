"""Validate the PostgreSQL-dialect SQL suite by running it in DuckDB."""
import importlib.util
import json
from pathlib import Path

import pytest

duckdb = pytest.importorskip("duckdb")

ROOT = Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location("run_sql", ROOT / "analysis" / "run_sql.py")
run_sql = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(run_sql)

EXPECTED = {
    "stage_latency", "tat_distribution", "bottleneck_ranking", "arrival_wave",
    "priority_inversion", "rolling_daily_tat", "defect_rates", "variant_analysis",
}


@pytest.fixture(scope="module")
def results():
    con = run_sql.connect(ROOT / "data" / "event_log.csv")
    queries = run_sql.parse_queries((ROOT / "sql" / "diagnostic_pipeline_analytics.sql").read_text(encoding="utf-8"))
    return {r["name"]: r for r in run_sql.run_queries(con, queries)}


@pytest.fixture(scope="module")
def metrics():
    return json.loads((ROOT / "data" / "metrics.json").read_text(encoding="utf-8"))


def rows(result):
    return [dict(zip(result["columns"], r)) for r in result["rows"]]


def by_scenario(result):
    return {r["scenario"]: r for r in rows(result)}


def test_all_queries_present_and_nonempty(results):
    assert set(results) == EXPECTED
    for r in results.values():
        assert r["title"] and r["description"] and r["sql"].strip()
        assert len(r["rows"]) > 0, r["name"]


@pytest.mark.parametrize("scenario", ["as_is", "to_be"])
def test_stage_latency_matches_python(results, metrics, scenario):
    sql_row = by_scenario(results["stage_latency"])[scenario]
    for stage, mean in metrics["scenarios"][scenario]["stage_means"].items():
        assert abs(sql_row[stage] - mean) <= 0.5, stage
    assert abs(sql_row["tat_min"] - metrics["scenarios"][scenario]["mean_tat"]) <= 0.5


@pytest.mark.parametrize("scenario", ["as_is", "to_be"])
def test_tat_distribution_matches_python(results, metrics, scenario):
    sql_row = by_scenario(results["tat_distribution"])[scenario]
    m = metrics["scenarios"][scenario]
    assert abs(sql_row["median_tat_min"] - m["median_tat"]) <= 0.5
    assert abs(sql_row["p90_tat_min"] - m["p90_tat"]) <= 0.5
    assert abs(sql_row["pce_pct"] - m["pce"] * 100) <= 0.05


def test_bottleneck_rank(results):
    top = [r for r in rows(results["bottleneck_ranking"]) if r["scenario"] == "as_is" and r["wait_rank"] == 1]
    assert top[0]["stage"] == "accessioning"


def test_arrival_shares_sum_to_one(results):
    rs = rows(results["arrival_wave"])
    assert len(rs) == 24
    assert abs(sum(r["as_is_share_pct"] for r in rs) - 100) <= 0.5
    assert abs(sum(r["to_be_share_pct"] for r in rs) - 100) <= 0.5


def test_variants_match_python(results, metrics):
    for scenario in ("as_is", "to_be"):
        sql_counts = {r["variant"]: r["orders"] for r in rows(results["variant_analysis"]) if r["scenario"] == scenario}
        py_counts = {v["variant"]: v["n"] for v in metrics["scenarios"][scenario]["variants"] if v["n"] > 0}
        assert sql_counts == py_counts


def test_rolling_average_present(results):
    r = rows(results["rolling_daily_tat"])
    assert "rolling_7d_tat_hours" in r[0]
    assert len(r) > 100


def test_defect_rates_match(results, metrics):
    for scenario, row in by_scenario(results["defect_rates"]).items():
        m = metrics["scenarios"][scenario]
        assert abs(row["rekey_error_pct"] - m["rekey_error_rate"] * 100) <= 0.05
        assert abs(row["rejection_pct"] - m["rejection_rate"] * 100) <= 0.05
