# Claude Code Stats Dashboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Claude Codeのトランスクリプト（JSONL）を解析してSQLiteに保存し、FastAPI + Reactでブラウザ上に可視化ダッシュボードを構築する。

**Architecture:** Stopフック → collector.py（JSONL解析 → SQLite書き込み） → FastAPI REST API → React（Recharts）ダッシュボード（http://localhost:8765）

**Tech Stack:** Python 3.9 + uv, FastAPI, SQLite3, React 18 + Vite + TypeScript, Recharts, Tailwind CSS

---

## Task 1: プロジェクト初期化

**Files:**
- Create: `/Users/snakashima/develop/other/visualize-VibeCoding-Mastering/pyproject.toml`
- Create: `/Users/snakashima/develop/other/visualize-VibeCoding-Mastering/.gitignore`
- Create: `/Users/snakashima/develop/other/visualize-VibeCoding-Mastering/Makefile`

**Step 1: git init**

```bash
cd /Users/snakashima/develop/other/visualize-VibeCoding-Mastering
git init
```

**Step 2: uv プロジェクト初期化**

```bash
uv init --no-workspace
```

**Step 3: Python依存関係を追加**

```bash
uv add fastapi "uvicorn[standard]"
uv add --dev pytest pytest-asyncio httpx
```

**Step 4: .gitignore を作成**

```
__pycache__/
*.py[cod]
.venv/
*.db
frontend/node_modules/
frontend/dist/
.env
```

**Step 5: Makefile を作成**

```makefile
.PHONY: dev api frontend collect test

dev: ## バックエンドとフロントエンドを同時起動
	make -j2 api frontend

api: ## FastAPI サーバー起動 (port 8765)
	uv run uvicorn api.main:app --host 0.0.0.0 --port 8765 --reload

frontend: ## Vite dev server 起動 (port 5173, API proxy to 8765)
	cd frontend && npm run dev

collect: ## 手動でトランスクリプト全件を再収集
	uv run python collector.py --all

test: ## テスト実行
	uv run pytest tests/ -v
```

**Step 6: コミット**

```bash
git add .gitignore Makefile pyproject.toml uv.lock
git commit -m "feat: プロジェクト初期化 (uv + Makefile)"
```

---

## Task 2: SQLiteスキーマ + DB初期化モジュール

**Files:**
- Create: `api/db.py`
- Create: `tests/test_db.py`

**Step 1: テストを書く**

```python
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
```

**Step 2: テスト失敗を確認**

```bash
uv run pytest tests/test_db.py -v
```
Expected: FAIL (ImportError: api.db not found)

**Step 3: `api/__init__.py` と `api/db.py` を実装**

```python
# api/__init__.py
# (空ファイル)
```

```python
# api/db.py
import sqlite3
import os
from pathlib import Path

DEFAULT_DB_PATH = os.path.expanduser("~/.claude/stats.db")


def get_db_path() -> str:
    return os.environ.get("CLAUDE_STATS_DB", DEFAULT_DB_PATH)


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
```

**Step 4: テスト実行**

```bash
uv run pytest tests/test_db.py -v
```
Expected: PASS

**Step 5: コミット**

```bash
git add api/__init__.py api/db.py tests/__init__.py tests/test_db.py
git commit -m "feat: SQLiteスキーマとDB初期化モジュール"
```

---

## Task 3: collector.py の実装

**Files:**
- Create: `collector.py`
- Create: `tests/test_collector.py`
- Create: `tests/fixtures/sample_session.jsonl`

**Step 1: テスト用フィクスチャを作成**

```
tests/fixtures/sample_session.jsonl
```

内容（1行目: summary, 2-4行目: user/assistant交互）:

