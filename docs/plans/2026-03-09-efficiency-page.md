# Efficiency Page Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 週次効率スコア・Cache ヒット率・コンテキスト膨張率・Session Explorer の4セクションからなる新規 Efficiency ページを実装する。

**Architecture:** Supabase に `session_stats` / `weekly_efficiency` ビューを追加し、フロントエンドに `EfficiencyPage.tsx` + `SessionDot.tsx` を新規作成。`queries.ts` に型・API を追加し、`App.tsx` にタブを追加する。

**Tech Stack:** React 18 + TypeScript, Vite, Tailwind CSS, Recharts (ComposedChart/ScatterChart/AreaChart/BarChart), Supabase JS v2

---

## Task 1: SQL migration — session_stats / weekly_efficiency ビュー

**Files:**
- Create: `supabase/migrations/004_efficiency_stats.sql`

**Step 1: SQLファイル作成**

```sql
-- supabase/migrations/004_efficiency_stats.sql

-- ==================== session_stats ====================
-- セッション毎: 効率スコア / cache hit率 / コンテキスト膨張率 / /clear推定回数

CREATE OR REPLACE VIEW session_stats AS
WITH code_edits AS (
    SELECT session_id, COUNT(*) AS code_edits
    FROM tool_uses
    WHERE tool_name IN ('Edit', 'Write', 'MultiEdit', 'NotebookEdit')
    GROUP BY session_id
),
user_turns AS (
    SELECT session_id, COUNT(*) AS user_turns
    FROM messages
    WHERE role = 'user'
    GROUP BY session_id
),
token_agg AS (
    SELECT
        m.session_id,
        SUM(m.input_tokens)       AS total_input_tokens,
        SUM(m.output_tokens)      AS total_output_tokens,
        SUM(m.cache_read_tokens)  AS total_cache_read,
        ROUND(SUM(
            m.input_tokens  * COALESCE(mc.input_cost_per_million,  3.0) +
            m.output_tokens * COALESCE(mc.output_cost_per_million, 15.0)
        ) / 1000000.0, 4)         AS estimated_cost_usd
    FROM messages m
    JOIN sessions s ON m.session_id = s.session_id
    LEFT JOIN model_costs mc ON s.model = mc.model
    WHERE m.role = 'assistant'
    GROUP BY m.session_id
),
context_growth AS (
    SELECT
        session_id,
        CASE
            WHEN first_tokens = 0 THEN 1.0
            ELSE ROUND(max_tokens::numeric / first_tokens, 2)
        END AS context_growth_factor
    FROM (
        SELECT
            session_id,
            FIRST_VALUE(input_tokens) OVER (PARTITION BY session_id ORDER BY timestamp) AS first_tokens,
            MAX(input_tokens)         OVER (PARTITION BY session_id)                    AS max_tokens,
            ROW_NUMBER()              OVER (PARTITION BY session_id ORDER BY timestamp) AS rn
        FROM messages
        WHERE role = 'assistant' AND input_tokens > 0
    ) t
    WHERE rn = 1
),
clear_events AS (
    SELECT session_id, COUNT(*) AS clear_count
    FROM (
        SELECT
            session_id,
            input_tokens,
            LAG(input_tokens) OVER (PARTITION BY session_id ORDER BY timestamp) AS prev_tokens
        FROM messages
        WHERE role = 'assistant' AND input_tokens > 0
    ) t
    WHERE prev_tokens IS NOT NULL AND input_tokens < prev_tokens * 0.5
    GROUP BY session_id
)
SELECT
    s.session_id,
    s.project_name,
    s.started_at,
    ROUND(EXTRACT(EPOCH FROM (s.ended_at - s.started_at)) / 60.0, 1) AS duration_minutes,
    COALESCE(ut.user_turns,  0) AS user_turns,
    COALESCE(ce.code_edits,  0) AS code_edits,
    CASE
        WHEN COALESCE(ut.user_turns, 0) = 0 THEN 0
        ELSE ROUND(COALESCE(ce.code_edits, 0)::numeric / ut.user_turns, 2)
    END AS efficiency_score,
    COALESCE(ta.total_input_tokens,  0) AS total_input_tokens,
    COALESCE(ta.total_output_tokens, 0) AS total_output_tokens,
    COALESCE(ta.total_cache_read,    0) AS total_cache_read,
    CASE
        WHEN COALESCE(ta.total_input_tokens + ta.total_cache_read, 0) = 0 THEN 0
        ELSE ROUND(
            ta.total_cache_read::numeric /
            (ta.total_input_tokens + ta.total_cache_read) * 100, 1
        )
    END AS cache_hit_rate,
    COALESCE(cg.context_growth_factor, 1.0) AS context_growth_factor,
    COALESCE(clr.clear_count, 0)            AS clear_count,
    COALESCE(ta.estimated_cost_usd,  0)     AS estimated_cost_usd
FROM sessions s
LEFT JOIN user_turns  ut  ON s.session_id = ut.session_id
LEFT JOIN code_edits  ce  ON s.session_id = ce.session_id
LEFT JOIN token_agg   ta  ON s.session_id = ta.session_id
LEFT JOIN context_growth cg  ON s.session_id = cg.session_id
LEFT JOIN clear_events   clr ON s.session_id = clr.session_id;

-- ==================== weekly_efficiency ====================
-- 週毎: 効率スコア中央値 / cache hit率平均 / context膨張率平均

CREATE OR REPLACE VIEW weekly_efficiency AS
SELECT
    DATE_TRUNC('week', started_at AT TIME ZONE 'UTC')::date  AS week,
    COUNT(*)                                                   AS sessions,
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (
        ORDER BY efficiency_score
    )::numeric, 2)                                             AS median_efficiency,
    ROUND(AVG(efficiency_score)::numeric,     2)              AS avg_efficiency,
    ROUND(AVG(cache_hit_rate)::numeric,       1)              AS avg_cache_hit_rate,
    ROUND(AVG(context_growth_factor)::numeric, 2)             AS avg_context_growth,
    SUM(code_edits)                                           AS total_code_edits,
    SUM(user_turns)                                           AS total_user_turns
FROM session_stats
GROUP BY 1
ORDER BY 1;

-- ==================== 権限付与 ====================

GRANT SELECT ON session_stats    TO anon;
GRANT SELECT ON weekly_efficiency TO anon;
```

