"""Tests for the process mining script (metrics.json + js/data.js bundle)."""
import importlib.util
import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]


def _load(name, rel):
    spec = importlib.util.spec_from_file_location(name, ROOT / rel)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


gen = _load("gen", "data/generate_event_log.py")
mining = _load("mining", "analysis/process_mining_analysis.py")


@pytest.fixture(scope="module")
def df():
    return gen.load(ROOT / "data" / "event_log.csv")


@pytest.fixture(scope="module")
def metrics(df):
    return mining.compute_metrics(df)


SCALARS = [
    "n", "mean_tat", "median_tat", "p90_tat", "mean_va", "pce", "stat_ratio",
    "rekey_error_rate", "rejection_rate", "exception_rate", "mean_critical_lag",
    "mean_exception_resolution", "outpatient_peak_arrival_share",
]


def test_structure(metrics):
    assert set(metrics["scenarios"]) == {"as_is", "to_be"}
    assert [s["key"] for s in metrics["stages"]] == mining.STAGE_KEYS
    for sc in metrics["scenarios"].values():
        for key in SCALARS:
            assert key in sc, key
        for key in ["stage_means", "bottlenecks", "priority", "source", "arrivals_by_hour", "variants"]:
            assert key in sc, key
        assert len(sc["arrivals_by_hour"]) == 24
    assert "comparison" in metrics


@pytest.mark.parametrize("name", ["as_is", "to_be"])
def test_stage_means_sum_to_tat(metrics, name):
    sc = metrics["scenarios"][name]
    assert abs(sum(sc["stage_means"].values()) - sc["mean_tat"]) <= 0.5


@pytest.mark.parametrize("name", ["as_is", "to_be"])
def test_pce_definition(metrics, name):
    sc = metrics["scenarios"][name]
    assert abs(sc["pce"] - sc["mean_va"] / sc["mean_tat"]) < 1e-5  # inputs rounded to 3 dp


def test_headline_values(metrics):
    a, b = metrics["scenarios"]["as_is"], metrics["scenarios"]["to_be"]
    assert abs(a["mean_tat"] / 60 - 18.6) < 0.2
    assert abs(b["mean_tat"] / 60 - 4.6) < 0.1
    assert abs(metrics["comparison"]["tat_reduction_pct"] - 75.3) < 1.0


@pytest.mark.parametrize("name", ["as_is", "to_be"])
def test_variants_cover_all_orders(metrics, name):
    sc = metrics["scenarios"][name]
    assert sum(v["n"] for v in sc["variants"]) == sc["n"]


def test_as_is_top_bottleneck_is_accessioning(metrics):
    top = metrics["scenarios"]["as_is"]["bottlenecks"][0]
    assert top["stage"] == "accessioning" and top["rank"] == 1


def test_bottleneck_waste_sums_to_nva(metrics):
    sc = metrics["scenarios"]["as_is"]
    nva = sum(b["mean_wait"] for b in sc["bottlenecks"])
    assert abs(nva - (sc["mean_tat"] - sc["mean_va"])) <= 0.5


def test_data_bundle(df, metrics):
    bundle = mining.build_bundle(df, metrics)
    cols = bundle["cols"]
    lengths = {len(v) for v in cols.values()}
    assert lengths == {20_000}
    js = mining.to_js(bundle)
    assert js.startswith("window.PIPELINE_DATA=")
    parsed = json.loads(js[len("window.PIPELINE_DATA="):].rstrip(";\n"))
    assert parsed["metrics"]["scenarios"]["as_is"]["n"] == 10_000
