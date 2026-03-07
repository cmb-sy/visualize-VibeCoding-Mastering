# Supabase + Vercel 移行 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** SQLite + FastAPI 構成を廃止し、Supabase（PostgreSQL）+ Vercel（React 静的ホスティング）に移行してブラウザから常時アクセスできる状態にする。

**Architecture:** collector.py（ローカル Python）が Supabase にデータを書き込む。フロントエンドは @supabase/supabase-js で Supabase に直接クエリする。FastAPI は廃止。Vercel が React を静的ホスティングする。

**Tech Stack:** Python + supabase-py（collector）、React 19 + TypeScript + @supabase/supabase-js（frontend）、Vercel（hosting）、Supabase PostgreSQL（database）

---

### Task 1: Supabase SQL マイグレーションファイル作成

**Files:**
- Create: `supabase/migrations/001_init.sql`

**Step 1: ディレクトリ作成とファイル書き込み**

```bash
mkdir -p supabase/migrations
```

`supabase/migrations/001_init.sql` を以下の内容で作成:

```sql
-- ==================== TABLES ====================

CREATE TABLE IF NOT EXISTS sessions (
    session_id   TEXT PRIMARY KEY,
    project_path TEXT,
    project_name TEXT,
    started_at   TIMESTAMPTZ,
    ended_at     TIMESTAMPTZ,
    git_branch   TEXT,
    model        TEXT,
    collected_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS messages (
    id                  BIGSERIAL PRIMARY KEY,
    session_id          TEXT NOT NULL REFERENCES sessions(session_id),
    role                TEXT NOT NULL,
    timestamp           TIMESTAMPTZ,
    input_tokens        INTEGER DEFAULT 0,
    output_tokens       INTEGER DEFAULT 0,
    cache_read_tokens   INTEGER DEFAULT 0,
    cache_write_tokens  INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tool_uses (
    id          BIGSERIAL PRIMARY KEY,
    session_id  TEXT NOT NULL REFERENCES sessions(session_id),
    tool_name   TEXT NOT NULL,
    timestamp   TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS skill_uses (
    id          BIGSERIAL PRIMARY KEY,
    session_id  TEXT NOT NULL REFERENCES sessions(session_id),
    skill_name  TEXT NOT NULL,
    timestamp   TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS subagent_uses (
    id             BIGSERIAL PRIMARY KEY,
    session_id     TEXT NOT NULL REFERENCES sessions(session_id),
    subagent_type  TEXT NOT NULL,
    description    TEXT,
    timestamp      TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS model_costs (
    model                     TEXT PRIMARY KEY,
    input_cost_per_million    NUMERIC NOT NULL,
    output_cost_per_million   NUMERIC NOT NULL
);

INSERT INTO model_costs VALUES
    ('claude-opus-4-6',           15.0,  75.0),
    ('claude-sonnet-4-6',          3.0,  15.0),
    ('claude-sonnet-4-20250514',   3.0,  15.0),
    ('claude-haiku-4-5',           0.8,   4.0),
    ('claude-haiku-4-5-20251001',  0.8,   4.0)
ON CONFLICT DO NOTHING;

-- ==================== INDEXES ====================

CREATE INDEX IF NOT EXISTS idx_messages_session     ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_role        ON messages(role);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp   ON messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_tool_uses_session    ON tool_uses(session_id);
CREATE INDEX IF NOT EXISTS idx_skill_uses_session   ON skill_uses(session_id);
CREATE INDEX IF NOT EXISTS idx_subagent_session     ON subagent_uses(session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_started     ON sessions(started_at);

-- ==================== VIEWS ====================

CREATE OR REPLACE VIEW summary_stats AS
SELECT
    (SELECT COUNT(*) FROM sessions)      AS total_sessions,
    (SELECT COUNT(*) FROM tool_uses)     AS total_tool_uses,
    (SELECT COUNT(*) FROM skill_uses)    AS total_skill_uses,
    (SELECT COUNT(*) FROM subagent_uses) AS total_subagent_uses,
    COALESCE(SUM(m.input_tokens), 0)       AS total_input_tokens,
    COALESCE(SUM(m.output_tokens), 0)      AS total_output_tokens,
    COALESCE(SUM(m.cache_read_tokens), 0)  AS total_cache_read_tokens,
    COALESCE(SUM(m.cache_write_tokens), 0) AS total_cache_write_tokens,
    COALESCE(ROUND(SUM(
        m.input_tokens  * COALESCE(mc.input_cost_per_million,  3.0) +
        m.output_tokens * COALESCE(mc.output_cost_per_million, 15.0)
    ) / 1000000.0, 4), 0) AS estimated_cost_usd
FROM messages m
JOIN sessions s ON m.session_id = s.session_id
LEFT JOIN model_costs mc ON s.model = mc.model
WHERE m.role = 'assistant';

CREATE OR REPLACE VIEW daily_stats AS
SELECT
    (m.timestamp AT TIME ZONE 'UTC')::date AS date,
    SUM(m.input_tokens)          AS input_tokens,
    SUM(m.output_tokens)         AS output_tokens,
    SUM(m.cache_read_tokens)     AS cache_read_tokens,
    COUNT(DISTINCT m.session_id) AS sessions,
    ROUND(SUM(
        m.input_tokens  * COALESCE(mc.input_cost_per_million,  3.0) +
        m.output_tokens * COALESCE(mc.output_cost_per_million, 15.0)
    ) / 1000000.0, 4) AS estimated_cost_usd
FROM messages m
JOIN sessions s ON m.session_id = s.session_id
LEFT JOIN model_costs mc ON s.model = mc.model
WHERE m.role = 'assistant'
GROUP BY (m.timestamp AT TIME ZONE 'UTC')::date
ORDER BY date;

CREATE OR REPLACE VIEW tool_stats AS
SELECT tool_name, COUNT(*) AS count
FROM tool_uses
GROUP BY tool_name
ORDER BY count DESC;

CREATE OR REPLACE VIEW skill_stats AS
SELECT skill_name, COUNT(*) AS count
FROM skill_uses
GROUP BY skill_name
ORDER BY count DESC;

CREATE OR REPLACE VIEW subagent_stats AS
SELECT subagent_type, COUNT(*) AS count
FROM subagent_uses
GROUP BY subagent_type
ORDER BY count DESC;

CREATE OR REPLACE VIEW project_stats AS
SELECT
    s.project_name,
    s.project_path,
    COUNT(DISTINCT s.session_id)      AS sessions,
    COALESCE(SUM(m.input_tokens), 0)  AS input_tokens,
    COALESCE(SUM(m.output_tokens), 0) AS output_tokens
FROM sessions s
LEFT JOIN messages m ON s.session_id = m.session_id AND m.role = 'assistant'
GROUP BY s.project_name, s.project_path
ORDER BY sessions DESC;

-- ==================== ROW LEVEL SECURITY ====================

ALTER TABLE sessions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_uses     ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_uses    ENABLE ROW LEVEL SECURITY;
ALTER TABLE subagent_uses ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_costs   ENABLE ROW LEVEL SECURITY;

-- anon ロールには SELECT のみ許可（書き込みは service_role のみ = collector.py）
CREATE POLICY "public read sessions"      ON sessions      FOR SELECT USING (true);
CREATE POLICY "public read messages"      ON messages      FOR SELECT USING (true);
CREATE POLICY "public read tool_uses"     ON tool_uses     FOR SELECT USING (true);
CREATE POLICY "public read skill_uses"    ON skill_uses    FOR SELECT USING (true);
CREATE POLICY "public read subagent_uses" ON subagent_uses FOR SELECT USING (true);
CREATE POLICY "public read model_costs"   ON model_costs   FOR SELECT USING (true);

-- ビューへの SELECT 権限を anon に付与
GRANT SELECT ON summary_stats  TO anon;
GRANT SELECT ON daily_stats    TO anon;
GRANT SELECT ON tool_stats     TO anon;
GRANT SELECT ON skill_stats    TO anon;
GRANT SELECT ON subagent_stats TO anon;
GRANT SELECT ON project_stats  TO anon;
```

