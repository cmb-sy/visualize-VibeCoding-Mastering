# tests/test_collector.py
import os
import sys
import sqlite3
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from api.db import init_db
from collector import collect_session

FIXTURE = os.path.join(os.path.dirname(__file__), "fixtures", "sample_session.jsonl")


def make_temp_db():
    f = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    f.close()
    init_db(f.name)
    return f.name


def test_collect_session_inserts_session():
    db = make_temp_db()
    try:
        collect_session(FIXTURE, db)
        conn = sqlite3.connect(db)
        row = conn.execute("SELECT * FROM sessions WHERE session_id='test-session-001'").fetchone()
        conn.close()
        assert row is not None
        assert row[2] == "my-project"  # project_name
        assert row[6] == "claude-sonnet-4-6"  # model
    finally:
        os.unlink(db)


def test_collect_session_inserts_messages():
    db = make_temp_db()
    try:
        collect_session(FIXTURE, db)
        conn = sqlite3.connect(db)
        rows = conn.execute("SELECT * FROM messages WHERE session_id='test-session-001'").fetchall()
        conn.close()
        assistant_msgs = [r for r in rows if r[2] == "assistant"]
        assert len(assistant_msgs) == 2
        tokens = {(r[4], r[5]) for r in assistant_msgs}
        assert (100, 50) in tokens
    finally:
        os.unlink(db)


def test_collect_session_inserts_tool_uses():
    db = make_temp_db()
    try:
        collect_session(FIXTURE, db)
        conn = sqlite3.connect(db)
        rows = conn.execute("SELECT tool_name FROM tool_uses WHERE session_id='test-session-001'").fetchall()
        conn.close()
        tool_names = [r[0] for r in rows]
        assert "Bash" in tool_names
    finally:
        os.unlink(db)


def test_collect_session_inserts_skill_uses():
    db = make_temp_db()
    try:
        collect_session(FIXTURE, db)
        conn = sqlite3.connect(db)
        rows = conn.execute("SELECT skill_name FROM skill_uses WHERE session_id='test-session-001'").fetchall()
        conn.close()
        assert len(rows) == 1
        assert rows[0][0] == "brainstorming"
    finally:
        os.unlink(db)


def test_collect_session_inserts_subagent_uses():
    db = make_temp_db()
    try:
        collect_session(FIXTURE, db)
        conn = sqlite3.connect(db)
        rows = conn.execute("SELECT subagent_type FROM subagent_uses WHERE session_id='test-session-001'").fetchall()
        conn.close()
        assert len(rows) == 1
        assert rows[0][0] == "Explore"
    finally:
        os.unlink(db)


def test_collect_session_is_idempotent():
    """同じセッションを2回収集しても重複しない"""
    db = make_temp_db()
    try:
        collect_session(FIXTURE, db)
        collect_session(FIXTURE, db)
        conn = sqlite3.connect(db)
        count = conn.execute("SELECT COUNT(*) FROM sessions WHERE session_id='test-session-001'").fetchone()[0]
        tool_count = conn.execute("SELECT COUNT(*) FROM tool_uses WHERE session_id='test-session-001'").fetchone()[0]
        conn.close()
        assert count == 1
        assert tool_count == 2  # Bash + Task
    finally:
        os.unlink(db)