```jsonl
{"type":"summary","summary":"Test session","leafUuid":"uuid-leaf"}
{"parentUuid":null,"isSidechain":false,"userType":"external","cwd":"/Users/test/my-project","sessionId":"test-session-001","version":"1.0.59","gitBranch":"main","type":"user","message":{"role":"user","content":"hello"},"uuid":"uuid-u1","timestamp":"2026-03-06T10:00:00.000Z"}
{"parentUuid":"uuid-u1","isSidechain":false,"userType":"external","cwd":"/Users/test/my-project","sessionId":"test-session-001","version":"1.0.59","gitBranch":"main","type":"assistant","message":{"id":"msg_001","type":"message","role":"assistant","model":"claude-sonnet-4-6","content":[{"type":"tool_use","id":"tool_001","name":"Bash","input":{"command":"ls"}},{"type":"tool_use","id":"tool_002","name":"Skill","input":{"skill":"brainstorming"}}],"usage":{"input_tokens":100,"output_tokens":50,"cache_creation_input_tokens":200,"cache_read_input_tokens":300}},"requestId":"req_001","uuid":"uuid-a1","timestamp":"2026-03-06T10:00:05.000Z"}
{"parentUuid":"uuid-a1","isSidechain":false,"userType":"external","cwd":"/Users/test/my-project","sessionId":"test-session-001","version":"1.0.59","gitBranch":"main","type":"assistant","message":{"id":"msg_002","type":"message","role":"assistant","model":"claude-sonnet-4-6","content":[{"type":"tool_use","id":"tool_003","name":"Task","input":{"subagent_type":"Explore","description":"explore codebase"}}],"usage":{"input_tokens":50,"output_tokens":20,"cache_creation_input_tokens":0,"cache_read_input_tokens":400}},"requestId":"req_002","uuid":"uuid-a2","timestamp":"2026-03-06T10:00:10.000Z"}
```

**Step 2: テストを書く**

```python
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
        # assistantメッセージ2件
        assistant_msgs = [r for r in rows if r[2] == "assistant"]
        assert len(assistant_msgs) == 2
        # 1件目: input_tokens=100, output_tokens=50
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
        # tool_uses は重複挿入されない
        assert tool_count == len(["Bash", "Task"])  # Skill toolはスキル扱い
    finally:
        os.unlink(db)
```

**Step 3: テスト失敗を確認**

```bash
uv run pytest tests/test_collector.py -v
```
Expected: FAIL (ImportError: collector not found)

**Step 4: collector.py を実装**