**Step 2: Commit**

```bash
git add supabase/migrations/001_init.sql
git commit -m "feat: Supabase マイグレーション SQL（テーブル・ビュー・RLS）"
```

---

### Task 2: Python 依存関係に supabase を追加

**Files:**
- Modify: `pyproject.toml`

**Step 1: supabase を依存関係に追加**

`pyproject.toml` の `dependencies` に `"supabase>=2.0.0"` を追加:

```toml
dependencies = [
    "fastapi>=0.135.1",
    "uvicorn[standard]>=0.41.0",
    "supabase>=2.0.0",
]
```

**Step 2: uv.lock を更新**

```bash
uv lock
```

**Step 3: インストール確認**

```bash
uv run python -c "from supabase import create_client; print('ok')"
```

Expected: `ok`

**Step 4: Commit**

```bash
git add pyproject.toml uv.lock
git commit -m "feat: supabase-py 依存関係を追加"
```

---

### Task 3: collector.py に Supabase dual-mode を追加

**Files:**
- Modify: `collector.py`

**Step 1: 既存テストがパスすることを確認（変更前ベースライン）**

```bash
uv run pytest tests/test_collector.py -v
```

Expected: 6 passed

**Step 2: Supabase クライアント生成関数と書き込み関数を追加**

`collector.py` の import ブロックの後（`from api.db import ...` の後）に以下を追加:

