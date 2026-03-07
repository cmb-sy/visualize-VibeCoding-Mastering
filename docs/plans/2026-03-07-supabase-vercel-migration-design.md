# Supabase + Vercel 移行設計

作成日: 2026-03-07

## 背景と目的

現在の構成はローカルで FastAPI + SQLite を起動する必要があり、常時アクセスできない。
Supabase（PostgreSQL）をデータストアとし、Vercel で React フロントエンドをホスティングすることで、
URL を開くだけでいつでもダッシュボードを閲覧できる状態にする。

## アーキテクチャ決定

```
ローカル環境                        クラウド
─────────────────────              ──────────────────────────
Claude Code セッション終了            Supabase (PostgreSQL)
  ↓ Stop hook                          sessions / messages /
collector.py (Python)   ──────────→    tool_uses / skill_uses /
  JSONL解析 + INSERT                    subagent_uses テーブル
  supabase-py (service key)               ↑ SELECT (anon key)
                                    Vercel (React + Vite)
                                    @supabase/supabase-js
                                    ブラウザから直接 Supabase へ
```

## 各コンポーネントの決定事項

### 1. collector.py → Python のまま維持

**決定**: supabase-py を追加し、Supabase への書き込みをサポート。SQLite も引き続きサポート。

**理由**:
- JSONL の解析ロジックは既に実装済みでテスト済み（13件パス）
- Python は CLI スクリプトとして十分で、TypeScript に書き直すメリットがない
- dual-mode（SQLite / Supabase）にすることでテストは SQLite のまま動作し続ける
- `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` 環境変数が設定されていれば Supabase に書き込み、
  未設定なら SQLite にフォールバック（テスト・ローカル開発用）

### 2. FastAPI (api/main.py, api/queries.py) → 削除

**決定**: FastAPI を廃止し、フロントエンドから Supabase REST API を直接呼ぶ。

**理由**:
- Vercel はフロントエンドのホスティングが主眼。FastAPI をどこかにホスティングする必要が生じると管理が増える
- Supabase はビルトインの REST API（PostgREST）を提供しており、フロントエンドから直接クエリ可能
- コスト計算（トークン × 単価）は Python 数行の処理で TypeScript に移植コストがほぼかからない
- サーバーが不要になることで、維持コスト・障害点がゼロになる

### 3. api/db.py → 維持（テスト用 SQLite サポートとして残す）

**決定**: `api/main.py` `api/queries.py` は削除するが、`api/db.py` は残す。

**理由**:
- `collector.py` が SQLite フォールバックのために `api/db.py` の `get_conn`, `init_db` をインポートしている
- テストが `api/db.py` の `init_db` を使っており、変更なしで流用できる

### 4. フロントエンド → @supabase/supabase-js に移行

**決定**: `src/api.ts` を `src/lib/supabase.ts` に置き換え。

**理由**:
- 既に TypeScript で実装されており、Supabase クライアントもネイティブ TypeScript 対応
- `@supabase/supabase-js` が型定義を提供するため、型安全性が維持される
- コスト計算ロジックを `src/lib/queries.ts` に TypeScript で実装する

### 5. テスト戦略

**決定**: `test_api.py` は削除、`test_collector.py` と `test_db.py` は SQLite を使って維持。

**理由**:
- FastAPI が消えるため `test_api.py` は不要
- `collector.py` の dual-mode 設計により、テストは `db_path` を指定して SQLite で動作し続ける
- Supabase との結合テストはローカルでは行わない（本番同等の環境テストは CI/CD で対応）

### 6. セキュリティ（Supabase RLS）

**決定**:
- 全テーブルで Row Level Security (RLS) を有効化
- `SELECT` は `anon` ロール（認証なし）に許可 → フロントエンドの anon key で読み取り可能
- `INSERT/UPDATE/DELETE` は `service_role` のみ → collector.py のみが書き込み可能

**理由**:
- 個人のダッシュボードなので認証不要でも問題ない（URLを知っている人なら誰でも見える）
- 書き込みは `service_role` キーで保護するため、外部からの不正書き込みは防げる
- `SUPABASE_SERVICE_KEY` はローカルの `~/.claude/settings.json` に保存し、Git には含めない

### 7. 環境変数

| 変数名 | 用途 | 保存場所 |
|--------|------|----------|
| `SUPABASE_URL` | Supabase プロジェクト URL | `~/.claude/settings.json` (collector用) |
| `SUPABASE_SERVICE_KEY` | 書き込み用（RLS bypass） | `~/.claude/settings.json` (collector用) |
| `VITE_SUPABASE_URL` | フロントエンド用 URL | Vercel 環境変数 |
| `VITE_SUPABASE_ANON_KEY` | フロントエンド用 読み取りキー | Vercel 環境変数 |

## 変更ファイル一覧

| ファイル | 変更内容 |
|----------|----------|
| `collector.py` | supabase-py 対応を追加（dual-mode） |
| `api/main.py` | **削除** |
| `api/queries.py` | **削除** |
| `api/db.py` | 変更なし（SQLite サポートとして残す） |
| `pyproject.toml` | `supabase` ライブラリ追加 |
| `frontend/src/api.ts` | **削除** → `src/lib/supabase.ts` + `src/lib/queries.ts` |
| `frontend/src/pages/*.tsx` | Supabase クライアント経由に変更 |
| `frontend/package.json` | `@supabase/supabase-js` 追加 |
| `tests/test_api.py` | **削除** |
| `tests/test_collector.py` | 変更なし（SQLite path で動作継続） |
| `tests/test_db.py` | 変更なし |
| `vercel.json` | **新規作成** |
| `supabase/migrations/001_init.sql` | **新規作成**（テーブル定義 + RLS） |
| `Makefile` | `deploy` コマンド追加、`api` コマンド削除 |

## セットアップ手順（初回のみ）

1. Supabase でプロジェクト作成
2. `supabase/migrations/001_init.sql` を Supabase SQL Editor で実行
3. `~/.claude/settings.json` の `env` に `SUPABASE_URL` と `SUPABASE_SERVICE_KEY` を追加
4. `make collect` で既存データを Supabase に再収集
5. Vercel にリポジトリを接続、環境変数を設定してデプロイ