```python
# collector.py
"""
Claude Codeトランスクリプト（JSONL）を解析してSQLiteに保存する。

Usage:
  # Stopフックから（stdinでJSON受信）
  python3 collector.py

  # 全セッションを再収集
  python3 collector.py --all
"""
import json
import os
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

from api.db import get_db_path, init_db, get_conn

# Skill toolの呼び出しはskill_usesに記録するため、tool_usesから除外
SKILL_TOOL_NAME = "Skill"
TASK_TOOL_NAME = "Task"


def collect_session(jsonl_path: str, db_path: str | None = None) -> None:
    """1セッション分のJSONLを解析してDBに書き込む（冪等）。"""
    path = Path(jsonl_path)
    if not path.exists():
        print(f"[collector] file not found: {jsonl_path}", file=sys.stderr)
        return

    lines = path.read_text(encoding="utf-8").splitlines()

    session_id = None
    project_path = None
    project_name = None
    started_at = None
    ended_at = None
    git_branch = None
    model = None

    messages_to_insert = []
    tool_uses_to_insert = []
    skill_uses_to_insert = []
    subagent_uses_to_insert = []

    for raw in lines:
        raw = raw.strip()
        if not raw:
            continue
        try:
            entry = json.loads(raw)
        except json.JSONDecodeError:
            continue

        entry_type = entry.get("type")
        if entry_type == "summary":
            continue

        # セッションメタデータを最初のユーザー/アシスタント行から取得
        if session_id is None and entry_type in ("user", "assistant"):
            session_id = entry.get("sessionId")
            project_path = entry.get("cwd", "")
            project_name = Path(project_path).name if project_path else ""
            git_branch = entry.get("gitBranch", "")

        ts = entry.get("timestamp", "")
        if ts:
            if started_at is None:
                started_at = ts
            ended_at = ts

        if entry_type == "assistant":
            msg = entry.get("message", {})
            usage = msg.get("usage", {})
            if model is None:
                model = msg.get("model", "")
            elif not model:
                model = msg.get("model", "")

            messages_to_insert.append((
                session_id,
                "assistant",
                ts,
                usage.get("input_tokens", 0),
                usage.get("output_tokens", 0),
                usage.get("cache_read_input_tokens", 0),
                usage.get("cache_creation_input_tokens", 0),
            ))

            content = msg.get("content", [])
            for block in content:
                if not isinstance(block, dict):
                    continue
                if block.get("type") != "tool_use":
                    continue
                tool_name = block.get("name", "")
                tool_input = block.get("input", {})

                if tool_name == SKILL_TOOL_NAME:
                    skill_name = tool_input.get("skill", tool_input.get("args", ""))
                    if skill_name:
                        skill_uses_to_insert.append((session_id, str(skill_name), ts))
                elif tool_name == TASK_TOOL_NAME:
                    subagent_type = tool_input.get("subagent_type", "unknown")
                    description = tool_input.get("description", "")
                    subagent_uses_to_insert.append((session_id, subagent_type, description, ts))
                    tool_uses_to_insert.append((session_id, tool_name, ts))
                else:
                    tool_uses_to_insert.append((session_id, tool_name, ts))

        elif entry_type == "user":
            messages_to_insert.append((
                session_id,
                "user",
                ts,
                0, 0, 0, 0,
            ))

    if session_id is None:
        print("[collector] no session_id found, skipping", file=sys.stderr)
        return

    conn = get_conn(db_path)
    collected_at = datetime.now(timezone.utc).isoformat()

    # セッションをUPSERT（再収集時に上書き）
    conn.execute("""
        INSERT OR REPLACE INTO sessions
            (session_id, project_path, project_name, started_at, ended_at, git_branch, model, collected_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (session_id, project_path, project_name, started_at, ended_at, git_branch, model, collected_at))

    # 既存の詳細データを削除して再挿入（冪等性確保）
    for table in ("messages", "tool_uses", "skill_uses", "subagent_uses"):
        conn.execute(f"DELETE FROM {table} WHERE session_id = ?", (session_id,))

    conn.executemany(
        "INSERT INTO messages (session_id, role, timestamp, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens) VALUES (?,?,?,?,?,?,?)",
        messages_to_insert,
    )
    conn.executemany(
        "INSERT INTO tool_uses (session_id, tool_name, timestamp) VALUES (?,?,?)",
        tool_uses_to_insert,
    )
    conn.executemany(
        "INSERT INTO skill_uses (session_id, skill_name, timestamp) VALUES (?,?,?)",
        skill_uses_to_insert,
    )
    conn.executemany(
        "INSERT INTO subagent_uses (session_id, subagent_type, description, timestamp) VALUES (?,?,?,?)",
        subagent_uses_to_insert,
    )
    conn.commit()
    conn.close()


def collect_all() -> None:
    """~/.claude/projects/ 以下の全セッションを再収集する。"""
    db_path = get_db_path()
    init_db(db_path)
    projects_dir = Path.home() / ".claude" / "projects"
    if not projects_dir.exists():
        print("[collector] projects dir not found", file=sys.stderr)
        return

    count = 0
    for jsonl_file in projects_dir.rglob("*.jsonl"):
        collect_session(str(jsonl_file), db_path)
        count += 1

    print(f"[collector] collected {count} sessions -> {db_path}")


def collect_from_hook() -> None:
    """Stopフック用: stdinからJSON受信してセッションを収集する。"""
    try:
        hook_input = json.loads(sys.stdin.read())
    except (json.JSONDecodeError, EOFError):
        print("[collector] invalid hook input", file=sys.stderr)
        sys.exit(0)

    transcript_path = hook_input.get("transcript_path", "")
    if not transcript_path:
        print("[collector] no transcript_path in hook input", file=sys.stderr)
        sys.exit(0)

    db_path = get_db_path()
    init_db(db_path)
    collect_session(transcript_path, db_path)


if __name__ == "__main__":
    if "--all" in sys.argv:
        collect_all()
    else:
        collect_from_hook()
```

**Step 5: テスト実行**

