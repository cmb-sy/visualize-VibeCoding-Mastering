# visualize-VibeCoding-Mastering

Claude Codeの利用状況をブラウザで可視化するダッシュボード。

## セットアップ

### 1. 依存関係インストール
```bash
uv sync
cd frontend && npm install && cd ..
```

### 2. 既存データを収集
```bash
make collect
```

### 3. 起動
```bash
make dev
```

ブラウザで http://localhost:5173 を開く。
API: http://localhost:8765

## Stopフック設定（セッション終了時に自動収集）

`~/.claude/settings.json` の `hooks` に以下を追加:

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

| ページ | URL | 内容 |
|---|---|---|
| Overview | / | 累計コスト・トークン数・日別トレンドグラフ |
| Tools | /tools | ツール別利用回数（横棒グラフ + テーブル） |
| Skills & Agents | /skills | スキルランキング・サブエージェント円グラフ |
| Projects | /projects | プロジェクト別セッション数・トークン消費 |

## データ構造

- **DB**: `~/.claude/stats.db` (SQLite)
- **ソース**: `~/.claude/projects/**/*.jsonl`
- **収集タイミング**: Stopフック（セッション終了時）または `make collect`（手動全件）