**Step 2: Supabase に migration を適用**

Supabase Studio の SQL Editor に上記 SQL を貼り付けて実行する。

**Step 3: 動作確認**

Supabase Studio の SQL Editor で以下を実行して結果を確認:

```sql
SELECT session_id, efficiency_score, cache_hit_rate, context_growth_factor, clear_count
FROM session_stats
ORDER BY started_at DESC
LIMIT 5;

SELECT * FROM weekly_efficiency ORDER BY week DESC LIMIT 4;
```

Expected: 各カラムに数値が入っている（efficiency_score >= 0, cache_hit_rate 0-100, context_growth_factor >= 1.0）

**Step 4: Commit**

```bash
git add supabase/migrations/004_efficiency_stats.sql
git commit -m "feat: add session_stats and weekly_efficiency SQL views"
```

---

## Task 2: queries.ts — 型定義と API 追加

**Files:**
- Modify: `frontend/src/lib/queries.ts`

**Step 1: SessionStats / WeeklyEfficiency 型と API を追加**

`frontend/src/lib/queries.ts` の末尾（`export const api = {` ブロック内）に追記する。

まず型定義をファイルの型定義セクションに追加:

```typescript
export interface SessionStats {
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

export interface WeeklyEfficiency {
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

`api` オブジェクトに以下を追加:

```typescript
sessions: (days = 365): Promise<SessionStats[]> => {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  const cutoffStr = cutoff.toISOString().slice(0, 10)
  return query<SessionStats>('session_stats', { gte: ['started_at', cutoffStr], order: 'started_at' })
},
weeklyEfficiency: (): Promise<WeeklyEfficiency[]> =>
  query<WeeklyEfficiency>('weekly_efficiency', { order: 'week' }),
```

**Step 2: TypeScript エラー確認**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: エラーなし

**Step 3: Commit**

```bash
git add frontend/src/lib/queries.ts
git commit -m "feat: add SessionStats and WeeklyEfficiency types and API"
```

---

## Task 3: SessionDot コンポーネント作成

**Files:**
- Create: `frontend/src/components/SessionDot.tsx`

**Step 1: カスタム Scatter ドット作成**

効率スコアを赤→緑にマッピング、/clear 検出セッションを点線リングで表示。

```typescript
// frontend/src/components/SessionDot.tsx
import type { SessionStats } from '../lib/queries'