```bash
uv run pytest tests/test_collector.py -v
```
Expected: 全テストPASS

**Step 6: コミット**

```bash
git add collector.py tests/test_collector.py tests/fixtures/
git commit -m "feat: トランスクリプト解析・SQLite書き込みのcollector実装"
```

---

## Task 4: FastAPI バックエンド

**Files:**
- Create: `api/main.py`
- Create: `api/queries.py`
- Create: `tests/test_api.py`

**Step 1: テストを書く**

```python
# tests/test_api.py
import os
import sys
import tempfile
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from api.db import init_db
from collector import collect_session

FIXTURE = os.path.join(os.path.dirname(__file__), "fixtures", "sample_session.jsonl")


@pytest.fixture
def client():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        tmp_db = f.name
    os.environ["CLAUDE_STATS_DB"] = tmp_db
    init_db(tmp_db)
    collect_session(FIXTURE, tmp_db)

    from api.main import app
    with TestClient(app) as c:
        yield c

    os.environ.pop("CLAUDE_STATS_DB", None)
    os.unlink(tmp_db)


def test_get_summary(client):
    resp = client.get("/api/summary")
    assert resp.status_code == 200
    data = resp.json()
    assert "total_sessions" in data
    assert data["total_sessions"] >= 1
    assert "total_input_tokens" in data
    assert "estimated_cost_usd" in data


def test_get_daily(client):
    resp = client.get("/api/daily")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    assert "date" in data[0]
    assert "input_tokens" in data[0]


def test_get_tools(client):
    resp = client.get("/api/tools")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert any(item["tool_name"] == "Bash" for item in data)


def test_get_skills(client):
    resp = client.get("/api/skills")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert any(item["skill_name"] == "brainstorming" for item in data)


def test_get_subagents(client):
    resp = client.get("/api/subagents")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert any(item["subagent_type"] == "Explore" for item in data)


def test_get_projects(client):
    resp = client.get("/api/projects")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert any(item["project_name"] == "my-project" for item in data)
```

**Step 2: テスト失敗を確認**

```bash
uv run pytest tests/test_api.py -v
```
Expected: FAIL (ImportError)

**Step 3: `api/queries.py` を実装**

```python
# api/queries.py
"""SQLiteへのクエリをまとめたモジュール。"""
import sqlite3
from typing import Any

# モデル別のコスト (USD per 1M tokens)
TOKEN_COSTS: dict[str, dict[str, float]] = {
    "claude-opus-4-6":          {"input": 15.0,  "output": 75.0},
    "claude-sonnet-4-6":        {"input": 3.0,   "output": 15.0},
    "claude-sonnet-4-20250514": {"input": 3.0,   "output": 15.0},
    "claude-haiku-4-5":         {"input": 0.8,   "output": 4.0},
    "claude-haiku-4-5-20251001":{"input": 0.8,   "output": 4.0},
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

    # コストはモデル別に計算
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


def get_daily(conn: sqlite3.Connection, days: int = 90) -> list[dict]:
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
```

**Step 4: `api/main.py` を実装**

```python
# api/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.db import get_conn
from api import queries

app = FastAPI(title="Claude Stats API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:8765"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/api/summary")
def summary():
    conn = get_conn()
    result = queries.get_summary(conn)
    conn.close()
    return result


@app.get("/api/daily")
def daily(days: int = 90):
    conn = get_conn()
    result = queries.get_daily(conn, days)
    conn.close()
    return result


@app.get("/api/tools")
def tools():
    conn = get_conn()
    result = queries.get_tools(conn)
    conn.close()
    return result


@app.get("/api/skills")
def skills():
    conn = get_conn()
    result = queries.get_skills(conn)
    conn.close()
    return result


@app.get("/api/subagents")
def subagents():
    conn = get_conn()
    result = queries.get_subagents(conn)
    conn.close()
    return result


@app.get("/api/projects")
def projects():
    conn = get_conn()
    result = queries.get_projects(conn)
    conn.close()
    return result
```

**Step 5: テスト実行**

```bash
uv run pytest tests/test_api.py -v
```
Expected: 全テストPASS

**Step 6: コミット**

