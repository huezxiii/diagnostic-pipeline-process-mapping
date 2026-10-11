"""Calibration tests for the synthetic LIS event log (spec section 4)."""
import importlib.util
from pathlib import Path

import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location("gen", ROOT / "data" / "generate_event_log.py")
gen = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gen)

N = 10_000
REL = 0.02   # +/-2% relative for means
PP = 0.005   # +/-0.5 percentage points for rates


@pytest.fixture(scope="module")
def df():
    return gen.generate(seed=42, n=N)


@pytest.fixture(scope="module")
def stages(df):
    return gen.stage_durations(df)


def scen(frame, name):
    return frame[frame["scenario"] == name]


def close(actual, target):
    return abs(actual - target) <= abs(target) * REL


def test_deterministic():
    a = gen.generate(seed=7, n=500)
    b = gen.generate(seed=7, n=500)
    pd.testing.assert_frame_equal(a, b)


def test_schema(df):
    expected = [
        "order_id", "scenario", "source", "facility", "priority",
        "ts_ordered", "ts_drawn", "ts_dispatched", "ts_received",
        "ts_exception_cleared", "ts_accessioned", "ts_resulted", "ts_verified",
        "va_min", "exception", "rekey_error", "rejected", "critical", "critical_lag_min",
    ]
    assert list(df.columns) == expected
    assert len(df) == 2 * N
    assert set(df["scenario"]) == {"as_is", "to_be"}


def test_timestamps_monotonic(df):
    cols = ["ts_ordered", "ts_drawn", "ts_dispatched", "ts_received",
            "ts_exception_cleared", "ts_accessioned", "ts_resulted", "ts_verified"]
    for a, b in zip(cols, cols[1:]):
        assert (df[b] >= df[a]).all(), f"{b} before {a}"


def test_population_shared(df):
    a = scen(df, "as_is").reset_index(drop=True)
    b = scen(df, "to_be").reset_index(drop=True)
    for col in ["source", "facility", "critical"]:
        assert (a[col].values == b[col].values).all()
    assert ((a["priority"] == "stat_true").values == (b["priority"] == "stat_true").values).all()


def test_source_mix(df):
    share = scen(df, "as_is")["source"].value_counts(normalize=True)
    assert abs(share["ED"] - 0.12) <= PP
    assert abs(share["inpatient"] - 0.28) <= PP
    assert abs(share["outpatient"] - 0.60) <= PP


@pytest.mark.parametrize("name,target", [("as_is", 1116), ("to_be", 276)])
def test_mean_tat(stages, name, target):
    assert close(scen(stages, name)["tat"].mean(), target)


@pytest.mark.parametrize("name", ["as_is", "to_be"])
def test_mean_va(df, name):
    assert close(scen(df, name)["va_min"].mean(), 42)


@pytest.mark.parametrize("name,target", [("as_is", 0.0376), ("to_be", 0.152)])
def test_pce(df, stages, name, target):
    pce = scen(df, name)["va_min"].mean() / scen(stages, name)["tat"].mean()
    assert abs(pce - target) <= 0.002


@pytest.mark.parametrize("name,target", [("as_is", 0.38), ("to_be", 0.08)])
def test_stat_ratio(df, name, target):
    ratio = scen(df, name)["priority"].isin(["stat_true", "stat_flagged"]).mean()
    assert abs(ratio - target) <= PP


@pytest.mark.parametrize("col,name,target", [
    ("rekey_error", "as_is", 0.084), ("rekey_error", "to_be", 0.001),
    ("rejected", "as_is", 0.032), ("rejected", "to_be", 0.004),
    ("exception", "as_is", 0.142),
])
def test_rates(df, col, name, target):
    assert abs(scen(df, name)[col].mean() - target) <= PP


def test_to_be_exception_rate_under_2pct(df):
    assert scen(df, "to_be")["exception"].mean() <= 0.02


def test_rejected_subset_of_exception(df):
    assert (df.loc[df["rejected"] == 1, "exception"] == 1).all()


@pytest.mark.parametrize("name,target", [("as_is", 48), ("to_be", 4)])
def test_critical_lag(df, name, target):
    s = scen(df, name)
    assert close(s.loc[s["critical"] == 1, "critical_lag_min"].mean(), target)
    assert s.loc[s["critical"] == 0, "critical_lag_min"].isna().all()


@pytest.mark.parametrize("stage,name,target", [
    ("clinic_hold", "as_is", 168), ("clinic_hold", "to_be", 35),
    ("accessioning", "as_is", 270), ("accessioning", "to_be", 12),
    ("order_to_draw", "as_is", 95), ("transport", "as_is", 110),
    ("testing", "as_is", 162), ("verify_sync", "as_is", 158),
    ("testing", "to_be", 60), ("verify_sync", "to_be", 73.6),
])
def test_stage_means(stages, stage, name, target):
    assert close(scen(stages, name)[stage].mean(), target)


@pytest.mark.parametrize("name,target", [("as_is", 1080), ("to_be", 22)])
def test_exception_resolution(df, stages, name, target):
    s = scen(stages, name)
    mask = scen(df, name)["exception"] == 1
    assert close(s.loc[mask.values, "exception_hold"].mean(), target)


def test_outpatient_peak_arrivals(df):
    for name, check in [("as_is", lambda x: abs(x - 0.60) <= PP), ("to_be", lambda x: x < 0.25)]:
        s = scen(df, name)
        out = s[s["source"] == "outpatient"]
        share = out["ts_received"].dt.hour.isin([16, 17]).mean()
        assert check(share), (name, share)


def test_priority_inversion_as_is(df, stages):
    s = scen(df, "as_is")
    wait = scen(stages, "as_is")["testing"].values - s["va_min"].values
    true_med = pd.Series(wait[(s["priority"] == "stat_true").values]).median()
    flag_med = pd.Series(wait[(s["priority"] == "stat_flagged").values]).median()
    assert true_med >= flag_med


def test_stat_true_wait_to_be(df, stages):
    s = scen(df, "to_be")
    wait = scen(stages, "to_be")["testing"].values - s["va_min"].values
    assert wait[(s["priority"] == "stat_true").values].mean() <= 30
