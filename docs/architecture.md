# システム構成（Architecture）

## 概要

Claude Codeのセッション終了時に自動でデータを収集し、BigQueryに蓄積、Webブラウザからいつでも統計を閲覧できるダッシュボードシステム。

## システム全体図

```
ローカル環境                           クラウド（GCP）
─────────────────────                 ──────────────────────────────────────
Claude Code セッション                 BigQuery (claude-monitor-489307)
  │                                     └─ dataset: claude_stats
  │ セッション終了（Stop hook）             ├─ table: sessions
  ↓                                       ├─ table: messages
collector.py                             ├─ table: tool_uses
  │ JSONL解析                             ├─ table: skill_uses
  │ INSERT                                └─ table: subagent_uses
  └──────────────────────────────────→ BigQuery
                                           ↑
                                           │ SELECT
                                     Cloud Run
                                     (claude-stats-api)
                                     FastAPI / Python
                                           │ JSON API
                                           │ /api/*
                                     Firebase Hosting
                                     React / Vite
                                           │
                                    ブラウザ（いつでも閲覧可）
```

## コンポーネント詳細

### 1. collector.py（データ収集）

- **役割**: Claude CodeのJSONLトランスクリプトを解析してBigQueryに書き込む
- **起動タイミング**: Claude Codeセッション終了時（Stop hook）、または `make collect` で手動一括収集
- **冪等性**: 同一セッションを重複収集しても問題なし（DELETEしてからINSERT）
- **認証**: ローカルではサービスアカウントキー（`~/.config/gcloud/claude-monitor-key.json`）、Cloud Run上ではADC（サービスアカウント自動認証）

### 2. api/（バックエンド）

| ファイル | 役割 |
|---|---|
| `api/db.py` | BigQueryクライアント生成、テーブル初期化 |
| `api/queries.py` | BigQuery SQLクエリ（集計・分析） |
| `api/main.py` | FastAPI エンドポイント定義 |

**APIエンドポイント:**

| パス | 説明 |
|---|---|
| `GET /api/summary` | 累計セッション数・トークン数・コスト |
| `GET /api/daily?days=N` | 日別トークン数・コスト推移 |
| `GET /api/tools` | ツール別利用回数 |
| `GET /api/skills` | スキル別利用回数 |
| `GET /api/subagents` | サブエージェント種別別利用回数 |
| `GET /api/projects` | プロジェクト別セッション数・トークン消費 |

### 3. frontend/（フロントエンド）

- **技術**: React 19 + Vite + TypeScript + Recharts + Tailwind CSS
- **ページ構成**:
  - Overview: 累計コスト・日別トレンドグラフ
  - Tools: ツール別利用ランキング
  - Skills & Agents: スキル・サブエージェント集計
  - Projects: プロジェクト別統計

### 4. BigQuery（データストア）

**テーブル設計:**

```
sessions
  session_id    STRING  PK
  project_path  STRING
  project_name  STRING
  started_at    TIMESTAMP
  ended_at      TIMESTAMP
  git_branch    STRING
  model         STRING
  collected_at  TIMESTAMP

messages
  session_id        STRING  FK → sessions
  role              STRING  (user / assistant)
  timestamp         TIMESTAMP
  input_tokens      INTEGER
  output_tokens     INTEGER
  cache_read_tokens    INTEGER
  cache_write_tokens   INTEGER

tool_uses
  session_id  STRING  FK → sessions
  tool_name   STRING
  timestamp   TIMESTAMP

skill_uses
  session_id  STRING  FK → sessions
  skill_name  STRING
  timestamp   TIMESTAMP

subagent_uses
  session_id    STRING  FK → sessions
  subagent_type STRING
  description   STRING
  timestamp     TIMESTAMP
```

## 認証・設定

設定は `~/.claude/settings.json` の `env` セクションで管理。ハードコードなし。

```json
"env": {
  "GOOGLE_APPLICATION_CREDENTIALS": "~/.config/gcloud/claude-monitor-key.json",
  "BIGQUERY_PROJECT": "claude-monitor-489307",
  "BIGQUERY_DATASET": "claude_stats"
}
```

- ローカル: サービスアカウントキーJSONで認証
- Cloud Run: IAMサービスアカウント（ADC）で自動認証

## デプロイ構成

```
Cloud Run（1コンテナ）
  ├─ /api/*   → FastAPI（BigQuery クエリ）
  └─ /*       → React 静的ファイル配信（frontend/dist/）
       │
       │ BigQuery クライアント（サービスアカウント自動認証）
       ↓
  BigQuery
```

Dockerfile はマルチステージビルド：
1. `node:22-slim` で React をビルド
2. `uv:python3.12` にビルド成果物をコピーして1つのイメージを作成

### デプロイコマンド

```bash
# 初回のみ: BigQueryテーブル初期化
make setup-bq

# デプロイ（フロントエンドビルド + Cloud Run）
make deploy
```

## ローカル開発

```bash
make dev        # バックエンド(8765) + フロントエンド(5173) 同時起動
make collect    # 既存セッションをBigQueryに一括収集
make test       # テスト実行（BigQueryはモック）
```
