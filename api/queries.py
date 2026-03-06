# api/queries.py
"""SQLiteへのクエリをまとめたモジュール。"""
import sqlite3
from typing import Any

# モデル別のコスト (USD per 1M tokens)
TOKEN_COSTS: dict[str, dict[str, float]] = {
    "claude-opus-4-6":           {"input": 15.0,  "output": 75.0},
    "claude-sonnet-4-6":         {"input": 3.0,   "output": 15.0},
    "claude-sonnet-4-20250514":  {"input": 3.0,   "output": 15.0},
    "claude-haiku-4-5":          {"input": 0.8,   "output": 4.0},
    "claude-haiku-4-5-20251001": {"input": 0.8,   "output": 4.0},
}
DEFAULT_COST = {"input": 3.0, "output": 15.0}


def _cost(model: str, input_tokens: int, output_tokens: int) -> float:
    c = TOKEN_COSTS.get(model, DEFAULT_COST)
    return (input_tokens * c["input"] + output_tokens * c["output"]) / 1_000_000


def get_summary(conn: sqlite3.Connection) -> dict[str, Any]:
    total_sessions = conn.execute("SELECT COUNT(*) FROM sessions").fetchone()[0]
    row = conn.execute("""
        SELECT
            COALESCE(SUM(input_tokens), 0),
            COALESCE(SUM(output_tokens), 0),
            COALESCE(SUM(cache_read_tokens), 0),
            COALESCE(SUM(cache_write_tokens), 0)
        FROM messages WHERE role='assistant'
    """).fetchone()
    input_tokens, output_tokens, cache_read, cache_write = row

    cost_rows = conn.execute("""
        SELECT s.model, SUM(m.input_tokens), SUM(m.output_tokens)
        FROM messages m
        JOIN sessions s ON m.session_id = s.session_id
        WHERE m.role='assistant'
        GROUP BY s.model
    """).fetchall()
    total_cost = sum(_cost(r[0] or "", r[1] or 0, r[2] or 0) for r in cost_rows)

    total_tools = conn.execute("SELECT COUNT(*) FROM tool_uses").fetchone()[0]
    total_skills = conn.execute("SELECT COUNT(*) FROM skill_uses").fetchone()[0]
    total_subagents = conn.execute("SELECT COUNT(*) FROM subagent_uses").fetchone()[0]

    return {
        "total_sessions": total_sessions,
        "total_input_tokens": input_tokens,
        "total_output_tokens": output_tokens,
        "total_cache_read_tokens": cache_read,
        "total_cache_write_tokens": cache_write,
        "estimated_cost_usd": round(total_cost, 4),
        "total_tool_uses": total_tools,
        "total_skill_uses": total_skills,
        "total_subagent_uses": total_subagents,
    }


def get_daily(conn: sqlite3.Connection, days: int = 3650) -> list[dict]:
    rows = conn.execute("""
        SELECT
            DATE(m.timestamp) as date,
            SUM(m.input_tokens) as input_tokens,
            SUM(m.output_tokens) as output_tokens,
            SUM(m.cache_read_tokens) as cache_read,
            COUNT(DISTINCT m.session_id) as sessions
        FROM messages m
        WHERE m.role='assistant'
          AND m.timestamp >= DATE('now', ? || ' days')
        GROUP BY DATE(m.timestamp)
        ORDER BY date
    """, (f"-{days}",)).fetchall()

    result = []
    for row in rows:
        date, inp, out, cache, sessions = row
        cost_rows = conn.execute("""
            SELECT s.model, SUM(m.input_tokens), SUM(m.output_tokens)
            FROM messages m
            JOIN sessions s ON m.session_id = s.session_id
            WHERE m.role='assistant' AND DATE(m.timestamp)=?
            GROUP BY s.model
        """, (date,)).fetchall()
        cost = sum(_cost(r[0] or "", r[1] or 0, r[2] or 0) for r in cost_rows)
        result.append({
            "date": date,
            "input_tokens": inp or 0,
            "output_tokens": out or 0,
            "cache_read_tokens": cache or 0,
            "sessions": sessions or 0,
            "estimated_cost_usd": round(cost, 4),
        })
    return result


def get_tools(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute("""
        SELECT tool_name, COUNT(*) as count
        FROM tool_uses
        GROUP BY tool_name
        ORDER BY count DESC
    """).fetchall()
    return [{"tool_name": r[0], "count": r[1]} for r in rows]


def get_skills(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute("""
        SELECT skill_name, COUNT(*) as count
        FROM skill_uses
        GROUP BY skill_name
        ORDER BY count DESC
    """).fetchall()
    return [{"skill_name": r[0], "count": r[1]} for r in rows]


def get_subagents(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute("""
        SELECT subagent_type, COUNT(*) as count
        FROM subagent_uses
        GROUP BY subagent_type
        ORDER BY count DESC
    """).fetchall()
    return [{"subagent_type": r[0], "count": r[1]} for r in rows]


def get_projects(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute("""
        SELECT
            s.project_name,
            s.project_path,
            COUNT(DISTINCT s.session_id) as sessions,
            COALESCE(SUM(m.input_tokens), 0) as input_tokens,
            COALESCE(SUM(m.output_tokens), 0) as output_tokens
        FROM sessions s
        LEFT JOIN messages m ON s.session_id = m.session_id AND m.role='assistant'
        GROUP BY s.project_name, s.project_path
        ORDER BY sessions DESC
    """).fetchall()
    return [
        {
            "project_name": r[0],
            "project_path": r[1],
            "sessions": r[2],
            "input_tokens": r[3],
            "output_tokens": r[4],
        }
        for r in rows
    ]
