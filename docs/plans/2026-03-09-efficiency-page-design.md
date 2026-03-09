# Efficiency Page Design

**Date:** 2026-03-09
**Goal:** Claude Code使用効率の多角的可視化ページを新規追加する。週次効率トレンド・キャッシュ効率・コンテキスト膨張率・セッション散布図を1ページに集約。

---

## 背景と目的

既存ダッシュボードは「量」の把握（トークン消費・コスト・セッション数）に特化している。
ユーザーが「どれだけ賢く使えているか」を自己評価するための**効率メトリクス**が欠けている。

可視化したい4指標:
1. セッションあたりのコード編集量（効率スコア = edit_actions / user_turns）
2. コンテキスト肥大化の傾向（膨張率 = max_input_tokens / first_input_tokens）
3. Cache ヒット率（cache_read_tokens の割合）
4. /clear タイミング（input_tokens の急減から推定）

---

## データ設計

### LOC代理指標の選定理由

`git log` ベースのLOC計測は「コミット済み変更のみ」かつ遡及不可のため不採用。
`tool_uses` テーブルの `Edit` / `Write` / `MultiEdit` / `NotebookEdit` 呼び出し数を
**コード編集アクション数 (code_edits)** として使用する。全歴史データで即計算可能。

### 効率スコア定義

```
efficiency_score = code_edits / user_turns
```

- `code_edits`: Edit + Write + MultiEdit + NotebookEdit ツール呼び出し数
- `user_turns`: session内の role='user' メッセージ数

### /clear 検出ロジック

```sql
-- 同session内で assistant の input_tokens が前ターン比 50%以上減少 → /clear イベント
LAG(input_tokens) OVER (PARTITION BY session_id ORDER BY timestamp)
WHERE input_tokens < prev_tokens * 0.5
```

### 新規 SQL ビュー (migration 004)

#### `session_stats`
セッション毎の効率メトリクス集計:

| カラム | 定義 |
|---|---|
| `session_id` | セッションID |
| `project_name` | プロジェクト名 |
| `started_at` | 開始日時 |
| `duration_minutes` | 所要時間（分） |
| `user_turns` | user メッセージ数 |
| `code_edits` | Edit+Write+MultiEdit+NotebookEdit 呼び出し数 |
| `efficiency_score` | code_edits / user_turns（user_turns=0なら0） |
| `total_input_tokens` | assistant messages の input_tokens 合計 |
| `total_output_tokens` | output_tokens 合計 |
| `total_cache_read` | cache_read_tokens 合計 |
| `cache_hit_rate` | cache_read / (input + cache_read) × 100 |
| `context_growth_factor` | max(input_tokens) / first(input_tokens)（初回>0のセッションのみ） |
| `clear_count` | /clear 推定回数 |
| `estimated_cost_usd` | セッションコスト |

#### `weekly_efficiency`
週毎の効率集計:

| カラム | 定義 |
|---|---|
| `week` | 週の開始日（UTC、DATE_TRUNC） |
| `sessions` | セッション数 |
| `median_efficiency` | efficiency_score の中央値 |
| `avg_efficiency` | 平均値 |
| `avg_cache_hit_rate` | 平均 cache hit 率 |
| `avg_context_growth` | 平均 context_growth_factor |
| `total_code_edits` | 週合計 code_edits |
| `total_user_turns` | 週合計 user_turns |

---

## フロントエンド設計

### ページ構成: `EfficiencyPage.tsx`

```
┌─────────────────────────────────────────────────────────────────┐
│ [KPI Cards × 4]                                                  │
│  今週の効率スコア │ Cache ヒット率 │ 平均トークン/session │ 膨張率 │
│  (前週比トレンドバッジ付き)                                      │
├─────────────────────────────────────────────────────────────────┤
│ 週次 効率スコア推移 [4w / 12w / 1y / All タブ]                  │
│  ComposedChart: Bar=session数(右軸), Line=効率スコア中央値(左軸) │
│  色: session bars=#e0e7ff, efficiency line=#6366f1               │
├────────────────────────────┬────────────────────────────────────┤
│ Cache ヒット率（日別）      │ コンテキスト膨張率 分布             │
│  AreaChart + 50%基準ライン  │  Histogram (5ビン)                 │
│  色: #10b981                │  <1x / 1-2x / 2-5x / 5-10x / 10x+ │
│                             │  10x+はオレンジ強調               │
├─────────────────────────────────────────────────────────────────┤
│ Session Explorer (Scatter)                                       │
│  X: user_turns, Y: total_input_tokens (対数軸)                   │
│  色: efficiency_score 赤(0)→緑(5+) グラデーション               │
│  サイズ: duration_minutes (小→大)                               │
│  /clear 検出セッション: 点線ボーダー（strokeDasharray）          │
│  ホバー tooltip: project / date / 効率 / tokens / cost / clear数 │
└─────────────────────────────────────────────────────────────────┘
```

### コンポーネント構成

```
frontend/src/
├── pages/
│   └── EfficiencyPage.tsx        # メインページ（新規）
├── components/
│   └── SessionDot.tsx            # Scatter カスタムドット（新規）
└── lib/
    └── queries.ts                # SessionStats / WeeklyEfficiency 型追加
```

### 新規 TypeScript 型

```typescript
interface SessionStats {
  session_id: string
  project_name: string
  started_at: string
  duration_minutes: number
  user_turns: number
  code_edits: number
  efficiency_score: number
  total_input_tokens: number
  total_output_tokens: number
  total_cache_read: number
  cache_hit_rate: number
  context_growth_factor: number
  clear_count: number
  estimated_cost_usd: number
}

interface WeeklyEfficiency {
  week: string
  sessions: number
  median_efficiency: number
  avg_efficiency: number
  avg_cache_hit_rate: number
  avg_context_growth: number
  total_code_edits: number
  total_user_turns: number
}
```

### ナビゲーション

`App.tsx` に `efficiency` タブを追加（DashboardPage の隣）。

---

## UI/UX ディテール

### KPI Cards
- `StatCard` を再利用し `badge` prop を活用
- 「今週の効率スコア」は前週比 calcTrend で自動トレンド計算

### Session Explorer 色スケール
```typescript
// efficiency_score 0→5+ を HSL で赤→緑にマッピング
const scoreToColor = (score: number) => {
  const hue = Math.min(score / 5, 1) * 120  // 0=赤(0°), 5+=緑(120°)
  return `hsl(${hue}, 70%, 50%)`
}
```

### 膨張率ヒストグラム ビン定義
```
[<1x, 1-2x, 2-5x, 5-10x, 10x+]
10x+ は fill="#f97316"（オレンジ）、他は fill="#6366f1"
```

### Cache 基準ライン
```tsx
<ReferenceLine y={50} stroke="#10b981" strokeDasharray="4 4" label="目標 50%" />
```

---

## 実装ファイル一覧

| ファイル | 変更種別 |
|---|---|
| `supabase/migrations/004_efficiency_stats.sql` | 新規作成 |
| `frontend/src/lib/queries.ts` | `SessionStats` / `WeeklyEfficiency` 型＋API追加 |
| `frontend/src/components/SessionDot.tsx` | 新規作成（Scatter カスタムドット） |
| `frontend/src/pages/EfficiencyPage.tsx` | 新規作成 |
| `frontend/src/App.tsx` | efficiency タブ追加 |
