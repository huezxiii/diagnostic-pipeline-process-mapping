-- Sovereign Health diagnostic pipeline: LIS event log schema (PostgreSQL)
--
-- Load in PostgreSQL with:
--   \copy event_log FROM 'data/event_log.csv' WITH (FORMAT csv, HEADER true)

CREATE TABLE event_log (
    order_id             VARCHAR(8)   PRIMARY KEY,
    scenario             VARCHAR(5)   NOT NULL CHECK (scenario IN ('as_is', 'to_be')),
    source               VARCHAR(10)  NOT NULL CHECK (source IN ('ED', 'inpatient', 'outpatient')),
    facility             CHAR(3)      NOT NULL,
    priority             VARCHAR(12)  NOT NULL CHECK (priority IN ('stat_true', 'stat_flagged', 'routine')),
    ts_ordered           TIMESTAMP    NOT NULL,
    ts_drawn             TIMESTAMP    NOT NULL,
    ts_dispatched        TIMESTAMP    NOT NULL,
    ts_received          TIMESTAMP    NOT NULL,
    ts_exception_cleared TIMESTAMP    NOT NULL,
    ts_accessioned       TIMESTAMP    NOT NULL,
    ts_resulted          TIMESTAMP    NOT NULL,
    ts_verified          TIMESTAMP    NOT NULL,
    va_min               NUMERIC(5,1) NOT NULL,
    exception            SMALLINT     NOT NULL,
    rekey_error          SMALLINT     NOT NULL,
    rejected             SMALLINT     NOT NULL,
    critical             SMALLINT     NOT NULL,
    critical_lag_min     NUMERIC(6,1)
);

CREATE INDEX idx_event_log_scenario_priority ON event_log (scenario, priority);

-- One row per order with every stage duration in minutes, mined from event timestamps.
CREATE VIEW stage_durations AS
SELECT
    order_id,
    scenario,
    source,
    priority,
    ts_received,
    va_min,
    exception,
    rekey_error,
    rejected,
    EXTRACT(EPOCH FROM (ts_drawn             - ts_ordered))           / 60.0 AS order_to_draw,
    EXTRACT(EPOCH FROM (ts_dispatched        - ts_drawn))             / 60.0 AS clinic_hold,
    EXTRACT(EPOCH FROM (ts_received          - ts_dispatched))        / 60.0 AS transport,
    EXTRACT(EPOCH FROM (ts_exception_cleared - ts_received))          / 60.0 AS exception_hold,
    EXTRACT(EPOCH FROM (ts_accessioned       - ts_exception_cleared)) / 60.0 AS accessioning,
    EXTRACT(EPOCH FROM (ts_resulted          - ts_accessioned))       / 60.0 AS testing,
    EXTRACT(EPOCH FROM (ts_verified          - ts_resulted))          / 60.0 AS verify_sync,
    EXTRACT(EPOCH FROM (ts_verified          - ts_ordered))           / 60.0 AS tat
FROM event_log;