interface Props {
  cx?: number
  cy?: number
  payload?: SessionStats
}

function scoreToColor(score: number): string {
  // 0→赤(0°) / 5+→緑(120°)
  const hue = Math.min(score / 5, 1) * 120
  return `hsl(${hue}, 65%, 48%)`
}

export function SessionDot({ cx = 0, cy = 0, payload }: Props) {
  if (!payload) return null
  const color = scoreToColor(payload.efficiency_score)
  // duration_minutes が長いほど大きい点 (4px〜14px)
  const r = Math.min(Math.max(Math.sqrt((payload.duration_minutes || 1) + 1) * 1.8, 4), 14)
  const hasClear = payload.clear_count > 0

  return (
    <g>
      {hasClear && (
        <circle
          cx={cx} cy={cy} r={r + 4}
          fill="none"
          stroke="#ef4444"
          strokeWidth="1.5"
          strokeDasharray="3 2"
          opacity={0.7}
        />
      )}
      <circle cx={cx} cy={cy} r={r} fill={color} opacity={0.72} />
    </g>
  )
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/SessionDot.tsx
git commit -m "feat: add SessionDot custom scatter component with score-to-color and clear indicator"
```

---

## Task 4: EfficiencyPage — KPI Cards + 週次効率チャート

**Files:**
- Create: `frontend/src/pages/EfficiencyPage.tsx`

**Step 1: KPI Cards と週次効率チャートを実装**

```typescript
// frontend/src/pages/EfficiencyPage.tsx
import { useEffect, useState, useMemo } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
  AreaChart, Area, ScatterChart, Scatter,
} from 'recharts'
import { api, type SessionStats, type WeeklyEfficiency, type DailyEntry } from '../lib/queries'
import { StatCard } from '../components/StatCard'
import { SessionDot } from '../components/SessionDot'

type WeekRange = '4w' | '12w' | '1y' | 'all'

// ==================== ユーティリティ ====================

function calcTrend(curr: number, prev: number): number | undefined {
  if (prev === 0) return undefined
  return ((curr - prev) / prev) * 100
}

