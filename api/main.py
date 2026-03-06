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
