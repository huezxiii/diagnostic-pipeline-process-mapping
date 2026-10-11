-- Sovereign Health diagnostic pipeline: analytical query suite (PostgreSQL dialect)
-- Requires sql/schema.sql (event_log table + stage_durations view).
-- Each query starts with a "-- name:" header so it can be run and displayed individually.

-- name: stage_latency
-- title: Stage-by-stage latency
-- desc: Mean minutes spent in each pipeline stage, mined from LIS event timestamps.
SELECT
    scenario,
    ROUND(AVG(order_to_draw)::numeric, 1)  AS order_to_draw,
    ROUND(AVG(clinic_hold)::numeric, 1)    AS clinic_hold,
    ROUND(AVG(transport)::numeric, 1)      AS transport,
    ROUND(AVG(exception_hold)::numeric, 1) AS exception_hold,
    ROUND(AVG(accessioning)::numeric, 1)   AS accessioning,
    ROUND(AVG(testing)::numeric, 1)        AS testing,
    ROUND(AVG(verify_sync)::numeric, 1)    AS verify_sync,
    ROUND(AVG(tat)::numeric, 1)            AS tat_min,
    ROUND((AVG(tat) / 60)::numeric, 2)     AS tat_hours
FROM stage_durations
GROUP BY scenario
ORDER BY scenario;

-- name: tat_distribution
-- title: Turnaround distribution and process cycle efficiency
-- desc: Mean, median and P90 time-to-result, plus PCE = value-added time / total cycle time.
SELECT
    scenario,
    COUNT(*)                                                               AS orders,
    ROUND(AVG(tat)::numeric, 1)                                            AS mean_tat_min,
    ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY tat))::numeric, 1) AS median_tat_min,
    ROUND((PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY tat))::numeric, 1) AS p90_tat_min,
    ROUND((AVG(va_min) / AVG(tat) * 100)::numeric, 2)                      AS pce_pct
FROM stage_durations
GROUP BY scenario
ORDER BY scenario;

-- name: bottleneck_ranking
-- title: Queue bottleneck ranking
-- desc: Non-value-added minutes per stage, ranked within each scenario with RANK() OVER and a share of total waste.
WITH stage_waits AS (
    SELECT scenario, 'order_to_draw'  AS stage, order_to_draw       AS wait_min FROM stage_durations
    UNION ALL SELECT scenario, 'clinic_hold',    clinic_hold          FROM stage_durations
    UNION ALL SELECT scenario, 'transport',      transport            FROM stage_durations
    UNION ALL SELECT scenario, 'exception_hold', exception_hold       FROM stage_durations
    UNION ALL SELECT scenario, 'accessioning',   accessioning         FROM stage_durations
    UNION ALL SELECT scenario, 'testing',        testing - va_min     FROM stage_durations
    UNION ALL SELECT scenario, 'verify_sync',    verify_sync          FROM stage_durations
),
stage_means AS (
    SELECT scenario, stage, AVG(wait_min) AS mean_wait
    FROM stage_waits
    GROUP BY scenario, stage
)
SELECT
    scenario,
    stage,
    ROUND(mean_wait::numeric, 1)                                                         AS mean_wait_min,
    ROUND((mean_wait / SUM(mean_wait) OVER (PARTITION BY scenario) * 100)::numeric, 1)   AS share_of_waste_pct,
    RANK() OVER (PARTITION BY scenario ORDER BY mean_wait DESC)                          AS wait_rank
FROM stage_means
ORDER BY scenario, wait_rank;

-- name: arrival_wave
-- title: Accessioning arrival wave by hour
-- desc: Share of specimens reaching the central dock each hour and the accessioning queue they meet.
WITH hourly AS (
    SELECT
        CAST(EXTRACT(HOUR FROM ts_received) AS INTEGER) AS arrival_hour,
        scenario,
        accessioning
    FROM stage_durations
)
SELECT
    arrival_hour,
    COUNT(*) FILTER (WHERE scenario = 'as_is')                                    AS as_is_arrivals,
    ROUND((100.0 * COUNT(*) FILTER (WHERE scenario = 'as_is')
        / SUM(COUNT(*) FILTER (WHERE scenario = 'as_is')) OVER ())::numeric, 2)  AS as_is_share_pct,
    ROUND((AVG(accessioning) FILTER (WHERE scenario = 'as_is'))::numeric, 0)      AS as_is_accession_wait_min,
    COUNT(*) FILTER (WHERE scenario = 'to_be')                                    AS to_be_arrivals,
    ROUND((100.0 * COUNT(*) FILTER (WHERE scenario = 'to_be')
        / SUM(COUNT(*) FILTER (WHERE scenario = 'to_be')) OVER ())::numeric, 2)  AS to_be_share_pct,
    ROUND((AVG(accessioning) FILTER (WHERE scenario = 'to_be'))::numeric, 0)      AS to_be_accession_wait_min
