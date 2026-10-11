"""Generate a seeded synthetic LIS event log for the Sovereign Health diagnostic pipeline.

Each row is one lab order in one scenario (As-Is or To-Be) with eight event
timestamps. Stage durations are not stored; they are mined from the timestamps
(see ``stage_durations``). Stage samples are gamma-distributed with structural
multipliers (source, priority, arrival hour) and then rescaled to the plan's
baseline means, so the aggregates reproduce the case-study figures.

Usage:
    python data/generate_event_log.py [--seed 42] [--n 10000] [--out data/event_log.csv]
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd

START_DATE = pd.Timestamp("2026-01-05")
DAYS = 84  # 12-week observation window

# Mean minutes per stage (spec section 4, "Stage allocation").
TARGETS = {
    "as_is": {
        "order_to_draw": 95, "clinic_hold": 168, "transport": 110,
        "accessioning": 270, "testing_wait": 120, "verify_sync": 158,
        "exception_hold": 1080, "critical_lag": 48,
    },
    "to_be": {
        "order_to_draw": 45, "clinic_hold": 35, "transport": 50,
        "accessioning": 12, "testing_wait": 18, "verify_sync": 73.6,
        "exception_hold": 22, "critical_lag": 4,
    },
}

# Exact-count rates per scenario.
RATES = {
    "as_is": {"stat_flagged": 0.31, "exception": 0.142, "rejected": 0.032, "rekey_error": 0.084},
    "to_be": {"stat_flagged": 0.01, "exception": 0.018, "rejected": 0.004, "rekey_error": 0.001},
}

SOURCE_MIX = {"ED": 0.12, "inpatient": 0.28, "outpatient": 0.60}
STAT_TRUE = {"ED": 0.06, "inpatient": 0.01}  # share of all orders
CRITICAL_RATE = 0.02
VA_MEAN = 42.0

COLUMNS = [
    "order_id", "scenario", "source", "facility", "priority",
    "ts_ordered", "ts_drawn", "ts_dispatched", "ts_received",
    "ts_exception_cleared", "ts_accessioned", "ts_resulted", "ts_verified",
    "va_min", "exception", "rekey_error", "rejected", "critical", "critical_lag_min",
]


def _pick(rng: np.random.Generator, candidates: np.ndarray, k: int) -> np.ndarray:
    """Return exactly k distinct indices drawn from candidates."""
    return rng.choice(candidates, size=k, replace=False)


def _scaled_gamma(rng, n, shape, multiplier, target):
    x = rng.gamma(shape, 1.0, n) * multiplier
    return x * (target / x.mean())


def _population(rng: np.random.Generator, n: int) -> pd.DataFrame:
    counts = {k: round(v * n) for k, v in SOURCE_MIX.items()}
    counts["outpatient"] = n - counts["ED"] - counts["inpatient"]
    source = np.concatenate([np.full(c, s, dtype=object) for s, c in counts.items()])
    rng.shuffle(source)

    hospital = source != "outpatient"
    facility = np.where(
        hospital,
        np.char.add("H", np.char.zfill(rng.integers(1, 13, n).astype(str), 2)),
        np.char.add("C", np.char.zfill(rng.integers(1, 46, n).astype(str), 2)),
    )

    stat_true = np.zeros(n, dtype=bool)
    for src, share in STAT_TRUE.items():
        idx = np.flatnonzero(source == src)
        stat_true[_pick(rng, idx, round(share * n))] = True

    critical = np.zeros(n, dtype=np.int8)
    critical[_pick(rng, np.arange(n), round(CRITICAL_RATE * n))] = 1

    va = np.clip(rng.normal(VA_MEAN, 5.0, n), 30, 60)
    va = va * (VA_MEAN / va.mean())

    return pd.DataFrame({
        "source": source,
        "facility": facility,
        "stat_true": stat_true,
        "critical": critical,
        "va": va,
        "day": rng.integers(0, DAYS, n),
    })


def _arrival_minutes(rng, pop: pd.DataFrame, scenario: str) -> np.ndarray:
    """Minute of day at which the specimen reaches the central dock."""
    n = len(pop)
    out = np.empty(n)
    hospital_idx = np.flatnonzero(pop["source"].values != "outpatient")
    clinic_idx = np.flatnonzero(pop["source"].values == "outpatient")

    # Hospital specimens arrive around the clock, weighted toward daytime.
    weights = np.array([1 if (h < 6 or h > 22) else 2 for h in range(24)], dtype=float)
    hours = rng.choice(24, size=len(hospital_idx), p=weights / weights.sum())
    out[hospital_idx] = hours * 60 + rng.uniform(0, 60, len(hospital_idx))

    if scenario == "as_is":
        # Fixed courier schedule: exactly 60% of clinic specimens land in the 16:00-17:59 wave.
        wave = _pick(rng, clinic_idx, round(0.60 * len(clinic_idx)))
        rest = np.setdiff1d(clinic_idx, wave)
        out[wave] = rng.uniform(960, 1080, len(wave))
        early = rng.random(len(rest)) < 0.4
        out[rest] = np.where(early, rng.uniform(600, 720, len(rest)), rng.uniform(780, 960, len(rest)))
    else:
        # Volume-triggered dispatch spreads arrivals across the clinic day.
        out[clinic_idx] = rng.uniform(480, 1200, len(clinic_idx))
    return out


def _simulate(rng: np.random.Generator, pop: pd.DataFrame, scenario: str) -> pd.DataFrame:
    n = len(pop)
    t = TARGETS[scenario]
    r = RATES[scenario]
    src = pop["source"].values
    out_m = src == "outpatient"
    ed_m = src == "ED"
    inp_m = src == "inpatient"

    # Priority
    priority = np.full(n, "routine", dtype=object)
    priority[pop["stat_true"].values] = "stat_true"
    flagged = _pick(rng, np.flatnonzero(~pop["stat_true"].values), round(r["stat_flagged"] * n))
    priority[flagged] = "stat_flagged"
    st_m = priority == "stat_true"
    sf_m = priority == "stat_flagged"

    # Upstream stages (source-driven)
    m_draw = np.select([out_m, inp_m, ed_m], [1.2, 0.9, 0.4]) * np.where(st_m, 0.5, 1.0)
    order_to_draw = _scaled_gamma(rng, n, 2.5, m_draw, t["order_to_draw"])
    clinic_hold = _scaled_gamma(rng, n, 2.5, np.select([out_m, inp_m, ed_m], [1.3, 0.75, 0.45]), t["clinic_hold"])
    transport = _scaled_gamma(rng, n, 4.0, np.where(out_m, 1.4, 0.5), t["transport"])

    arrival = _arrival_minutes(rng, pop, scenario)
    hour = (arrival // 60).astype(int)

    # Accessioning queue (Queue 3): the 16:00-18:00 wave meets a 30% thinner evening shift.
    if scenario == "as_is":
        m_acc = np.select([np.isin(hour, [16, 17]), np.isin(hour, [18, 19, 20, 21])], [2.2, 1.4], 0.5)
    else:
        m_acc = np.ones(n)
    accessioning = _scaled_gamma(rng, n, 3.0, m_acc, t["accessioning"])

    # Testing = value-added run + queue wait (Queue 4). As-Is shows priority inversion.
    if scenario == "as_is":
        m_wait = np.select([st_m, sf_m], [1.25, 1.0], 0.95)
    else:
        m_wait = np.select([st_m, sf_m], [0.3, 0.5], 1.08)
    testing_wait = _scaled_gamma(rng, n, 2.0, m_wait, t["testing_wait"])
    testing = pop["va"].values + testing_wait

    # Verification + EHR sync. To-Be: 92% auto-verified, 8% manual review.
    if scenario == "as_is":
        verify_sync = _scaled_gamma(rng, n, 3.0, np.ones(n), t["verify_sync"])
    else:
        manual = rng.random(n) < 0.08
        verify_sync = _scaled_gamma(rng, n, 3.0, np.where(manual, 6.0, 1.0), t["verify_sync"])

    # Exceptions, rejections (subset), re-key errors
    exception = np.zeros(n, dtype=np.int8)
    exc_idx = _pick(rng, np.arange(n), round(r["exception"] * n))
    exception[exc_idx] = 1
    rejected = np.zeros(n, dtype=np.int8)
    rejected[_pick(rng, exc_idx, round(r["rejected"] * n))] = 1
    rekey = np.zeros(n, dtype=np.int8)
    k_rekey = round(r["rekey_error"] * n)
    if scenario == "as_is":
        k_in = k_rekey // 2
        rekey[_pick(rng, exc_idx, k_in)] = 1
        rekey[_pick(rng, np.flatnonzero(exception == 0), k_rekey - k_in)] = 1
    else:
        rekey[_pick(rng, np.arange(n), k_rekey)] = 1

    exception_hold = np.zeros(n)
    if scenario == "as_is":
        hold = rng.uniform(720, 1440, len(exc_idx))
    else:
        hold = rng.gamma(3.0, 1.0, len(exc_idx))
    exception_hold[exc_idx] = hold * (t["exception_hold"] / hold.mean())

    critical = pop["critical"].values
    lag = np.full(n, np.nan)
    crit_idx = np.flatnonzero(critical == 1)
    lag_s = rng.gamma(2.0 if scenario == "as_is" else 3.0, 1.0, len(crit_idx))
    lag[crit_idx] = np.round(lag_s * (t["critical_lag"] / lag_s.mean()), 1)

    # Timestamps: arrival anchored, upstream subtracted, downstream added.
    def td(minutes):
        return pd.to_timedelta(np.round(minutes * 60), unit="s")

    day0 = START_DATE + pd.to_timedelta(pop["day"].values, unit="D")
    received = day0 + td(arrival)
    dispatched = received - td(transport)
    drawn = dispatched - td(clinic_hold)
    ordered = drawn - td(order_to_draw)
    cleared = received + td(exception_hold)
    accessioned = cleared + td(accessioning)
    resulted = accessioned + td(testing)
    verified = resulted + td(verify_sync)

    prefix = "AS" if scenario == "as_is" else "TB"
    return pd.DataFrame({
        "order_id": [f"{prefix}-{i:05d}" for i in range(1, n + 1)],
        "scenario": scenario,
        "source": src,
        "facility": pop["facility"].values,
        "priority": priority,
        "ts_ordered": ordered,
        "ts_drawn": drawn,
        "ts_dispatched": dispatched,
        "ts_received": received,
        "ts_exception_cleared": cleared,
        "ts_accessioned": accessioned,
        "ts_resulted": resulted,
        "ts_verified": verified,
        "va_min": np.round(pop["va"].values, 1),
        "exception": exception,
        "rekey_error": rekey,
        "rejected": rejected,
        "critical": critical,
        "critical_lag_min": lag,
    })[COLUMNS]


def generate(seed: int = 42, n: int = 10_000) -> pd.DataFrame:
    """Return the full event log: n As-Is rows followed by n To-Be rows."""
    rng = np.random.default_rng(seed)
    pop = _population(rng, n)
    frames = [_simulate(rng, pop, s) for s in ("as_is", "to_be")]
    return pd.concat(frames, ignore_index=True)


def stage_durations(df: pd.DataFrame) -> pd.DataFrame:
    """Mine per-stage durations (minutes) from event timestamps."""
    def mins(a, b):
        return (df[b] - df[a]).dt.total_seconds() / 60.0

    return pd.DataFrame({
        "scenario": df["scenario"],
        "order_to_draw": mins("ts_ordered", "ts_drawn"),
        "clinic_hold": mins("ts_drawn", "ts_dispatched"),
        "transport": mins("ts_dispatched", "ts_received"),
        "exception_hold": mins("ts_received", "ts_exception_cleared"),
        "accessioning": mins("ts_exception_cleared", "ts_accessioned"),
        "testing": mins("ts_accessioned", "ts_resulted"),
        "verify_sync": mins("ts_resulted", "ts_verified"),
        "tat": mins("ts_ordered", "ts_verified"),
    }, index=df.index)


def load(path: Path) -> pd.DataFrame:
    """Read an event-log CSV back with parsed timestamps."""
    ts_cols = [c for c in COLUMNS if c.startswith("ts_")]
    return pd.read_csv(path, parse_dates=ts_cols)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--n", type=int, default=10_000)
    parser.add_argument("--out", type=Path, default=Path(__file__).with_name("event_log.csv"))
    args = parser.parse_args()
    df = generate(args.seed, args.n)
    df.to_csv(args.out, index=False, date_format="%Y-%m-%d %H:%M:%S")
    print(f"wrote {len(df):,} rows -> {args.out}")


if __name__ == "__main__":
    main()