```python
def _get_supabase_client():
    """SUPABASE_URL と SUPABASE_SERVICE_KEY が設定されていれば Supabase クライアントを返す。"""
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        return None
    from supabase import create_client
    return create_client(url, key)


def _write_to_supabase(client, session_id, project_path, project_name,
                        started_at, ended_at, git_branch, model,
                        messages_to_insert, tool_uses_to_insert,
                        skill_uses_to_insert, subagent_uses_to_insert) -> None:
    """Supabase にセッションデータを UPSERT する（冪等）。"""
    collected_at = datetime.now(timezone.utc).isoformat()

    client.table("sessions").upsert({
        "session_id":   session_id,
        "project_path": project_path,
        "project_name": project_name,
        "started_at":   started_at,
        "ended_at":     ended_at,
        "git_branch":   git_branch,
        "model":        model,
        "collected_at": collected_at,
    }).execute()

    for table in ("messages", "tool_uses", "skill_uses", "subagent_uses"):
        client.table(table).delete().eq("session_id", session_id).execute()

    if messages_to_insert:
        client.table("messages").insert([
            {
                "session_id": session_id, "role": role, "timestamp": ts,
                "input_tokens": inp, "output_tokens": out,
                "cache_read_tokens": cr, "cache_write_tokens": cw,
            }
            for session_id, role, ts, inp, out, cr, cw in messages_to_insert
        ]).execute()

    if tool_uses_to_insert:
        client.table("tool_uses").insert([
            {"session_id": session_id, "tool_name": name, "timestamp": ts}
            for session_id, name, ts in tool_uses_to_insert
        ]).execute()

    if skill_uses_to_insert:
        client.table("skill_uses").insert([
            {"session_id": session_id, "skill_name": name, "timestamp": ts}
            for session_id, name, ts in skill_uses_to_insert
        ]).execute()

    if subagent_uses_to_insert:
        client.table("subagent_uses").insert([
            {"session_id": session_id, "subagent_type": st, "description": desc, "timestamp": ts}
            for session_id, st, desc, ts in subagent_uses_to_insert
        ]).execute()
```

**Step 3: collect_session 関数の末尾（SQLite 書き込み部分）を dual-mode に変更**

