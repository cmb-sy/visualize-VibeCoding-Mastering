-- ==================== TABLES ====================

CREATE TABLE IF NOT EXISTS sessions (
    session_id   TEXT PRIMARY KEY,
    project_path TEXT,
    project_name TEXT,
    started_at   TIMESTAMPTZ,
    ended_at     TIMESTAMPTZ,
    git_branch   TEXT,
    model        TEXT,
    collected_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS messages (
    id                  BIGSERIAL PRIMARY KEY,
    session_id          TEXT NOT NULL REFERENCES sessions(session_id),
    role                TEXT NOT NULL,
    timestamp           TIMESTAMPTZ,
    input_tokens        INTEGER DEFAULT 0,
    output_tokens       INTEGER DEFAULT 0,
    cache_read_tokens   INTEGER DEFAULT 0,
    cache_write_tokens  INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tool_uses (
    id          BIGSERIAL PRIMARY KEY,
    session_id  TEXT NOT NULL REFERENCES sessions(session_id),
    tool_name   TEXT NOT NULL,
    timestamp   TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS skill_uses (
    id          BIGSERIAL PRIMARY KEY,
    session_id  TEXT NOT NULL REFERENCES sessions(session_id),
    skill_name  TEXT NOT NULL,
    timestamp   TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS subagent_uses (
    id             BIGSERIAL PRIMARY KEY,
    session_id     TEXT NOT NULL REFERENCES sessions(session_id),
    subagent_type  TEXT NOT NULL,
    description    TEXT,
    timestamp      TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS model_costs (
    model                     TEXT PRIMARY KEY,
    input_cost_per_million    NUMERIC NOT NULL,
    output_cost_per_million   NUMERIC NOT NULL
);

INSERT INTO model_costs VALUES
    ('claude-opus-4-6',           15.0,  75.0),
    ('claude-sonnet-4-6',          3.0,  15.0),
    ('claude-sonnet-4-20250514',   3.0,  15.0),
    ('claude-haiku-4-5',           0.8,   4.0),
    ('claude-haiku-4-5-20251001',  0.8,   4.0)
ON CONFLICT DO NOTHING;

-- ==================== INDEXES ====================

CREATE INDEX IF NOT EXISTS idx_messages_session     ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_role        ON messages(role);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp   ON messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_tool_uses_session    ON tool_uses(session_id);
CREATE INDEX IF NOT EXISTS idx_skill_uses_session   ON skill_uses(session_id);
CREATE INDEX IF NOT EXISTS idx_subagent_session     ON subagent_uses(session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_started     ON sessions(started_at);

-- ==================== VIEWS ====================

CREATE OR REPLACE VIEW summary_stats AS
SELECT
    (SELECT COUNT(*) FROM sessions)      AS total_sessions,
    (SELECT COUNT(*) FROM tool_uses)     AS total_tool_uses,
    (SELECT COUNT(*) FROM skill_uses)    AS total_skill_uses,
    (SELECT COUNT(*) FROM subagent_uses) AS total_subagent_uses,
    COALESCE(SUM(m.input_tokens), 0)       AS total_input_tokens,
    COALESCE(SUM(m.output_tokens), 0)      AS total_output_tokens,
    COALESCE(SUM(m.cache_read_tokens), 0)  AS total_cache_read_tokens,
    COALESCE(SUM(m.cache_write_tokens), 0) AS total_cache_write_tokens,
    COALESCE(ROUND(SUM(
        m.input_tokens  * COALESCE(mc.input_cost_per_million,  3.0) +
        m.output_tokens * COALESCE(mc.output_cost_per_million, 15.0)
    ) / 1000000.0, 4), 0) AS estimated_cost_usd
FROM messages m
JOIN sessions s ON m.session_id = s.session_id
LEFT JOIN model_costs mc ON s.model = mc.model
WHERE m.role = 'assistant';

CREATE OR REPLACE VIEW daily_stats AS
SELECT
    (m.timestamp AT TIME ZONE 'UTC')::date AS date,
    SUM(m.input_tokens)          AS input_tokens,
    SUM(m.output_tokens)         AS output_tokens,
    SUM(m.cache_read_tokens)     AS cache_read_tokens,
    COUNT(DISTINCT m.session_id) AS sessions,
    ROUND(SUM(
        m.input_tokens  * COALESCE(mc.input_cost_per_million,  3.0) +
        m.output_tokens * COALESCE(mc.output_cost_per_million, 15.0)
    ) / 1000000.0, 4) AS estimated_cost_usd
FROM messages m
JOIN sessions s ON m.session_id = s.session_id
LEFT JOIN model_costs mc ON s.model = mc.model
WHERE m.role = 'assistant'
GROUP BY (m.timestamp AT TIME ZONE 'UTC')::date
ORDER BY date;

CREATE OR REPLACE VIEW tool_stats AS
SELECT tool_name, COUNT(*) AS count
FROM tool_uses
GROUP BY tool_name
ORDER BY count DESC;

CREATE OR REPLACE VIEW skill_stats AS
SELECT skill_name, COUNT(*) AS count
FROM skill_uses
GROUP BY skill_name
ORDER BY count DESC;

CREATE OR REPLACE VIEW subagent_stats AS
SELECT subagent_type, COUNT(*) AS count
FROM subagent_uses
GROUP BY subagent_type
ORDER BY count DESC;

CREATE OR REPLACE VIEW project_stats AS
SELECT
    s.project_name,
    s.project_path,
    COUNT(DISTINCT s.session_id)      AS sessions,
    COALESCE(SUM(m.input_tokens), 0)  AS input_tokens,
    COALESCE(SUM(m.output_tokens), 0) AS output_tokens
FROM sessions s
LEFT JOIN messages m ON s.session_id = m.session_id AND m.role = 'assistant'
GROUP BY s.project_name, s.project_path
ORDER BY sessions DESC;

-- ==================== ROW LEVEL SECURITY ====================

ALTER TABLE sessions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_uses     ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_uses    ENABLE ROW LEVEL SECURITY;
ALTER TABLE subagent_uses ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_costs   ENABLE ROW LEVEL SECURITY;

-- anon ロールには SELECT のみ許可（書き込みは service_role のみ = collector.py）
CREATE POLICY "public read sessions"      ON sessions      FOR SELECT USING (true);
CREATE POLICY "public read messages"      ON messages      FOR SELECT USING (true);
CREATE POLICY "public read tool_uses"     ON tool_uses     FOR SELECT USING (true);
CREATE POLICY "public read skill_uses"    ON skill_uses    FOR SELECT USING (true);
CREATE POLICY "public read subagent_uses" ON subagent_uses FOR SELECT USING (true);
CREATE POLICY "public read model_costs"   ON model_costs   FOR SELECT USING (true);

-- ビューへの SELECT 権限を anon に付与
GRANT SELECT ON summary_stats  TO anon;
GRANT SELECT ON daily_stats    TO anon;
GRANT SELECT ON tool_stats     TO anon;
GRANT SELECT ON skill_stats    TO anon;
GRANT SELECT ON subagent_stats TO anon;
GRANT SELECT ON project_stats  TO anon;
