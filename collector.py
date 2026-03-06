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
            if not model:
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