現在の `conn = get_conn(db_path)` から始まる書き込みブロックを以下に置き換える:

```python
    supabase_client = _get_supabase_client() if db_path is None else None
    if supabase_client:
        _write_to_supabase(
            supabase_client, session_id, project_path, project_name,
            started_at, ended_at, git_branch, model,
            messages_to_insert, tool_uses_to_insert,
            skill_uses_to_insert, subagent_uses_to_insert,
        )
        return

    # SQLite フォールバック（テスト・ローカル開発用）
    conn = get_conn(db_path)
    collected_at = datetime.now(timezone.utc).isoformat()
    # ... 以下は既存コードそのまま
```

**Step 4: テストが引き続きパスすることを確認**

```bash
uv run pytest tests/test_collector.py tests/test_db.py -v
```

Expected: 7 passed（test_db.py の 1 件 + test_collector.py の 6 件）

**Step 5: Commit**

```bash
git add collector.py
git commit -m "feat: collector.py に Supabase dual-mode を追加（env未設定時はSQLiteフォールバック）"
```

---

### Task 4: FastAPI 関連ファイルを削除・テスト整理

**Files:**
- Delete: `api/main.py`, `api/queries.py`, `tests/test_api.py`

**Step 1: ファイル削除**

```bash
rm api/main.py api/queries.py tests/test_api.py
```

**Step 2: 残りのテストがパスすることを確認**

```bash
uv run pytest tests/ -v
```

Expected: 7 passed（test_collector.py 6件 + test_db.py 1件）

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: FastAPI (api/main.py, api/queries.py) と test_api.py を削除"
```

---

### Task 5: フロントエンドに @supabase/supabase-js を追加

**Files:**
- Modify: `frontend/package.json`

**Step 1: パッケージをインストール**

```bash
cd frontend && npm install @supabase/supabase-js
```

**Step 2: インストール確認**

```bash
node -e "require('@supabase/supabase-js'); console.log('ok')"
```

Expected: `ok`

**Step 3: Commit**

```bash
cd ..
git add frontend/package.json frontend/package-lock.json
git commit -m "feat: @supabase/supabase-js をフロントエンドに追加"
```

---

### Task 6: Supabase クライアントと型定義・クエリを作成

**Files:**
- Create: `frontend/src/lib/supabase.ts`
- Create: `frontend/src/lib/queries.ts`

**Step 1: `frontend/src/lib/` ディレクトリを作成**

```bash
mkdir -p frontend/src/lib
```

**Step 2: `frontend/src/lib/supabase.ts` を作成**

```typescript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('VITE_SUPABASE_URL と VITE_SUPABASE_ANON_KEY を .env.local に設定してください')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

**Step 3: `frontend/src/lib/queries.ts` を作成**

旧 `api.ts` と旧 `api/queries.py` を統合した TypeScript 版:

```typescript
import { supabase } from './supabase'

// ==================== 型定義 ====================

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

export interface ToolEntry    { tool_name: string; count: number }
export interface SkillEntry   { skill_name: string; count: number }
export interface SubagentEntry { subagent_type: string; count: number }
export interface ProjectEntry {
  project_name: string
  project_path: string
  sessions: number
  input_tokens: number
  output_tokens: number
}

// ==================== クエリ ====================

async function query<T>(view: string, options?: { gte?: [string, string]; order?: string }): Promise<T[]> {
  let q = supabase.from(view).select('*')
  if (options?.gte) q = q.gte(options.gte[0], options.gte[1])
  if (options?.order) q = q.order(options.order)
  const { data, error } = await q
  if (error) throw new Error(`Supabase error (${view}): ${error.message}`)
  return (data ?? []) as T[]
}

export const api = {
  summary: async (): Promise<Summary> => {
    const { data, error } = await supabase.from('summary_stats').select('*').single()
    if (error) throw new Error(`Supabase error (summary_stats): ${error.message}`)
    return data as Summary
  },

  daily: (days = 90): Promise<DailyEntry[]> => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)
    const cutoffStr = cutoff.toISOString().slice(0, 10)
    return query<DailyEntry>('daily_stats', { gte: ['date', cutoffStr], order: 'date' })
  },

  tools:     (): Promise<ToolEntry[]>     => query<ToolEntry>('tool_stats'),
  skills:    (): Promise<SkillEntry[]>    => query<SkillEntry>('skill_stats'),
  subagents: (): Promise<SubagentEntry[]> => query<SubagentEntry>('subagent_stats'),
  projects:  (): Promise<ProjectEntry[]>  => query<ProjectEntry>('project_stats'),
}
```

