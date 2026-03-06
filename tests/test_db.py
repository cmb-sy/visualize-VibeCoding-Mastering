# tests/test_db.py
import sqlite3
import tempfile
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from api.db import init_db, get_db_path

def test_init_db_creates_tables():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        tmp_db = f.name
    try:
        init_db(tmp_db)
        conn = sqlite3.connect(tmp_db)
        cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = {row[0] for row in cursor.fetchall()}
        conn.close()
        assert "sessions" in tables
        assert "messages" in tables
        assert "tool_uses" in tables
        assert "skill_uses" in tables
        assert "subagent_uses" in tables
    finally:
        os.unlink(tmp_db)
