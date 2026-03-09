-- supabase/migrations/004_efficiency_stats.sql

-- ==================== session_stats ====================
-- セッション毎: 効率スコア / cache hit率 / コンテキスト膨張率 / /clear推定回数

CREATE OR REPLACE VIEW session_stats AS
WITH code_edits AS (
    SELECT session_id, COUNT(*) AS code_edits
    FROM tool_uses
    WHERE tool_name IN ('Edit', 'Write', 'MultiEdit', 'NotebookEdit')
    GROUP BY session_id
),
user_turns AS (
    SELECT session_id, COUNT(*) AS user_turns
    FROM messages
    WHERE role = 'user'
    GROUP BY session_id
),
token_agg AS (
    SELECT
        m.session_id,
        SUM(m.input_tokens)       AS total_input_tokens,
        SUM(m.output_tokens)      AS total_output_tokens,
        SUM(m.cache_read_tokens)  AS total_cache_read,
        ROUND(SUM(
            m.input_tokens  * COALESCE(mc.input_cost_per_million,  3.0) +
            m.output_tokens * COALESCE(mc.output_cost_per_million, 15.0)
        ) / 1000000.0, 4)         AS estimated_cost_usd
    FROM messages m
    JOIN sessions s ON m.session_id = s.session_id
    LEFT JOIN model_costs mc ON s.model = mc.model
    WHERE m.role = 'assistant'
    GROUP BY m.session_id
),
context_growth AS (
    SELECT
        session_id,
        CASE
            WHEN first_tokens = 0 THEN 1.0
            ELSE ROUND(max_tokens::numeric / first_tokens, 2)
        END AS context_growth_factor
    FROM (
        SELECT
            session_id,
            FIRST_VALUE(input_tokens) OVER (PARTITION BY session_id ORDER BY timestamp) AS first_tokens,
            MAX(input_tokens)         OVER (PARTITION BY session_id)                    AS max_tokens,
            ROW_NUMBER()              OVER (PARTITION BY session_id ORDER BY timestamp) AS rn
        FROM messages
        WHERE role = 'assistant' AND input_tokens > 0
    ) t
    WHERE rn = 1
),
clear_events AS (
    SELECT session_id, COUNT(*) AS clear_count
    FROM (
        SELECT
            session_id,
            input_tokens,
            LAG(input_tokens) OVER (PARTITION BY session_id ORDER BY timestamp) AS prev_tokens
        FROM messages
        WHERE role = 'assistant' AND input_tokens > 0
    ) t
    WHERE prev_tokens IS NOT NULL AND input_tokens < prev_tokens * 0.5
    GROUP BY session_id
)
SELECT
    s.session_id,
    s.project_name,
    s.started_at,
    ROUND(EXTRACT(EPOCH FROM (s.ended_at - s.started_at)) / 60.0, 1) AS duration_minutes,
    COALESCE(ut.user_turns,  0) AS user_turns,
    COALESCE(ce.code_edits,  0) AS code_edits,
    CASE
        WHEN COALESCE(ut.user_turns, 0) = 0 THEN 0
        ELSE ROUND(COALESCE(ce.code_edits, 0)::numeric / ut.user_turns, 2)
    END AS efficiency_score,
    COALESCE(ta.total_input_tokens,  0) AS total_input_tokens,
    COALESCE(ta.total_output_tokens, 0) AS total_output_tokens,
    COALESCE(ta.total_cache_read,    0) AS total_cache_read,
    CASE
        WHEN COALESCE(ta.total_input_tokens + ta.total_cache_read, 0) = 0 THEN 0
        ELSE ROUND(
            ta.total_cache_read::numeric /
            (ta.total_input_tokens + ta.total_cache_read) * 100, 1
        )
    END AS cache_hit_rate,
    COALESCE(cg.context_growth_factor, 1.0) AS context_growth_factor,
    COALESCE(clr.clear_count, 0)            AS clear_count,
    COALESCE(ta.estimated_cost_usd,  0)     AS estimated_cost_usd
FROM sessions s
LEFT JOIN user_turns  ut  ON s.session_id = ut.session_id
LEFT JOIN code_edits  ce  ON s.session_id = ce.session_id
LEFT JOIN token_agg   ta  ON s.session_id = ta.session_id
LEFT JOIN context_growth cg  ON s.session_id = cg.session_id
LEFT JOIN clear_events   clr ON s.session_id = clr.session_id;

-- ==================== weekly_efficiency ====================
-- 週毎: 効率スコア中央値 / cache hit率平均 / context膨張率平均

CREATE OR REPLACE VIEW weekly_efficiency AS
SELECT
    DATE_TRUNC('week', started_at AT TIME ZONE 'UTC')::date  AS week,
    COUNT(*)                                                   AS sessions,
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (
        ORDER BY efficiency_score
    )::numeric, 2)                                             AS median_efficiency,
    ROUND(AVG(efficiency_score)::numeric,     2)              AS avg_efficiency,
    ROUND(AVG(cache_hit_rate)::numeric,       1)              AS avg_cache_hit_rate,
    ROUND(AVG(context_growth_factor)::numeric, 2)             AS avg_context_growth,
    SUM(code_edits)                                           AS total_code_edits,
    SUM(user_turns)                                           AS total_user_turns
FROM session_stats
GROUP BY 1
ORDER BY 1;

-- ==================== 権限付与 ====================

GRANT SELECT ON session_stats    TO anon;
GRANT SELECT ON weekly_efficiency TO anon;