**Step 4: TypeScript コンパイルエラーがないか確認**

```bash
cd frontend && npx tsc --noEmit
```

Expected: エラーなし

**Step 5: Commit**

```bash
cd ..
git add frontend/src/lib/
git commit -m "feat: Supabase クライアント・クエリ・型定義 (src/lib/) を作成"
```

---

### Task 7: フロントエンドのページを新クエリに移行

**Files:**
- Modify: `frontend/src/pages/DashboardPage.tsx`
- Modify: `frontend/src/pages/ToolsPage.tsx`
- Modify: `frontend/src/pages/SkillsPage.tsx`
- Modify: `frontend/src/pages/ProjectsPage.tsx`

各ページの import を変更するだけ。`api` オブジェクトの API は同じなので他のコードは変更不要。

**Step 1: 全ページの import を一括置換**

```bash
cd frontend
sed -i '' "s|from '../api'|from '../lib/queries'|g" src/pages/DashboardPage.tsx src/pages/ToolsPage.tsx src/pages/SkillsPage.tsx src/pages/ProjectsPage.tsx
```

**Step 2: 変更確認**

```bash
grep "from '../" src/pages/*.tsx
```

Expected: 全ページが `from '../lib/queries'` を参照している

**Step 3: TypeScript エラーがないか確認**

```bash
npx tsc --noEmit
```

Expected: エラーなし

**Step 4: Commit**

```bash
cd ..
git add frontend/src/pages/
git commit -m "feat: フロントエンドのページを Supabase クエリ (lib/queries) に移行"
```

---

### Task 8: 旧 api.ts 削除と vite.config.ts のプロキシ設定削除

**Files:**
- Delete: `frontend/src/api.ts`
- Modify: `frontend/vite.config.ts`

**Step 1: 旧 api.ts を削除**

```bash
rm frontend/src/api.ts
```

**Step 2: vite.config.ts からプロキシ設定を削除**

`frontend/vite.config.ts` を以下に変更（`server.proxy` ブロックを削除）:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
})
```

**Step 3: ビルドが通ることを確認**

```bash
cd frontend && npm run build
```

Expected: `dist/` が生成され、エラーなし

**Step 4: Commit**

```bash
cd ..
git add frontend/src/api.ts frontend/vite.config.ts  # api.ts は削除なので -A を使う
git add -A frontend/
git commit -m "feat: 旧 api.ts と FastAPI プロキシ設定を削除"
```

---

### Task 9: ローカル開発用 .env.local 作成と動作確認

**Files:**
- Create: `frontend/.env.local`（Git 管理外）

**Step 1: Supabase プロジェクトを作成（手動作業）**

1. https://supabase.com でアカウント作成（無料・クレカ不要）
2. 新しいプロジェクトを作成
3. `supabase/migrations/001_init.sql` を Supabase の SQL Editor で実行
4. Project Settings → API から以下を取得:
   - `Project URL`（SUPABASE_URL）
   - `anon public` キー（SUPABASE_ANON_KEY）
   - `service_role` キー（SUPABASE_SERVICE_KEY）

**Step 2: .env.local を作成**

`frontend/.env.local`:
```
VITE_SUPABASE_URL=https://xxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

