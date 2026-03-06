# Claude Code 利用状況ダッシュボード 設計書

**作成日**: 2026-03-06
**プロジェクト**: visualize-VibeCoding-Mastering
**参考**: https://zenn.dev/dinii/articles/28c8fcd041837d

---

## 概要

Claude Codeのトランスクリプト（JSONL）を解析し、個人の利用状況をWebブラウザで可視化するダッシュボード。

---

## アーキテクチャ

```
~/.claude/projects/**/*.jsonl  ← Claude Codeのトランスクリプト
         ↓ (Stopフック実行)
/Users/snakashima/develop/other/visualize-VibeCoding-Mastering/collector.py
         ↓
~/.claude/stats.db (SQLite)
         ↓
/Users/snakashima/develop/other/visualize-VibeCoding-Mastering/api/main.py (FastAPI)
         ↓
http://localhost:8765
         ↓
/Users/snakashima/develop/other/visualize-VibeCoding-Mastering/frontend/ (React + Recharts)
```

---

## ディレクトリ構成

```
visualize-VibeCoding-Mastering/
├── collector.py           # トランスクリプト解析・DB書き込み
├── api/
│   ├── main.py            # FastAPI エントリーポイント
│   └── db.py              # SQLite アクセス層
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx    # トップ（コスト・セッション概要）
│   │   │   ├── Tools.tsx        # ツール利用内訳
│   │   │   ├── Skills.tsx       # スキル・サブエージェント利用
│   │   │   └── Projects.tsx     # プロジェクト別内訳
│   │   └── components/
│   │       └── charts/          # 再利用グラフコンポーネント
│   ├── package.json
│   └── vite.config.ts
├── docs/plans/
├── Makefile                # make dev / make collect
└── README.md
```

---

## データベーススキーマ

### sessions テーブル
```sql
CREATE TABLE sessions (
  session_id   TEXT PRIMARY KEY,
  project_path TEXT,               -- cwd から抽出
  project_name TEXT,               -- cwd のbasename
  started_at   TEXT,               -- 最初のメッセージのtimestamp
  ended_at     TEXT,               -- 最後のメッセージのtimestamp
  git_branch   TEXT,
  model        TEXT,               -- claude-sonnet-4-6 等
  collected_at TEXT                -- collector実行時刻
);
```

### messages テーブル
```sql
CREATE TABLE messages (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id      TEXT,
  role            TEXT,            -- user / assistant
  timestamp       TEXT,
  input_tokens    INTEGER DEFAULT 0,
  output_tokens   INTEGER DEFAULT 0,
  cache_read_tokens    INTEGER DEFAULT 0,
  cache_write_tokens   INTEGER DEFAULT 0,
  FOREIGN KEY (session_id) REFERENCES sessions(session_id)
);
```

### tool_uses テーブル
```sql
CREATE TABLE tool_uses (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT,
  tool_name   TEXT,                -- Bash, Read, Edit, Write, Task, Skill 等
  timestamp   TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(session_id)
);
```

### skill_uses テーブル
```sql
CREATE TABLE skill_uses (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT,
  skill_name  TEXT,               -- Skill toolのargs.skill から抽出
  timestamp   TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(session_id)
);
```

### subagent_uses テーブル
```sql
CREATE TABLE subagent_uses (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id     TEXT,
  subagent_type  TEXT,            -- Task toolのargs.subagent_type から抽出
  description    TEXT,
  timestamp      TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(session_id)
);
```

---

## データ収集（collector.py）

### 処理フロー
1. 環境変数 `CLAUDE_SESSION_ID` からセッションIDを取得
2. 対応するJSONLファイルを `~/.claude/projects/` 以下から探索
3. 行ごとにパースし各テーブルに書き込み
4. 既存セッションは `INSERT OR REPLACE` で上書き

### Stopフック設定（~/.claude/settings.json）
```json
"Stop": [
  {
    "hooks": [
      {
        "type": "command",
        "command": "python3 /Users/snakashima/develop/other/visualize-VibeCoding-Mastering/collector.py",
        "timeout": 30
      }
    ]
  }
]
```

---

## API エンドポイント（FastAPI）

| Method | Path | 説明 |
|--------|------|------|
| GET | `/api/summary` | 累計セッション数・トークン数・推定コスト |
| GET | `/api/daily` | 日別トークン数・コスト（折れ線グラフ用） |
| GET | `/api/tools` | ツール別利用回数（棒グラフ用） |
| GET | `/api/skills` | スキル別利用回数 |
| GET | `/api/subagents` | サブエージェント別利用回数 |
| GET | `/api/projects` | プロジェクト別セッション数・トークン数 |

---

## ダッシュボード画面

### `/` トップ
- 累計コスト・セッション数・総トークン数（サマリーカード）
- 日別コスト折れ線グラフ（過去30日）
- 直近セッション一覧

### `/tools` ツール内訳
- ツール別利用回数（横棒グラフ）
- セッション数の推移

### `/skills` スキル・サブエージェント
- スキル呼び出しランキング（棒グラフ）
- サブエージェントタイプ別利用（円グラフ）

### `/projects` プロジェクト別
- プロジェクト別トークン消費（棒グラフ）
- プロジェクト別セッション数

---

## 技術スタック

| 役割 | 採用技術 |
|------|---------|
| データ収集 | Python 3（stdlib: sqlite3, json, os, pathlib） |
| DB | SQLite（`~/.claude/stats.db`） |
| バックエンド | FastAPI + uvicorn |
| フロントエンド | React 18 + Vite + TypeScript |
| グラフ | Recharts |
| スタイル | Tailwind CSS |
| 起動 | Makefile（`make dev`） |

---

## コスト計算

モデル別の入出力トークン単価を `collector.py` または API 側で定義し推定コストを算出。

```python
TOKEN_COSTS = {
    "claude-opus-4-6":    {"input": 15.0, "output": 75.0},   # per 1M tokens
    "claude-sonnet-4-6":  {"input": 3.0,  "output": 15.0},
    "claude-haiku-4-5":   {"input": 0.8,  "output": 4.0},
}
```

---

## 承認済み設計

- データ保存先: `~/.claude/stats.db`
- 起動URL: `http://localhost:8765`
- 個人利用（チーム共有なし）
