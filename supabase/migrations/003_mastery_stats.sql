-- supabase/migrations/003_mastery_stats.sql
-- 多様性ベース集計のための distinct counts を summary_stats に追加
-- (CREATE OR REPLACE は末尾追加のみ可能なため、新規カラムを末尾に)

CREATE OR REPLACE VIEW summary_stats AS
SELECT
    (SELECT COUNT(*) FROM sessions)                                              AS total_sessions,
    (SELECT COUNT(*) FROM tool_uses)                                             AS total_tool_uses,
    (SELECT COUNT(*) FROM skill_uses)                                            AS total_skill_uses,
    (SELECT COUNT(*) FROM subagent_uses)                                         AS total_subagent_uses,
    COALESCE(SUM(m.input_tokens), 0)                                             AS total_input_tokens,
    COALESCE(SUM(m.output_tokens), 0)                                            AS total_output_tokens,
    COALESCE(SUM(m.cache_read_tokens), 0)                                        AS total_cache_read_tokens,
    COALESCE(SUM(m.cache_write_tokens), 0)                                       AS total_cache_write_tokens,
    COALESCE(ROUND(SUM(
        m.input_tokens  * COALESCE(mc.input_cost_per_million,  3.0) +
        m.output_tokens * COALESCE(mc.output_cost_per_million, 15.0)
    ) / 1000000.0, 4), 0)                                                        AS estimated_cost_usd,
    (SELECT COUNT(*) FROM tool_uses WHERE tool_name NOT LIKE 'mcp__%')           AS total_non_mcp_tool_uses,
    (SELECT COUNT(*) FROM tool_uses WHERE tool_name LIKE 'mcp__%')               AS total_mcp_uses,
    (SELECT COUNT(*) FROM messages)                                              AS total_messages,
    -- 002 までの末尾カラムここまで
    -- 003 で追加: 多様性ベース用 distinct counts
    (SELECT COUNT(DISTINCT skill_name)   FROM skill_uses)                        AS distinct_skills,
    (SELECT COUNT(DISTINCT subagent_type) FROM subagent_uses)                    AS distinct_subagent_types,
    (SELECT COUNT(DISTINCT tool_name)    FROM tool_uses WHERE tool_name LIKE 'mcp__%')  AS distinct_mcp_tools,
    (SELECT COUNT(DISTINCT tool_name)    FROM tool_uses WHERE tool_name NOT LIKE 'mcp__%') AS distinct_tools,
    -- D視点用: assistantメッセージ数のみ
    (SELECT COUNT(*) FROM messages WHERE role = 'assistant')                     AS assistant_messages
FROM messages m
JOIN sessions s ON m.session_id = s.session_id
LEFT JOIN model_costs mc ON s.model = mc.model
WHERE m.role = 'assistant';