**Step 3: collector.py 用の環境変数を ~/.claude/settings.json に追加**

```json
{
  "env": {
    "SUPABASE_URL": "https://xxxxxxxxxx.supabase.co",
    "SUPABASE_SERVICE_KEY": "eyJ..."
  }
}
```

**Step 4: テストデータを Supabase に収集**

```bash
uv run python collector.py --all
```

Expected: エラーなし、Supabase のテーブルにデータが入る

**Step 5: ローカルで動作確認**

```bash
cd frontend && npm run dev
```

ブラウザで http://localhost:5173 を開いて全ページが表示されることを確認。

---

### Task 10: vercel.json と Makefile を更新

**Files:**
- Create: `vercel.json`
- Modify: `Makefile`

**Step 1: vercel.json を作成**

```json
{
  "buildCommand": "cd frontend && npm ci && npm run build",
  "outputDirectory": "frontend/dist",
  "framework": null,
  "rewrites": [
    { "source": "/((?!_vercel|[^/]+\\.).*)", "destination": "/index.html" }
  ]
}
```

**Step 2: Makefile を更新**

`api:` コマンドを削除し、`deploy` と `setup-supabase` を追加:

```makefile
.PHONY: dev frontend collect test install deploy

dev: ## フロントエンドを起動（Supabase に直接接続）
	cd frontend && npm run dev

frontend: ## Vite dev server 起動 (port 5173)
	cd frontend && npm run dev

collect: ## 手動でトランスクリプト全件を Supabase に再収集
	uv run python collector.py --all

test: ## テスト実行
	uv run pytest tests/ -v

install: ## collect-stats コマンドを ~/.local/bin にインストール
	mkdir -p ~/.local/bin
	printf '#!/bin/bash\npython3 "%s/collector.py" "$$@"\n' "$(CURDIR)" > ~/.local/bin/collect-stats
	chmod +x ~/.local/bin/collect-stats
	@echo "installed: ~/.local/bin/collect-stats"

deploy: ## Vercel にデプロイ（vercel CLI が必要）
	vercel --prod
```

**Step 3: .gitignore に .env.local を追加**

`.gitignore` に以下が含まれていることを確認（なければ追加）:

```
frontend/.env.local
```

**Step 4: ビルドと最終テスト**

```bash
uv run pytest tests/ -v
cd frontend && npm run build
```

Expected: テスト 7 件パス、ビルド成功

**Step 5: Commit**

```bash
cd ..
git add vercel.json Makefile .gitignore
git commit -m "feat: vercel.json と Makefile を更新（Vercel デプロイ対応）"
```

---

### Task 11: Vercel デプロイ

**Step 1: Vercel CLI をインストール（未インストールの場合）**

```bash
npm install -g vercel
```

**Step 2: Vercel にログインしてプロジェクトを作成**

```bash
vercel login
vercel
```

プロンプトに従ってリポジトリをリンク。

**Step 3: Vercel の環境変数を設定**

Vercel ダッシュボード → Project Settings → Environment Variables に追加:
- `VITE_SUPABASE_URL` = Supabase の Project URL
- `VITE_SUPABASE_ANON_KEY` = Supabase の anon key

**Step 4: 本番デプロイ**

```bash
vercel --prod
```

Expected: デプロイ URL が表示される（例: `https://your-project.vercel.app`）

**Step 5: 動作確認**

デプロイ URL をブラウザで開き、全ページが正常に表示されることを確認。

**Step 6: 最終 commit**

```bash
git add -A
git commit -m "docs: セットアップ手順と Vercel デプロイを README に反映"
```

---

## 完了条件チェックリスト

- [ ] `uv run pytest tests/ -v` → 7 passed
- [ ] `cd frontend && npm run build` → エラーなし
- [ ] Vercel の URL でダッシュボードが表示される
- [ ] `make collect` でローカルデータが Supabase に入る
- [ ] Claude Code Stop hook から自動収集が動く
