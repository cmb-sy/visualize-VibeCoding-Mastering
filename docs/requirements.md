# 要件定義

## 背景・目的

Claude Codeを日常的に使用する中で、以下の課題があった：

- どのプロジェクトにどれだけ時間・コストを投入しているか把握できない
- どのツールやスキルをよく使っているか分からない
- APIコストの累計が見えない

これらを可視化するダッシュボードを構築し、Claude Codeの利用状況を定量的に把握できるようにする。

## 機能要件

### FR-1: 自動データ収集

- Claude Codeのセッション終了時に自動でデータを収集する
- 手動での操作は不要（Stop hookで自動実行）
- 既存セッションの一括再収集も可能（`make collect`）

### FR-2: 統計ダッシュボード

以下の統計をWebブラウザで閲覧できること：

| 画面 | 表示内容 |
|---|---|
| Overview | 累計セッション数、累計トークン数（input/output/cache）、累計推定コスト（USD）、日別トレンドグラフ |
| Tools | ツール別利用回数ランキング（棒グラフ＋テーブル） |
| Skills & Agents | スキル別・サブエージェント種別利用回数 |
| Projects | プロジェクト別セッション数・トークン消費量 |

### FR-3: 常時アクセス可能なURL

- ローカルサーバーを起動しなくてもブラウザでアクセスできること
- デプロイ済みのURLを開けばいつでも最新データを閲覧できること

### FR-4: コスト計算

- モデル別の単価（input/output tokens）に基づき推定コストを算出
- 対応モデル: claude-opus-4-6 / claude-sonnet-4-6 / claude-haiku-4-5 他

## 非機能要件

### NFR-1: 完全無料（または実質無料）での運用

- BigQuery: 無料枠内（ストレージ10GB/月、クエリ1TB/月）で収まること
- Cloud Run: 無料枠内（2Mリクエスト/月）で収まること
- Firebase Hosting: 無料枠内で収まること
- 個人利用レベルのデータ量・アクセス頻度を前提とする

### NFR-2: 設定のハードコード禁止

- 個人のホームディレクトリパスや絶対パスをコードに直接書かない
- 設定値は環境変数で管理し、`~/.claude/settings.json` の `env` セクションで定義する
- dotfileが公開リポジトリであっても安全な状態を維持する

### NFR-3: 冪等性

- 同じセッションを複数回収集しても重複データが発生しないこと

### NFR-4: テスト可能性

- BigQuery実環境に依存せずテストが実行できること（モックを使用）
- `make test` でユニットテスト13件がパスすること

## システム制約

### SC-1: データソース

- Claude Codeのトランスクリプト（JSONL形式）を解析対象とする
- ファイルパス: `~/.claude/projects/**/*.jsonl`

### SC-2: クラウド環境

- GCP（Google Cloud Platform）を使用
- プロジェクト: `claude-monitor-489307`
- リージョン: `asia-northeast1`（東京）

### SC-3: 認証

- ローカル実行: サービスアカウントキー（`~/.config/gcloud/claude-monitor-key.json`）
- Cloud Run: サービスアカウント `visualize-vibecoding-mastering@claude-monitor-489307.iam.gserviceaccount.com`
- キーファイル自体はGitリポジトリに含めない

### SC-4: 技術スタック

| レイヤー | 技術 |
|---|---|
| データ収集 | Python 3.12+, uv |
| データストア | Google BigQuery |
| バックエンド | FastAPI, uvicorn |
| フロントエンド | React 19, Vite, TypeScript, Recharts, Tailwind CSS |
| ホスティング | Cloud Run（フロント・バックエンド同一コンテナ） |

## 初期セットアップ手順

1. GCPサービスアカウント作成・ロール付与（BigQuery データ編集者 / ジョブユーザー）
2. サービスアカウントキーを `~/.config/gcloud/claude-monitor-key.json` に配置
3. `~/.claude/settings.json` の `env` に3つの環境変数を設定
4. `make setup-bq` でBigQueryテーブルを初期化
5. `make collect` で既存セッションを一括収集
6. `make deploy` でCloud Runにデプロイ（フロントエンドビルド込み）
7. `make install` で `collect-stats` コマンドをインストール（Stop hookから呼ばれる）
