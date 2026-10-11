"""Process mining over the Sovereign Health LIS event log.

Reads ``data/event_log.csv``, mines stage-by-stage latency from event
timestamps, ranks queue bottlenecks, classifies path variants, and writes:

* ``data/metrics.json``  summary metrics (methods page, executive deck)
* ``js/data.js``         per-order columnar bundle for the dashboard

Usage:
    python analysis/process_mining_analysis.py
"""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]

_spec = importlib.util.spec_from_file_location("gen", ROOT / "data" / "generate_event_log.py")
gen = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gen)

STAGES = [
    {"key": "order_to_draw", "label": "Order to Draw", "lane": "Clinical Order Entry & Phlebotomy", "queue": None},
    {"key": "clinic_hold", "label": "Clinic Holding Bin", "lane": "Clinical Order Entry & Phlebotomy", "queue": "Q1"},
    {"key": "transport", "label": "Courier Transport & Dock", "lane": "Logistics & Dispatch", "queue": "Q2"},
    {"key": "exception_hold", "label": "Exception Resolution", "lane": "Quality & Governance", "queue": None},
    {"key": "accessioning", "label": "Central Accessioning", "lane": "Central Accessioning", "queue": "Q3"},
    {"key": "testing", "label": "Sort & Testing", "lane": "Testing & Pathology", "queue": "Q4"},
    {"key": "verify_sync", "label": "Verification & EHR Sync", "lane": "EHR Integration & Billing", "queue": None},
]
STAGE_KEYS = [s["key"] for s in STAGES]
PRIORITIES = ["stat_true", "stat_flagged", "routine"]
SOURCES = ["ED", "inpatient", "outpatient"]


def _r(x, nd=2):
    return None if x is None or (isinstance(x, float) and np.isnan(x)) else round(float(x), nd)


def classify_variants(df: pd.DataFrame) -> pd.Series:
    """Assign each case to a path variant based on the exception events it went through."""
    return pd.Series(
        np.select(
            [df["rejected"] == 1, df["exception"] == 1, df["rekey_error"] == 1],
            ["Rejected, re-collected", "Exception resolved", "Re-key correction"],
            "Clean path",
        ),
        index=df.index,
    )


def _scenario_metrics(df: pd.DataFrame, st: pd.DataFrame) -> dict:
    tat = st["tat"]
    mean_tat = tat.mean()
    mean_va = df["va_min"].mean()
    testing_wait = st["testing"] - df["va_min"]

    stage_means = {k: _r(st[k].mean(), 3) for k in STAGE_KEYS}

    waits = {k: st[k].mean() for k in STAGE_KEYS}
    waits["testing"] = testing_wait.mean()
    nva = sum(waits.values())
    ranked = sorted(waits.items(), key=lambda kv: kv[1], reverse=True)
    bottlenecks = [
        {"stage": k, "mean_wait": _r(v, 3), "share_of_nva": _r(v / nva, 4), "rank": i + 1}
        for i, (k, v) in enumerate(ranked)
    ]

    priority = {}
    for p in PRIORITIES:
        m = df["priority"] == p
        priority[p] = {
            "n": int(m.sum()),
            "share": _r(m.mean(), 4),
            "mean_tat": _r(tat[m].mean()),
            "mean_testing_wait": _r(testing_wait[m].mean()),
            "median_testing_wait": _r(testing_wait[m].median()),
        }

    source = {s: {"n": int((df["source"] == s).sum()), "mean_tat": _r(tat[df["source"] == s].mean())} for s in SOURCES}

    hours = df["ts_received"].dt.hour
    arrivals = np.bincount(hours, minlength=24).tolist()
    out = df["source"] == "outpatient"

    variants = classify_variants(df)
    variant_rows = [
        {"variant": v, "n": int((variants == v).sum()), "share": _r((variants == v).mean(), 4),
         "mean_tat": _r(tat[variants == v].mean())}
        for v in ["Clean path", "Re-key correction", "Exception resolved", "Rejected, re-collected"]
    ]

    exc = df["exception"] == 1
    crit = df["critical"] == 1
    return {
        "n": int(len(df)),
        "mean_tat": _r(mean_tat, 3),
        "median_tat": _r(tat.median()),
        "p90_tat": _r(tat.quantile(0.9)),
        "mean_va": _r(mean_va, 3),
        "pce": _r(mean_va / mean_tat, 6),
        "stat_ratio": _r(df["priority"].isin(["stat_true", "stat_flagged"]).mean(), 4),
        "rekey_error_rate": _r(df["rekey_error"].mean(), 4),
        "rejection_rate": _r(df["rejected"].mean(), 4),
        "exception_rate": _r(df["exception"].mean(), 4),
        "mean_critical_lag": _r(df.loc[crit, "critical_lag_min"].mean()),
        "mean_exception_resolution": _r(st.loc[exc, "exception_hold"].mean()),
        "outpatient_peak_arrival_share": _r(hours[out].isin([16, 17]).mean(), 4),
        "stage_means": stage_means,
        "bottlenecks": bottlenecks,
        "priority": priority,
        "source": source,
        "arrivals_by_hour": arrivals,
        "variants": variant_rows,
    }


