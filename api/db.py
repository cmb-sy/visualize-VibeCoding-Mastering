# api/db.py
import sqlite3
import os
from pathlib import Path


def get_db_path() -> str:
    path = os.environ.get("CLAUDE_STATS_DB")
    if path:
        return path
    return str(Path.home() / ".claude" / "stats.db")


def get_conn(db_path: str | None = None) -> sqlite3.Connection:
    path = db_path or get_db_path()
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db(db_path: str | None = None) -> None:
    """DBとテーブルを初期化する。冪等。"""
    conn = get_conn(db_path)
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS sessions (
            session_id   TEXT PRIMARY KEY,
            project_path TEXT,
            project_name TEXT,
            started_at   TEXT,
            ended_at     TEXT,
            git_branch   TEXT,
            model        TEXT,
            collected_at TEXT
        );

        CREATE TABLE IF NOT EXISTS messages (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id          TEXT NOT NULL,
            role                TEXT NOT NULL,
            timestamp           TEXT,
            input_tokens        INTEGER DEFAULT 0,
            output_tokens       INTEGER DEFAULT 0,
            cache_read_tokens   INTEGER DEFAULT 0,
            cache_write_tokens  INTEGER DEFAULT 0,
            FOREIGN KEY (session_id) REFERENCES sessions(session_id)
        );

        CREATE TABLE IF NOT EXISTS tool_uses (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id  TEXT NOT NULL,
            tool_name   TEXT NOT NULL,
            timestamp   TEXT,
            FOREIGN KEY (session_id) REFERENCES sessions(session_id)
        );

        CREATE TABLE IF NOT EXISTS skill_uses (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id  TEXT NOT NULL,
            skill_name  TEXT NOT NULL,
            timestamp   TEXT,
            FOREIGN KEY (session_id) REFERENCES sessions(session_id)
        );

        CREATE TABLE IF NOT EXISTS subagent_uses (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id     TEXT NOT NULL,
            subagent_type  TEXT NOT NULL,
            description    TEXT,
            timestamp      TEXT,
            FOREIGN KEY (session_id) REFERENCES sessions(session_id)
        );

        CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
        CREATE INDEX IF NOT EXISTS idx_tool_uses_session ON tool_uses(session_id);
        CREATE INDEX IF NOT EXISTS idx_skill_uses_session ON skill_uses(session_id);
        CREATE INDEX IF NOT EXISTS idx_subagent_uses_session ON subagent_uses(session_id);
        CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
        CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions(started_at);
    """)
    conn.commit()
    conn.close()