```bash
git add api/main.py api/queries.py tests/test_api.py
git commit -m "feat: FastAPI バックエンド実装（6エンドポイント）"
```

---

## Task 5: React フロントエンド セットアップ

**Files:**
- Create: `frontend/` (Vite + React + TypeScript)

**Step 1: Viteプロジェクト作成**

```bash
cd /Users/snakashima/develop/other/visualize-VibeCoding-Mastering
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
```

**Step 2: Recharts と Tailwind をインストール**

```bash
cd frontend
npm install recharts
npm install -D tailwindcss @tailwindcss/vite
```

**Step 3: `frontend/vite.config.ts` を設定（APIプロキシ）**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:8765',
    },
  },
})
```

**Step 4: `frontend/src/index.css` を Tailwind 用に置き換え**

```css
@import "tailwindcss";
```

**Step 5: 起動確認**

```bash
cd frontend && npm run dev &
# ブラウザで http://localhost:5173 が開くことを確認
```

**Step 6: コミット**

```bash
cd /Users/snakashima/develop/other/visualize-VibeCoding-Mastering
git add frontend/
git commit -m "feat: React + Vite + TypeScript + Recharts + Tailwindセットアップ"
```

---

## Task 6: APIクライアントとページ共通コンポーネント

**Files:**
- Create: `frontend/src/api.ts`
- Create: `frontend/src/components/StatCard.tsx`
- Create: `frontend/src/components/PageHeader.tsx`
- Create: `frontend/src/App.tsx` (ルーティング)

**Step 1: APIクライアント**

```typescript
// frontend/src/api.ts
export interface Summary {
  total_sessions: number
  total_input_tokens: number
  total_output_tokens: number
  total_cache_read_tokens: number
  total_cache_write_tokens: number
  estimated_cost_usd: number
  total_tool_uses: number
  total_skill_uses: number
  total_subagent_uses: number
}

export interface DailyEntry {
  date: string
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  sessions: number
  estimated_cost_usd: number
}

export interface ToolEntry { tool_name: string; count: number }
export interface SkillEntry { skill_name: string; count: number }
export interface SubagentEntry { subagent_type: string; count: number }
export interface ProjectEntry {
  project_name: string
  project_path: string
  sessions: number
  input_tokens: number
  output_tokens: number
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export const api = {
  summary: () => get<Summary>('/api/summary'),
  daily: (days = 90) => get<DailyEntry[]>(`/api/daily?days=${days}`),
  tools: () => get<ToolEntry[]>('/api/tools'),
  skills: () => get<SkillEntry[]>('/api/skills'),
  subagents: () => get<SubagentEntry[]>('/api/subagents'),
  projects: () => get<ProjectEntry[]>('/api/projects'),
}
```

**Step 2: StatCard コンポーネント**

```tsx
// frontend/src/components/StatCard.tsx
interface Props {
  title: string
  value: string | number
  sub?: string
}

export function StatCard({ title, value, sub }: Props) {
  return (
    <div className="bg-white rounded-xl shadow p-5 flex flex-col gap-1">
      <span className="text-sm text-gray-500">{title}</span>
      <span className="text-2xl font-bold text-gray-900">{value}</span>
      {sub && <span className="text-xs text-gray-400">{sub}</span>}
    </div>
  )
}
```

**Step 3: App.tsx にルーティングを設定**

```tsx
// frontend/src/App.tsx
import { useState } from 'react'
import { DashboardPage } from './pages/DashboardPage'
import { ToolsPage } from './pages/ToolsPage'
import { SkillsPage } from './pages/SkillsPage'
import { ProjectsPage } from './pages/ProjectsPage'

const TABS = [
  { id: 'dashboard', label: 'Overview' },
  { id: 'tools', label: 'Tools' },
  { id: 'skills', label: 'Skills & Agents' },
  { id: 'projects', label: 'Projects' },
]

export default function App() {
  const [tab, setTab] = useState('dashboard')

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center gap-8">
          <h1 className="text-lg font-semibold text-gray-900">Claude Stats</h1>
          <nav className="flex gap-1">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  tab === t.id
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-6 py-8">
        {tab === 'dashboard' && <DashboardPage />}
        {tab === 'tools' && <ToolsPage />}
        {tab === 'skills' && <SkillsPage />}
        {tab === 'projects' && <ProjectsPage />}
      </main>
    </div>
  )
}
```

**Step 4: コミット**

```bash
git add frontend/src/api.ts frontend/src/components/ frontend/src/App.tsx
git commit -m "feat: APIクライアントと共通コンポーネント"
```

---

## Task 7: Dashboard ページ（Overview）

**Files:**
- Create: `frontend/src/pages/DashboardPage.tsx`

```tsx
// frontend/src/pages/DashboardPage.tsx
import { useEffect, useState } from 'react'
import { api, type Summary, type DailyEntry } from '../api'
import { StatCard } from '../components/StatCard'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