FROM hourly
GROUP BY arrival_hour
ORDER BY arrival_hour;

-- name: priority_inversion
-- title: STAT priority inversion
-- desc: Testing-queue wait by priority class. As-Is true emergencies wait as long as tagged-but-routine STATs.
SELECT
    scenario,
    priority,
    COUNT(*)                                                                         AS orders,
    ROUND((100.0 * COUNT(*) / SUM(COUNT(*)) OVER (PARTITION BY scenario))::numeric, 1) AS share_pct,
    ROUND(AVG(testing - va_min)::numeric, 1)                                         AS mean_testing_wait_min,
    ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY testing - va_min))::numeric, 1) AS median_testing_wait_min,
    ROUND((AVG(tat) / 60)::numeric, 2)                                               AS mean_tat_hours
FROM stage_durations
GROUP BY scenario, priority
ORDER BY scenario, priority DESC;

-- name: rolling_daily_tat
-- title: Daily turnaround with 7-day rolling average
-- desc: Daily mean TAT by dock-arrival date, smoothed with AVG() OVER a 7-day window.
WITH daily AS (
    SELECT
        scenario,
        CAST(ts_received AS DATE) AS arrival_date,
        COUNT(*)                  AS orders,
        AVG(tat) / 60             AS tat_hours
    FROM stage_durations
    GROUP BY scenario, CAST(ts_received AS DATE)
)
SELECT
    scenario,
    arrival_date,
    orders,
    ROUND(tat_hours::numeric, 2) AS daily_tat_hours,
    ROUND((AVG(tat_hours) OVER (
        PARTITION BY scenario
        ORDER BY arrival_date
        ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
    ))::numeric, 2)              AS rolling_7d_tat_hours
FROM daily
ORDER BY scenario, arrival_date;

-- name: defect_rates
-- title: Defect and escalation rates
-- desc: Manual-intervention, re-key, rejection and critical-value notification metrics per scenario.
SELECT
    scenario,
    ROUND((100.0 * AVG(exception))::numeric, 2)                                         AS exception_pct,
    ROUND((100.0 * AVG(rekey_error))::numeric, 2)                                       AS rekey_error_pct,
    ROUND((100.0 * AVG(rejected))::numeric, 2)                                          AS rejection_pct,
    ROUND((AVG(EXTRACT(EPOCH FROM (ts_exception_cleared - ts_received)) / 60.0)
        FILTER (WHERE exception = 1))::numeric, 1)                                      AS exception_resolution_min,
    ROUND((AVG(critical_lag_min) FILTER (WHERE critical = 1))::numeric, 1)              AS critical_lag_min
FROM event_log
GROUP BY scenario
ORDER BY scenario;

-- name: variant_analysis
-- title: Process path variants
-- desc: Cases grouped by the exception path they followed, with volume share and turnaround.
WITH variants AS (
    SELECT
        scenario,
        tat,
        CASE
            WHEN rejected = 1    THEN 'Rejected, re-collected'
            WHEN exception = 1   THEN 'Exception resolved'
            WHEN rekey_error = 1 THEN 'Re-key correction'
            ELSE 'Clean path'
        END AS variant
    FROM stage_durations
)
SELECT
    scenario,
    variant,
    COUNT(*)                                                                         AS orders,
    ROUND((100.0 * COUNT(*) / SUM(COUNT(*)) OVER (PARTITION BY scenario))::numeric, 2) AS share_pct,
    ROUND((AVG(tat) / 60)::numeric, 2)                                               AS mean_tat_hours
FROM variants
GROUP BY scenario, variant
ORDER BY scenario, orders DESC;
