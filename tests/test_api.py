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

    # api.mainのimportはDBパス設定後に行う
    import importlib
    import api.main
    importlib.reload(api.main)
    from api.main import app
    with TestClient(app) as c:
        yield c

    os.environ.pop("CLAUDE_STATS_DB", None)
    import os as _os
    try:
        _os.unlink(tmp_db)
    except Exception:
        pass


def test_get_summary(client):
    resp = client.get("/api/summary")
    assert resp.status_code == 200
    data = resp.json()
    assert "total_sessions" in data
    assert data["total_sessions"] >= 1
    assert "total_input_tokens" in data
    assert "estimated_cost_usd" in data


def test_get_daily(client):
    resp = client.get("/api/daily?days=3650")
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