function fmtNum(n: number, digits = 1): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(digits)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(digits)}K`
  return n.toFixed(digits)
}

// コンテキスト膨張率をヒストグラム用5ビンに分類
function buildGrowthBins(sessions: SessionStats[]) {
  const bins = [
    { label: '<1x',   min: 0,  max: 1,   count: 0, color: '#6366f1' },
    { label: '1–2x',  min: 1,  max: 2,   count: 0, color: '#6366f1' },
    { label: '2–5x',  min: 2,  max: 5,   count: 0, color: '#6366f1' },
    { label: '5–10x', min: 5,  max: 10,  count: 0, color: '#6366f1' },
    { label: '10x+',  min: 10, max: Infinity, count: 0, color: '#f97316' },
  ]
  for (const s of sessions) {
    const g = s.context_growth_factor
    for (const bin of bins) {
      if (g >= bin.min && g < bin.max) { bin.count++; break }
    }
  }
  return bins
}

// ==================== サブコンポーネント ====================

function WeekRangeTab({ value, current, onClick }: { value: WeekRange; current: WeekRange; onClick: (v: WeekRange) => void }) {
  return (
    <button
      onClick={() => onClick(value)}
      className={`text-xs font-semibold px-3 py-1 rounded-full transition-colors ${
        value === current
          ? 'bg-indigo-100 text-indigo-700'
          : 'text-gray-400 hover:text-gray-600'
      }`}
    >
      {value === '4w' ? '4W' : value === '12w' ? '12W' : value === '1y' ? '1Y' : 'All'}
    </button>
  )
}

// ==================== メインページ ====================

export function EfficiencyPage() {
  const [sessions,  setSessions]  = useState<SessionStats[]>([])
  const [weekly,    setWeekly]    = useState<WeeklyEfficiency[]>([])
  const [daily,     setDaily]     = useState<DailyEntry[]>([])
  const [weekRange, setWeekRange] = useState<WeekRange>('12w')
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)

  useEffect(() => {
    Promise.all([api.sessions(365), api.weeklyEfficiency(), api.daily(365)])
      .then(([s, w, d]) => {
        setSessions(s)
        setWeekly(w)
        setDaily(d)
        setLoading(false)
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'データの取得に失敗しました')
        setLoading(false)
      })
  }, [])

  // 週次チャート用データ（weekRange でフィルタ）
  const weeklyChartData = useMemo(() => {
    if (weekRange === 'all') return weekly
    const cutoffWeeks = weekRange === '4w' ? 4 : weekRange === '12w' ? 12 : 52
    return weekly.slice(-cutoffWeeks)
  }, [weekly, weekRange])

  // Cache ヒット率（daily から計算）
  const dailyCacheData = useMemo(() =>
    daily.map(d => ({
      date: d.date,
      cache_hit_rate: d.input_tokens + d.cache_read_tokens > 0
        ? Math.round(d.cache_read_tokens / (d.input_tokens + d.cache_read_tokens) * 100 * 10) / 10
        : 0,
    })),
    [daily]
  )

  // 膨張率ヒストグラム
  const growthBins = useMemo(() => buildGrowthBins(sessions), [sessions])

  // KPI: 今週 vs 先週
  const thisWeek = weekly[weekly.length - 1]
  const prevWeek = weekly[weekly.length - 2]

  // KPI: overall cache hit rate
  const totalCacheRead = sessions.reduce((a, s) => a + s.total_cache_read, 0)
  const totalInput     = sessions.reduce((a, s) => a + s.total_input_tokens + s.total_cache_read, 0)
  const overallCacheHit = totalInput > 0 ? Math.round(totalCacheRead / totalInput * 100 * 10) / 10 : 0

  // KPI: average tokens / session (last 7 days)
  const recentSessions = sessions.slice(-30)
  const avgTokens = recentSessions.length > 0
    ? Math.round(recentSessions.reduce((a, s) => a + s.total_input_tokens, 0) / recentSessions.length)
    : 0

  // KPI: average context growth factor
  const avgGrowth = sessions.length > 0
    ? Math.round(sessions.reduce((a, s) => a + s.context_growth_factor, 0) / sessions.length * 10) / 10
    : 0

  if (loading) return (
    <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Loading...</div>
  )
  if (error) return <div className="text-red-500 text-sm p-4">{error}</div>

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-base font-semibold text-gray-800">Efficiency</h2>
        <p className="text-xs text-gray-400 mt-0.5">Claude Code の使用効率・キャッシュ効率・コンテキスト管理を可視化</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          title="今週の効率スコア"
          value={thisWeek ? thisWeek.median_efficiency.toFixed(1) : '—'}
          sub="edit_actions / user_turn (中央値)"
          trend={thisWeek && prevWeek ? calcTrend(thisWeek.median_efficiency, prevWeek.median_efficiency) : undefined}
          accentColor="#6366f1"
          badge={{ label: 'Efficiency', color: '#6366f1' }}
        />
        <StatCard
          title="Cache ヒット率"
          value={`${overallCacheHit}%`}
          sub="cache_read / total_input"
          accentColor="#10b981"
          badge={{ label: 'Cache', color: '#10b981' }}
        />
        <StatCard
          title="平均トークン/session"
          value={fmtNum(avgTokens, 0)}
          sub="直近30 session の平均"
          accentColor="#f59e0b"
        />
        <StatCard
          title="コンテキスト膨張率"
          value={`${avgGrowth}x`}
          sub="max / first input_tokens 平均"
          accentColor="#f97316"
        />
      </div>

      {/* 週次 効率スコア推移 */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-700">週次 効率スコア推移</h2>
          <div className="flex gap-1">
            {(['4w', '12w', '1y', 'all'] as WeekRange[]).map(v => (
              <WeekRangeTab key={v} value={v} current={weekRange} onClick={setWeekRange} />
            ))}
          </div>
        </div>
        {weeklyChartData.length === 0 ? (
          <p className="text-gray-400 text-sm py-8 text-center">データがありません</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={weeklyChartData} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis
                dataKey="week"
                tick={{ fontSize: 10, fill: '#9ca3af' }}
                tickFormatter={(d: string) => d.slice(5)}
                axisLine={false} tickLine={false}
              />
              <YAxis
                yAxisId="score"
                tick={{ fontSize: 10, fill: '#9ca3af' }}
                axisLine={false} tickLine={false}
                width={30}
                label={{ value: '効率', angle: -90, position: 'insideLeft', fontSize: 9, fill: '#9ca3af' }}
              />
              <YAxis
                yAxisId="sessions"
                orientation="right"
                tick={{ fontSize: 10, fill: '#9ca3af' }}
                axisLine={false} tickLine={false}
                width={30}
                label={{ value: 'sessions', angle: 90, position: 'insideRight', fontSize: 9, fill: '#9ca3af' }}
              />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                formatter={(value: number, name: string) => [
                  name === 'セッション数' ? value : value.toFixed(2),
                  name,
                ]}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar
                yAxisId="sessions"
                dataKey="sessions"
                name="セッション数"
                fill="#e0e7ff"
                radius={[2, 2, 0, 0]}
                barSize={12}
              />
              <Line
                yAxisId="score"
                type="monotone"
                dataKey="median_efficiency"
                name="効率スコア（中央値）"
                stroke="#6366f1"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Line
                yAxisId="score"
                type="monotone"
                dataKey="avg_efficiency"
                name="効率スコア（平均）"
                stroke="#a5b4fc"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Cache ヒット率 & コンテキスト膨張率 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Cache ヒット率（日別） */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Cache ヒット率（日別）</h2>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={dailyCacheData.slice(-90)} margin={{ top: 5, right: 8, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="cacheGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#10b981" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}   />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: '#9ca3af' }}
                tickFormatter={(d: string) => d.slice(5)}
                axisLine={false} tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#9ca3af' }}
                domain={[0, 100]}
                tickFormatter={(v: number) => `${v}%`}
                axisLine={false} tickLine={false}
                width={36}
              />
              <ReferenceLine y={50} stroke="#10b981" strokeDasharray="4 4" label={{ value: '目標 50%', fontSize: 9, fill: '#10b981' }} />
              <Tooltip
                formatter={(v: number) => [`${v.toFixed(1)}%`, 'Cache ヒット率']}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
              />
              <Area
                type="monotone"
                dataKey="cache_hit_rate"
                stroke="#10b981"
                strokeWidth={2}
                fill="url(#cacheGrad)"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* コンテキスト膨張率 分布 */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-1">コンテキスト膨張率 分布</h2>
          <p className="text-xs text-gray-400 mb-4">1セッション内での input_tokens の最大 / 初回 比</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={growthBins} margin={{ top: 5, right: 8, left: 0, bottom: 5 }} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: '#6b7280' }}
                axisLine={false} tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#9ca3af' }}
                axisLine={false} tickLine={false}
                width={30}
              />
              <Tooltip
                formatter={(v: number) => [v, 'セッション数']}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
              />
              <Bar dataKey="count" name="セッション数" radius={[3, 3, 0, 0]}>
                {growthBins.map((entry, i) => (
                  <rect key={i} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Session Explorer */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-1">Session Explorer</h2>
        <p className="text-xs text-gray-400 mb-4">
          X: user_turns　Y: total_input_tokens　色: 効率スコア（赤→緑）　サイズ: 所要時間
          <span className="inline-flex items-center gap-1 ml-2">
            <svg width="14" height="14"><circle cx="7" cy="7" r="5" fill="none" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="3 2"/></svg>
            /clear 推定あり
          </span>
        </p>
        {sessions.length === 0 ? (
          <p className="text-gray-400 text-sm py-8 text-center">データがありません</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <ScatterChart margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis
                type="number"
                dataKey="user_turns"
                name="User Turns"
                tick={{ fontSize: 10, fill: '#9ca3af' }}
                axisLine={false} tickLine={false}
                label={{ value: 'user turns', position: 'insideBottom', offset: -4, fontSize: 10, fill: '#9ca3af' }}
              />
              <YAxis
                type="number"
                dataKey="total_input_tokens"
                name="Input Tokens"
                tick={{ fontSize: 10, fill: '#9ca3af' }}
                axisLine={false} tickLine={false}
                width={50}
                tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)}
              />
              <Tooltip
                cursor={{ strokeDasharray: '3 3' }}
                content={({ payload }) => {
                  if (!payload || payload.length === 0) return null
                  const s = payload[0].payload as SessionStats
                  return (
                    <div className="bg-white border border-gray-200 rounded-lg shadow-md p-3 text-xs space-y-1">
                      <p className="font-semibold text-gray-800">{s.project_name || '(no project)'}</p>
                      <p className="text-gray-500">{s.started_at.slice(0, 10)}</p>
                      <p>効率スコア: <span className="font-bold text-indigo-600">{s.efficiency_score.toFixed(2)}</span></p>
                      <p>User turns: {s.user_turns}　Code edits: {s.code_edits}</p>
                      <p>Input tokens: {s.total_input_tokens.toLocaleString()}</p>
                      <p>Cache hit: {s.cache_hit_rate.toFixed(1)}%</p>
                      <p>所要時間: {s.duration_minutes.toFixed(0)} 分</p>
                      <p>コスト: ${s.estimated_cost_usd.toFixed(4)}</p>
                      {s.clear_count > 0 && (
                        <p className="text-red-500">/clear 推定: {s.clear_count} 回</p>
                      )}
                    </div>
                  )
                }}
              />
              <Scatter
                data={sessions}
                shape={(props: unknown) => {
                  const p = props as { cx?: number; cy?: number; payload?: SessionStats }
                  return <SessionDot cx={p.cx} cy={p.cy} payload={p.payload} />
                }}
              />
            </ScatterChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
```

