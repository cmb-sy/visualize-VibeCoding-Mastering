# visualize-VibeCoding-Mastering

Claude Codeの利用状況をブラウザで可視化するダッシュボード。
Supabase（PostgreSQL）にデータを蓄積し、Vercel でホスティングした URL からいつでも閲覧できる。

## アーキテクチャ

```
Claude Code セッション終了
  ↓ Stop hook
collector.py (ローカル Python)
  ↓ supabase-py で書き込み
Supabase (PostgreSQL)
  ↑ @supabase/supabase-js で直接クエリ
Vercel (React + Vite)
  ↓
ブラウザ
```

---

## 別端末でのセットアップ

### 必要なツール

```bash
# uv（Python実行環境）
curl -LsSf https://astral.sh/uv/install.sh | sh

# Supabase CLI（初回のスキーマ適用時のみ使用）
brew install supabase/tap/supabase
```

### 手順

#### 1. リポジトリをクローン

```bash
git clone https://github.com/cmb-sy/visualize-VibeCoding-Mastering.git
cd visualize-VibeCoding-Mastering
uv sync
cd frontend && npm install && cd ..
```

#### 2. 認証情報ファイルを作成

`~/.config/claude-stats/env`（Git管理外・秘密情報）を作成する。
値は Supabase ダッシュボードの **Project Settings → API** から取得。

```bash
mkdir -p ~/.config/claude-stats
cat > ~/.config/claude-stats/env << 'EOF'
SUPABASE_URL=https://ycwwxmuoixforhklqmkc.supabase.co
SUPABASE_SERVICE_KEY=（service_role キーを貼り付け）
EOF
chmod 600 ~/.config/claude-stats/env
```

#### 3. Stop hook にプロジェクトパスを登録

```bash
make install
# → ~/.config/claude-stats/project-path にこのディレクトリのパスが書き込まれる
```

#### 4. dotfiles と Claude Code の接続（dotfiles 管理している場合）

`~/.claude/settings.json` と `~/.claude/claude/` がシンボリックリンクで `dotfiles/claude/` を向いていること:

```bash
ln -sf ~/dotfiles/claude/settings.json ~/.claude/settings.json
ln -sf ~/dotfiles/claude ~/.claude/claude
```

これにより Stop hook（`~/.claude/claude/hooks/stop.sh`）が有効になる。

#### 5. `~/.claude/projects/` の所有者を修正

```bash
sudo chown -R $(whoami):staff ~/.claude/projects/
```

**なぜ必要か？**

`~/.claude/projects/` ディレクトリが `root` 所有で作成されているケースがある（Claude Code のインストール方法によって発生）。
このディレクトリには Claude Code がセッションのトランスクリプト（JSONL）を書き込むが、`root` 所有だと一般ユーザー権限では書き込めず、ファイルが作成されない。
結果として Stop hook が収集対象ファイルを見つけられず、Supabase にデータが届かない。

上記コマンドで所有者をログインユーザーに変更することで、以降のセッション終了時に JSONL が正しく保存され、自動収集が機能するようになる。

#### 6. 既存データを Supabase に収集

```bash
make collect
```

#### 6. 動作確認

```bash
# テストがパスすること
make test

# hook が正常に動くこと
echo '{}' | bash ~/.claude/claude/hooks/stop.sh
# → "[collector] no transcript_path in hook input" が出ればOK
```

---

## Supabase スキーマの初回適用（プロジェクト新規作成時のみ）

Supabase のプロジェクトを新しく作った場合は、SQL を適用する:

```bash
supabase link --project-ref <project-ref>
supabase db push
# supabase/migrations/001_init.sql が適用される
```

---

## Vercel デプロイ

#### 1. Vercel に環境変数を設定

Vercel ダッシュボード → **Project Settings → Environment Variables**:

| 変数名 | 値 |
|--------|-----|
| `VITE_SUPABASE_URL` | `https://ycwwxmuoixforhklqmkc.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | anon キー（Supabase の Project Settings → API） |

#### 2. デプロイ

```bash
# vercel CLI を使う場合
npm install -g vercel
vercel --prod
```

または GitHub リポジトリを Vercel に接続してプッシュするだけで自動デプロイ。

---

## ローカル開発

フロントエンドをローカルで動かす場合は `.env.local` が必要:

```bash
cat > frontend/.env.local << 'EOF'
VITE_SUPABASE_URL=https://ycwwxmuoixforhklqmkc.supabase.co
VITE_SUPABASE_ANON_KEY=（anon キーを貼り付け）
EOF

make dev
# → http://localhost:5173 で確認
```

---

## make コマンド一覧

| コマンド | 説明 |
|----------|------|
| `make install` | Stop hook にプロジェクトパスを登録 |
| `make collect` | 既存セッションを全件 Supabase に収集 |
| `make dev` | フロントエンドをローカル起動（Supabase に直接接続） |
| `make test` | テスト実行 |
| `make deploy` | Vercel にデプロイ |

---

## ダッシュボード画面

| ページ | 内容 |
|--------|------|
| Overview | 累計コスト・トークン数・日別トレンドグラフ |
| Tools | ツール別利用回数（横棒グラフ + テーブル） |
| Skills & Agents | スキルランキング・サブエージェント円グラフ |
| Projects | プロジェクト別セッション数・トークン消費 |

---

## ファイル構成

| パス | 用途 | Git 管理 |
|------|------|----------|
| `collector.py` | JSONL 解析・Supabase 書き込み | ✅ |
| `api/db.py` | SQLite（テスト用） | ✅ |
| `frontend/` | React ダッシュボード | ✅ |
| `supabase/migrations/` | DB スキーマ定義 | ✅ |
| `~/.config/claude-stats/env` | Supabase 認証情報 | ❌ ローカルのみ |
| `~/.config/claude-stats/project-path` | プロジェクトの場所 | ❌ ローカルのみ |
| `frontend/.env.local` | フロントエンド用認証情報 | ❌ ローカルのみ |
