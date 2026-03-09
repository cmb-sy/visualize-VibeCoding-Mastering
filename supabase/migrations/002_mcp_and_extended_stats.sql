-- supabase/migrations/002_mcp_and_extended_stats.sql

-- ==================== summary_stats 更新 ====================
-- total_mcp_uses / total_messages を追加

CREATE OR REPLACE VIEW summary_stats AS
SELECT
    (SELECT COUNT(*) FROM sessions)                                         AS total_sessions,
    (SELECT COUNT(*) FROM tool_uses)                                        AS total_tool_uses,
    (SELECT COUNT(*) FROM tool_uses WHERE tool_name NOT LIKE 'mcp__%')      AS total_non_mcp_tool_uses,
    (SELECT COUNT(*) FROM tool_uses WHERE tool_name LIKE 'mcp__%')          AS total_mcp_uses,
    (SELECT COUNT(*) FROM skill_uses)                                       AS total_skill_uses,
    (SELECT COUNT(*) FROM subagent_uses)                                    AS total_subagent_uses,
    (SELECT COUNT(*) FROM messages)                                         AS total_messages,
    COALESCE(SUM(m.input_tokens), 0)                                        AS total_input_tokens,
    COALESCE(SUM(m.output_tokens), 0)                                       AS total_output_tokens,
    COALESCE(SUM(m.cache_read_tokens), 0)                                   AS total_cache_read_tokens,
    COALESCE(SUM(m.cache_write_tokens), 0)                                  AS total_cache_write_tokens,
    COALESCE(ROUND(SUM(
        m.input_tokens  * COALESCE(mc.input_cost_per_million,  3.0) +
        m.output_tokens * COALESCE(mc.output_cost_per_million, 15.0)
    ) / 1000000.0, 4), 0)                                                   AS estimated_cost_usd
FROM messages m
JOIN sessions s ON m.session_id = s.session_id
LEFT JOIN model_costs mc ON s.model = mc.model
WHERE m.role = 'assistant';

-- ==================== tool_stats 更新 (MCP除外) ====================

CREATE OR REPLACE VIEW tool_stats AS
SELECT tool_name, COUNT(*) AS count
FROM tool_uses
WHERE tool_name NOT LIKE 'mcp__%'
GROUP BY tool_name
ORDER BY count DESC;

-- ==================== mcp_stats 新規追加 ====================

CREATE OR REPLACE VIEW mcp_stats AS
SELECT tool_name, COUNT(*) AS count
FROM tool_uses
WHERE tool_name LIKE 'mcp__%'
GROUP BY tool_name
ORDER BY count DESC;

-- ==================== daily_stats 更新 (mcp/skill/subagent/messages追加) ====================

CREATE OR REPLACE VIEW daily_stats AS
WITH daily_messages AS (
    SELECT
        (m.timestamp AT TIME ZONE 'UTC')::date                                 AS date,
        SUM(m.input_tokens)                                                     AS input_tokens,
        SUM(m.output_tokens)                                                    AS output_tokens,
        SUM(m.cache_read_tokens)                                                AS cache_read_tokens,
        COUNT(DISTINCT m.session_id)                                            AS sessions,
        ROUND(SUM(
            m.input_tokens  * COALESCE(mc.input_cost_per_million,  3.0) +
            m.output_tokens * COALESCE(mc.output_cost_per_million, 15.0)
        ) / 1000000.0, 4)                                                       AS estimated_cost_usd
    FROM messages m
    JOIN sessions s ON m.session_id = s.session_id
    LEFT JOIN model_costs mc ON s.model = mc.model
    WHERE m.role = 'assistant'
    GROUP BY 1
),
daily_total_messages AS (
    SELECT
        (timestamp AT TIME ZONE 'UTC')::date AS date,
        COUNT(*)                              AS messages
    FROM messages
    GROUP BY 1
),
daily_tools AS (
    SELECT
        (timestamp AT TIME ZONE 'UTC')::date                                   AS date,
        COUNT(*) FILTER (WHERE tool_name LIKE 'mcp__%')                        AS mcp_uses,
        COUNT(*) FILTER (WHERE tool_name NOT LIKE 'mcp__%')                    AS tool_uses
    FROM tool_uses
    GROUP BY 1
),
daily_skills AS (
    SELECT
        (timestamp AT TIME ZONE 'UTC')::date AS date,
        COUNT(*)                              AS skill_uses
    FROM skill_uses
    GROUP BY 1
),
daily_subagents AS (
    SELECT
        (timestamp AT TIME ZONE 'UTC')::date AS date,
        COUNT(*)                              AS subagent_uses
    FROM subagent_uses
    GROUP BY 1
)
SELECT
    dm.date,
    dm.input_tokens,
    dm.output_tokens,
    dm.cache_read_tokens,
    dm.sessions,
    dm.estimated_cost_usd,
    COALESCE(dtm.messages,    0)  AS messages,
    COALESCE(dt.mcp_uses,     0)  AS mcp_uses,
    COALESCE(dt.tool_uses,    0)  AS tool_uses,
    COALESCE(ds.skill_uses,   0)  AS skill_uses,
    COALESCE(dsa.subagent_uses, 0) AS subagent_uses
FROM daily_messages dm
LEFT JOIN daily_total_messages dtm ON dm.date = dtm.date
LEFT JOIN daily_tools dt   ON dm.date = dt.date
LEFT JOIN daily_skills ds  ON dm.date = ds.date
LEFT JOIN daily_subagents dsa ON dm.date = dsa.date
ORDER BY dm.date;

-- ==================== 権限付与 ====================

GRANT SELECT ON mcp_stats TO anon;