**Step 2: TypeScript エラー確認**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -30
```

Expected: エラーなし（または既存エラーのみ）

**Step 3: Commit**

```bash
git add frontend/src/pages/EfficiencyPage.tsx
git commit -m "feat: add EfficiencyPage with weekly trend, cache chart, growth histogram, and scatter"
```

---

## Task 5: BarChart の Cell 色分けを修正

**Files:**
- Modify: `frontend/src/pages/EfficiencyPage.tsx`

コンテキスト膨張率ヒストグラムで `<rect>` を使うとレンダリングされないため、Recharts の `Cell` コンポーネントで色分けする。

**Step 1: Cell import 追加と Bar を修正**

ファイル冒頭の recharts import に `Cell` を追加:

```typescript
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
  AreaChart, Area, ScatterChart, Scatter, Cell,
} from 'recharts'
```

膨張率ヒストグラムの `<Bar>` ブロックを以下に置換:

```tsx
<Bar dataKey="count" name="セッション数" radius={[3, 3, 0, 0]}>
  {growthBins.map((entry, i) => (
    <Cell key={i} fill={entry.color} />
  ))}
</Bar>
```

**Step 2: TypeScript エラー確認**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: エラーなし

**Step 3: Commit**

```bash
git add frontend/src/pages/EfficiencyPage.tsx
git commit -m "fix: use Recharts Cell for growth histogram bar colors"
```

---

## Task 6: App.tsx — Efficiency タブ追加

**Files:**
- Modify: `frontend/src/App.tsx`

**Step 1: import と TABS / ルーティングを更新**

```typescript
import { EfficiencyPage } from './pages/EfficiencyPage'
```

`TABS` 配列に追加:

```typescript
const TABS = [
  { id: 'dashboard',  label: 'ダッシュボード' },
  { id: 'tools',      label: 'ツール' },
  { id: 'skills',     label: 'スキル & エージェント' },
  { id: 'efficiency', label: '効率' },
]
```

`<main>` 内に追加:

```tsx
{tab === 'efficiency' && <EfficiencyPage />}
```

**Step 2: TypeScript エラー確認**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: エラーなし

**Step 3: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat: add Efficiency tab to navigation"
```

---

## Task 7: ビルド確認

**Step 1: フロントエンドをビルド**

```bash
cd frontend && npm run build 2>&1
```

Expected: `✓ built in` で終わること。TypeScript エラーなし。

**Step 2: dev server で目視確認**

```bash
cd frontend && npm run dev
```

ブラウザで `http://localhost:5173` を開き以下を確認:
1. 「効率」タブが表示される
2. KPI カード 4枚が表示される（数値が入っていること）
3. 週次効率チャートが表示される
4. Cache ヒット率チャートと膨張率ヒストグラムが横並びで表示される
5. Session Explorer の散布図にドットが表示される
6. ドットをホバーするとツールチップが表示される

**Step 3: Final commit**

```bash
git add -A
git commit -m "chore: final build verification for efficiency page"
```