def _pct_change(before, after):
    return round((before - after) / before * 100, 1)


def compute_metrics(df: pd.DataFrame) -> dict:
    st = gen.stage_durations(df)
    scenarios = {}
    for name in ("as_is", "to_be"):
        m = df["scenario"] == name
        scenarios[name] = _scenario_metrics(df[m], st[m])
    a, b = scenarios["as_is"], scenarios["to_be"]
    comparison = {
        "tat_reduction_pct": _pct_change(a["mean_tat"], b["mean_tat"]),
        "pce_increase_pct": round((b["pce"] / a["pce"] - 1) * 100, 1),
        "rekey_reduction_pct": _pct_change(a["rekey_error_rate"], b["rekey_error_rate"]),
        "rejection_reduction_pct": _pct_change(a["rejection_rate"], b["rejection_rate"]),
        "stat_reduction_pct": _pct_change(a["stat_ratio"], b["stat_ratio"]),
        "critical_lag_reduction_pct": _pct_change(a["mean_critical_lag"], b["mean_critical_lag"]),
    }
    as_is = df[df["scenario"] == "as_is"]
    return {
        "meta": {
            "seed": 42,
            "orders_per_scenario": int(len(as_is)),
            "window_start": str(df["ts_received"].min().date()),
            "window_end": str(df["ts_received"].max().date()),
        },
        "stages": STAGES,
        "scenarios": scenarios,
        "comparison": comparison,
    }


def build_bundle(df: pd.DataFrame, metrics: dict) -> dict:
    """Columnar per-order bundle for the dashboard (categoricals as dictionary indexes)."""
    st = gen.stage_durations(df)
    dicts = {
        "scenario": ["as_is", "to_be"],
        "source": SOURCES,
        "priority": PRIORITIES,
        "facility": sorted(df["facility"].unique().tolist()),
    }

    def codes(col):
        lookup = {v: i for i, v in enumerate(dicts[col])}
        return df[col].map(lookup).astype(int).tolist()

    def mins(series):
        return [round(float(x), 1) for x in series]

    lag = [None if np.isnan(x) else round(float(x), 1) for x in df["critical_lag_min"]]
    cols = {
        "sc": codes("scenario"),
        "src": codes("source"),
        "pri": codes("priority"),
        "fac": codes("facility"),
        "ch": df["ts_drawn"].dt.hour.tolist(),
        "ah": df["ts_received"].dt.hour.tolist(),
        "otd": mins(st["order_to_draw"]),
        "hold": mins(st["clinic_hold"]),
        "trn": mins(st["transport"]),
        "exc": mins(st["exception_hold"]),
        "acc": mins(st["accessioning"]),
        "tst": mins(st["testing"]),
        "ver": mins(st["verify_sync"]),
        "va": mins(df["va_min"]),
        "ef": df["exception"].astype(int).tolist(),
        "rk": df["rekey_error"].astype(int).tolist(),
        "rj": df["rejected"].astype(int).tolist(),
        "cr": df["critical"].astype(int).tolist(),
        "lag": lag,
    }
    return {"dict": dicts, "cols": cols, "metrics": metrics}


def to_js(bundle: dict) -> str:
    return "window.PIPELINE_DATA=" + json.dumps(bundle, separators=(",", ":")) + ";\n"


def main() -> None:
    df = gen.load(ROOT / "data" / "event_log.csv")
    metrics = compute_metrics(df)
    (ROOT / "data" / "metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    (ROOT / "js" / "data.js").write_text(to_js(build_bundle(df, metrics)), encoding="utf-8")

    for name, sc in metrics["scenarios"].items():
        print(f"{name:6s} TAT {sc['mean_tat'] / 60:5.2f} h | PCE {sc['pce']:.2%} | "
              f"top bottleneck: {sc['bottlenecks'][0]['stage']} ({sc['bottlenecks'][0]['mean_wait']:.0f} min)")
    print(f"TAT reduction: {metrics['comparison']['tat_reduction_pct']}%")


if __name__ == "__main__":
    main()