export function DashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [daily, setDaily] = useState<DailyEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([api.summary(), api.daily(90)]).then(([s, d]) => {
      setSummary(s)
      setDaily(d)
      setLoading(false)
    })
  }, [])

  if (loading) return <div className="text-gray-500">Loading...</div>
  if (!summary) return <div className="text-red-500">Failed to load</div>

  return (
    <div className="flex flex-col gap-8">
      {/* サマリーカード */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Total Sessions" value={summary.total_sessions} />
        <StatCard
          title="Estimated Cost"
          value={`$${summary.estimated_cost_usd.toFixed(2)}`}
          sub="USD"
        />
        <StatCard
          title="Total Tokens"
          value={fmtTokens(summary.total_input_tokens + summary.total_output_tokens)}
          sub={`${fmtTokens(summary.total_input_tokens)} in / ${fmtTokens(summary.total_output_tokens)} out`}
        />
        <StatCard
          title="Tool / Skill / Agent"
          value={`${summary.total_tool_uses} / ${summary.total_skill_uses} / ${summary.total_subagent_uses}`}
          sub="uses"
        />
      </div>

      {/* 日別コスト折れ線グラフ */}
      <div className="bg-white rounded-xl shadow p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Daily Cost (USD) – last 90 days</h2>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={daily} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={d => d.slice(5)} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${v.toFixed(3)}`} />
            <Tooltip formatter={(v: number) => [`$${v.toFixed(4)}`, 'Cost']} />
            <Line type="monotone" dataKey="estimated_cost_usd" stroke="#6366f1" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 日別セッション数グラフ */}
      <div className="bg-white rounded-xl shadow p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Daily Sessions – last 90 days</h2>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={daily} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={d => d.slice(5)} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="sessions" stroke="#10b981" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
```

**Step: コミット**

```bash
git add frontend/src/pages/DashboardPage.tsx
git commit -m "feat: Dashboard(Overview)ページ – サマリーカードと日別グラフ"
```

---

## Task 8: Tools ページ

**Files:**
- Create: `frontend/src/pages/ToolsPage.tsx`

```tsx
// frontend/src/pages/ToolsPage.tsx
import { useEffect, useState } from 'react'
import { api, type ToolEntry } from '../api'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'

const COLORS = ['#6366f1','#8b5cf6','#ec4899','#f43f5e','#f97316','#eab308','#22c55e','#14b8a6','#06b6d4','#3b82f6']

export function ToolsPage() {
  const [tools, setTools] = useState<ToolEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.tools().then(d => { setTools(d); setLoading(false) })
  }, [])

  if (loading) return <div className="text-gray-500">Loading...</div>

  return (
    <div className="flex flex-col gap-8">
      <div className="bg-white rounded-xl shadow p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Tool Usage</h2>
        <ResponsiveContainer width="100%" height={Math.max(300, tools.length * 36)}>
          <BarChart data={tools} layout="vertical" margin={{ top: 5, right: 30, left: 60, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11 }} />
            <YAxis dataKey="tool_name" type="category" tick={{ fontSize: 12 }} width={80} />
            <Tooltip />
            <Bar dataKey="count" radius={[0, 4, 4, 0]}>
              {tools.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* テーブル表示 */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">#</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Tool</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Count</th>
            </tr>
          </thead>
          <tbody>
            {tools.map((t, i) => (
              <tr key={t.tool_name} className="border-b last:border-0 hover:bg-gray-50">
                <td className="px-4 py-2 text-gray-400">{i + 1}</td>
                <td className="px-4 py-2 font-mono text-gray-900">{t.tool_name}</td>
                <td className="px-4 py-2 text-right text-gray-900">{t.count.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

**Step: コミット**

```bash
git add frontend/src/pages/ToolsPage.tsx
git commit -m "feat: Toolsページ – 横棒グラフとテーブル"
```

---

## Task 9: Skills & Agents ページ

**Files:**
- Create: `frontend/src/pages/SkillsPage.tsx`

```tsx
// frontend/src/pages/SkillsPage.tsx
import { useEffect, useState } from 'react'
import { api, type SkillEntry, type SubagentEntry } from '../api'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from 'recharts'

const COLORS = ['#6366f1','#8b5cf6','#ec4899','#f43f5e','#f97316','#eab308','#22c55e','#14b8a6','#06b6d4','#3b82f6']

export function SkillsPage() {
  const [skills, setSkills] = useState<SkillEntry[]>([])
  const [subagents, setSubagents] = useState<SubagentEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([api.skills(), api.subagents()]).then(([s, a]) => {
      setSkills(s)
      setSubagents(a)
      setLoading(false)
    })
  }, [])

  if (loading) return <div className="text-gray-500">Loading...</div>

  return (
    <div className="flex flex-col gap-8">
      {/* スキル横棒グラフ */}
      <div className="bg-white rounded-xl shadow p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Skill Usage</h2>
        {skills.length === 0 ? (
          <p className="text-gray-400 text-sm">No skill usage recorded yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(250, skills.length * 32)}>
            <BarChart data={skills} layout="vertical" margin={{ top: 5, right: 30, left: 120, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis dataKey="skill_name" type="category" tick={{ fontSize: 11 }} width={120} />
              <Tooltip />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {skills.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* サブエージェント円グラフ */}
      <div className="bg-white rounded-xl shadow p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Subagent Types</h2>
        {subagents.length === 0 ? (
          <p className="text-gray-400 text-sm">No subagent usage recorded yet.</p>
        ) : (
          <div className="flex gap-8 items-center flex-wrap">
            <ResponsiveContainer width={300} height={300}>
              <PieChart>
                <Pie
                  data={subagents}
                  dataKey="count"
                  nameKey="subagent_type"
                  cx="50%"
                  cy="50%"
                  outerRadius={120}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {subagents.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-col gap-2">
              {subagents.map((s, i) => (
                <div key={s.subagent_type} className="flex items-center gap-2 text-sm">
                  <span className="w-3 h-3 rounded-full inline-block" style={{ background: COLORS[i % COLORS.length] }} />
                  <span className="text-gray-700">{s.subagent_type}</span>
                  <span className="text-gray-400 ml-2">{s.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

**Step: コミット**

```bash
git add frontend/src/pages/SkillsPage.tsx
git commit -m "feat: Skills & Agentsページ – スキルランキングとサブエージェント円グラフ"
```

---

## Task 10: Projects ページ

**Files:**
- Create: `frontend/src/pages/ProjectsPage.tsx`

```tsx
// frontend/src/pages/ProjectsPage.tsx
import { useEffect, useState } from 'react'
import { api, type ProjectEntry } from '../api'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'

const COLORS = ['#6366f1','#8b5cf6','#ec4899','#f43f5e','#f97316','#eab308','#22c55e','#14b8a6','#06b6d4','#3b82f6']

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

export function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.projects().then(d => { setProjects(d); setLoading(false) })
  }, [])

  if (loading) return <div className="text-gray-500">Loading...</div>

  const top10 = projects.slice(0, 10)

  return (
    <div className="flex flex-col gap-8">
      {/* セッション数横棒グラフ */}
      <div className="bg-white rounded-xl shadow p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Sessions by Project (top 10)</h2>
        <ResponsiveContainer width="100%" height={Math.max(250, top10.length * 36)}>
          <BarChart data={top10} layout="vertical" margin={{ top: 5, right: 30, left: 120, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11 }} />
            <YAxis dataKey="project_name" type="category" tick={{ fontSize: 11 }} width={120} />
            <Tooltip />
            <Bar dataKey="sessions" radius={[0, 4, 4, 0]}>
              {top10.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* プロジェクト詳細テーブル */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">#</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Project</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Sessions</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Input Tokens</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Output Tokens</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p, i) => (
              <tr key={p.project_path} className="border-b last:border-0 hover:bg-gray-50">
                <td className="px-4 py-2 text-gray-400">{i + 1}</td>
                <td className="px-4 py-2">
                  <div className="font-medium text-gray-900">{p.project_name}</div>
                  <div className="text-xs text-gray-400 truncate max-w-xs">{p.project_path}</div>
                </td>
                <td className="px-4 py-2 text-right text-gray-900">{p.sessions}</td>
                <td className="px-4 py-2 text-right text-gray-500">{fmtTokens(p.input_tokens)}</td>
                <td className="px-4 py-2 text-right text-gray-500">{fmtTokens(p.output_tokens)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

**Step: コミット**

```bash
git add frontend/src/pages/ProjectsPage.tsx
git commit -m "feat: Projectsページ – セッション数グラフとトークン詳細テーブル"
```

---

## Task 11: Stopフック設定と動作確認

**Files:**
- Modify: `~/.claude/settings.json` (Stopフックを追加)

**Step 1: 既存データを収集**

```bash
cd /Users/snakashima/develop/other/visualize-VibeCoding-Mastering
uv run python collector.py --all
```

Expected:
```
[collector] collected N sessions -> /Users/snakashima/.claude/stats.db
```

**Step 2: `~/.claude/settings.json` の `hooks` に Stop フックを追加**

既存の `hooks` オブジェクト内に以下を追加（`PreToolUse`, `PostToolUse` と同列）:

```json
"Stop": [
  {
    "hooks": [
      {
        "type": "command",
        "command": "python3 /Users/snakashima/develop/other/visualize-VibeCoding-Mastering/collector.py",
        "timeout": 30,
        "async": true
      }
    ]
  }
]
```

**Step 3: APIサーバーとフロントエンドを起動して動作確認**

```bash
cd /Users/snakashima/develop/other/visualize-VibeCoding-Mastering
make dev
```

ブラウザで http://localhost:5173 を開いてダッシュボードが表示されることを確認。

**Step 4: コミット（設定ファイルはコミットしない）**

```bash
git add .
git commit -m "feat: 全機能実装完了 – Claude Stats Dashboard"
```

---

## Task 12: README 作成

**Files:**
- Create: `README.md`

```markdown
# visualize-VibeCoding-Mastering

Claude Codeの利用状況をブラウザで可視化するダッシュボード。

## セットアップ

```bash
# 依存関係インストール
uv sync
cd frontend && npm install && cd ..

# 既存データを収集
make collect

# 起動（API + フロントエンド）
make dev
```

ブラウザで http://localhost:5173 を開く。

## Stopフック設定

`~/.claude/settings.json` の `hooks` に追加:

```json
"Stop": [
  {
    "hooks": [
      {
        "type": "command",
        "command": "python3 /Users/snakashima/develop/other/visualize-VibeCoding-Mastering/collector.py",
        "timeout": 30,
        "async": true
      }
    ]
  }
]
```

以降、Claude Codeのセッション終了時に自動でデータが更新される。

## ダッシュボード

- **Overview**: 累計コスト・トークン数・日別トレンド
- **Tools**: ツール別利用回数
- **Skills & Agents**: スキル・サブエージェント利用状況
- **Projects**: プロジェクト別セッション数・トークン消費
```

**Step: コミット**

```bash
git add README.md
git commit -m "docs: README追加"
```

---

## テスト実行コマンドまとめ

```bash
# 全テスト
uv run pytest tests/ -v

# カテゴリ別
uv run pytest tests/test_db.py -v
uv run pytest tests/test_collector.py -v
uv run pytest tests/test_api.py -v
```
