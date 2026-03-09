# Dashboard Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Zenn記事参照デザインに倣ったダッシュボードに刷新し、Skill/Subagent/MCP/メッセージ/セッションのカード＋「使いこなし度」セクションを追加する。

**Architecture:** Supabase の既存ビューを拡張して MCP・日別詳細データを取得できるようにし、フロントエンドの DashboardPage を全面的に書き直す。使いこなし度スコアはフロントエンドで summary_stats から計算する。

**Tech Stack:** React 18 + TypeScript, Vite, Tailwind CSS, Recharts, Supabase JS v2, uv (Python)

---

## Task 1: Supabase migration — スキーマ拡張

**Files:**
- Create: `supabase/migrations/002_mcp_and_extended_stats.sql`

**Step 1: SQLファイル作成**

```sql
-- supabase/migrations/002_mcp_and_extended_stats.sql

-- ==================== summary_stats 更新 ====================
-- total_mcp_uses / total_messages を追加

CREATE OR REPLACE VIEW summary_stats AS
SELECT
    (SELECT COUNT(*) FROM sessions)                                         AS total_sessions,
    (SELECT COUNT(*) FROM tool_uses)                                        AS total_tool_uses,
    (SELECT COUNT(*) FROM tool_uses WHERE tool_name NOT LIKE 'mcp__%')      AS total_non_mcp_tool_uses,
    (SELECT COUNT(*) FROM tool_uses WHERE tool_name LIKE 'mcp__%')          AS total_mcp_uses,
    (SELECT COUNT(*) FROM skill_uses)                                       AS total_skill_uses,
    (SELECT COUNT(*) FROM subagent_uses)                                    AS total_subagent_uses,
    (SELECT COUNT(*) FROM messages)                                         AS total_messages,
    COALESCE(SUM(m.input_tokens), 0)                                        AS total_input_tokens,
    COALESCE(SUM(m.output_tokens), 0)                                       AS total_output_tokens,
    COALESCE(SUM(m.cache_read_tokens), 0)                                   AS total_cache_read_tokens,
    COALESCE(SUM(m.cache_write_tokens), 0)                                  AS total_cache_write_tokens,
    COALESCE(ROUND(SUM(
        m.input_tokens  * COALESCE(mc.input_cost_per_million,  3.0) +
        m.output_tokens * COALESCE(mc.output_cost_per_million, 15.0)
    ) / 1000000.0, 4), 0)                                                   AS estimated_cost_usd
FROM messages m
JOIN sessions s ON m.session_id = s.session_id
LEFT JOIN model_costs mc ON s.model = mc.model
WHERE m.role = 'assistant';

-- ==================== tool_stats 更新 (MCP除外) ====================

CREATE OR REPLACE VIEW tool_stats AS
SELECT tool_name, COUNT(*) AS count
FROM tool_uses
WHERE tool_name NOT LIKE 'mcp__%'
GROUP BY tool_name
ORDER BY count DESC;

-- ==================== mcp_stats 新規追加 ====================

CREATE OR REPLACE VIEW mcp_stats AS
SELECT tool_name, COUNT(*) AS count
FROM tool_uses
WHERE tool_name LIKE 'mcp__%'
GROUP BY tool_name
ORDER BY count DESC;

-- ==================== daily_stats 更新 (mcp/skill/subagent/messages追加) ====================

CREATE OR REPLACE VIEW daily_stats AS
WITH daily_messages AS (
    SELECT
        (m.timestamp AT TIME ZONE 'UTC')::date                                 AS date,
        SUM(m.input_tokens)                                                     AS input_tokens,
        SUM(m.output_tokens)                                                    AS output_tokens,
        SUM(m.cache_read_tokens)                                                AS cache_read_tokens,
        COUNT(DISTINCT m.session_id)                                            AS sessions,
        ROUND(SUM(
            m.input_tokens  * COALESCE(mc.input_cost_per_million,  3.0) +
            m.output_tokens * COALESCE(mc.output_cost_per_million, 15.0)
        ) / 1000000.0, 4)                                                       AS estimated_cost_usd
    FROM messages m
    JOIN sessions s ON m.session_id = s.session_id
    LEFT JOIN model_costs mc ON s.model = mc.model
    WHERE m.role = 'assistant'
    GROUP BY 1
),
daily_total_messages AS (
    SELECT
        (timestamp AT TIME ZONE 'UTC')::date AS date,
        COUNT(*)                              AS messages
    FROM messages
    GROUP BY 1
),
daily_tools AS (
    SELECT
        (timestamp AT TIME ZONE 'UTC')::date                                   AS date,
        COUNT(*) FILTER (WHERE tool_name LIKE 'mcp__%')                        AS mcp_uses,
        COUNT(*) FILTER (WHERE tool_name NOT LIKE 'mcp__%')                    AS tool_uses
    FROM tool_uses
    GROUP BY 1
),
daily_skills AS (
    SELECT
        (timestamp AT TIME ZONE 'UTC')::date AS date,
        COUNT(*)                              AS skill_uses
    FROM skill_uses
    GROUP BY 1
),
daily_subagents AS (
    SELECT
        (timestamp AT TIME ZONE 'UTC')::date AS date,
        COUNT(*)                              AS subagent_uses
    FROM subagent_uses
    GROUP BY 1
)
SELECT
    dm.date,
    dm.input_tokens,
    dm.output_tokens,
    dm.cache_read_tokens,
    dm.sessions,
    dm.estimated_cost_usd,
    COALESCE(dtm.messages,    0)  AS messages,
    COALESCE(dt.mcp_uses,     0)  AS mcp_uses,
    COALESCE(dt.tool_uses,    0)  AS tool_uses,
    COALESCE(ds.skill_uses,   0)  AS skill_uses,
    COALESCE(dsa.subagent_uses, 0) AS subagent_uses
FROM daily_messages dm
LEFT JOIN daily_total_messages dtm ON dm.date = dtm.date
LEFT JOIN daily_tools dt   ON dm.date = dt.date
LEFT JOIN daily_skills ds  ON dm.date = ds.date
LEFT JOIN daily_subagents dsa ON dm.date = dsa.date
ORDER BY dm.date;

-- ==================== 権限付与 ====================

GRANT SELECT ON mcp_stats TO anon;
```

**Step 2: Supabase に migration を適用**

Supabase ダッシュボードの SQL Editor に上記 SQL を貼り付けて実行する（または `supabase db push` が使える環境なら使用）。

```bash
# ローカルに supabase CLI が設定済みの場合:
# supabase db push
# 未設定の場合は Supabase Studio > SQL Editor で直接実行
```

**Step 3: 動作確認**

```bash
# Supabase Studio の Table Editor または SQL Editor で確認
# SELECT * FROM summary_stats;
# SELECT * FROM mcp_stats LIMIT 5;
# SELECT * FROM daily_stats ORDER BY date DESC LIMIT 3;
```

Expected: `summary_stats` に `total_mcp_uses`, `total_messages` カラムが存在する

**Step 4: Commit**

```bash
git add supabase/migrations/002_mcp_and_extended_stats.sql
git commit -m "feat: extend Supabase views with MCP stats and daily breakdown"
```

---

## Task 2: queries.ts — 型定義と API 追加

**Files:**
- Modify: `frontend/src/lib/queries.ts`

**Step 1: Summary 型に新フィールド追加 + MCP/daily 拡張**

`frontend/src/lib/queries.ts` を以下に全面差し替え:

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
  total_non_mcp_tool_uses: number
  total_mcp_uses: number
  total_skill_uses: number
  total_subagent_uses: number
  total_messages: number
}

export interface DailyEntry {
  date: string
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  sessions: number
  estimated_cost_usd: number
  messages: number
  mcp_uses: number
  tool_uses: number
  skill_uses: number
  subagent_uses: number
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
  mcpTools:  (): Promise<ToolEntry[]>     => query<ToolEntry>('mcp_stats'),
  skills:    (): Promise<SkillEntry[]>    => query<SkillEntry>('skill_stats'),
  subagents: (): Promise<SubagentEntry[]> => query<SubagentEntry>('subagent_stats'),
  projects:  (): Promise<ProjectEntry[]>  => query<ProjectEntry>('project_stats'),
}
```

**Step 2: TypeScript エラーがないか確認**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: エラーなし（または既存エラーのみ）

**Step 3: Commit**

```bash
git add frontend/src/lib/queries.ts
git commit -m "feat: add MCP and extended daily fields to queries"
```

---

## Task 3: StatCard — バッジ対応に更新

**Files:**
- Modify: `frontend/src/components/StatCard.tsx`

**Step 1: badge prop を追加した StatCard に差し替え**

```typescript
import { BarChart, Bar, ResponsiveContainer } from 'recharts'

interface Props {
  title: string
  value: string | number
  sub?: string
  trend?: number
  sparkData?: number[]
  accentColor?: string
  badge?: { label: string; color: string }  // 追加
}

export function StatCard({ title, value, sub, trend, sparkData, accentColor = '#6366f1', badge }: Props) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex flex-col gap-1">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{title}</span>
        <div className="flex items-center gap-1.5">
          {badge && (
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
              style={{ backgroundColor: badge.color + '20', color: badge.color }}
            >
              {badge.label}
            </span>
          )}
          {trend !== undefined && (
            <span className={`text-xs font-semibold flex items-center gap-0.5 ${
              trend >= 0 ? 'text-emerald-600' : 'text-red-500'
            }`}>
              {trend >= 0 ? '↑' : '↓'} {Math.abs(trend).toFixed(1)}%
            </span>
          )}
        </div>
      </div>
      <span className="text-3xl font-bold text-gray-900 leading-none">{value}</span>
      {sub && <span className="text-xs text-gray-400 mt-0.5">{sub}</span>}
      {sparkData && sparkData.length > 0 && (
        <div className="h-10 mt-2 -mx-1">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={sparkData.map((v, i) => ({ v, i }))} barCategoryGap="10%">
              <Bar dataKey="v" fill={accentColor} radius={[2, 2, 0, 0]} opacity={0.7} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/StatCard.tsx
git commit -m "feat: add badge prop to StatCard"
```

---

## Task 4: MasteryCard コンポーネント作成

**Files:**
- Create: `frontend/src/components/MasteryCard.tsx`

**Step 1: MasteryCard コンポーネント作成**

「使いこなし度」専用カード。円形ゲージ + 自動化率バー + 前期比トレンドを表示。

```typescript
// frontend/src/components/MasteryCard.tsx

interface MasteryData {
  score: number          // 0-100 活用スコア
  automationRate: number // 0-100% 自動化率
  agentIntensity: number // subagent/session
  mcpIntensity: number   // mcp/session
}

interface Props {
  data: MasteryData
  trend?: {
    skill: number | undefined
    subagent: number | undefined
    mcp: number | undefined
    messages: number | undefined
  }
}

function GaugeRing({ score }: { score: number }) {
  const r = 36
  const circ = 2 * Math.PI * r
  const filled = (score / 100) * circ
  const color = score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444'

  return (
    <svg width="96" height="96" viewBox="0 0 96 96">
      <circle cx="48" cy="48" r={r} fill="none" stroke="#f3f4f6" strokeWidth="8" />
      <circle
        cx="48" cy="48" r={r}
        fill="none"
        stroke={color}
        strokeWidth="8"
        strokeDasharray={`${filled} ${circ - filled}`}
        strokeLinecap="round"
        transform="rotate(-90 48 48)"
        style={{ transition: 'stroke-dasharray 0.6s ease' }}
      />
      <text x="48" y="52" textAnchor="middle" fontSize="18" fontWeight="bold" fill="#111827">
        {score}
      </text>
    </svg>
  )
}

function Bar({ value, max = 100, color }: { value: number; max?: number; color: string }) {
  const pct = Math.min((value / max) * 100, 100)
  return (
    <div className="w-full bg-gray-100 rounded-full h-2">
      <div
        className="h-2 rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  )
}

function TrendBadge({ value, label }: { value: number | undefined; label: string }) {
  if (value === undefined) return null
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-gray-500">{label}</span>
      <span className={`font-semibold ${value >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
        {value >= 0 ? '↑' : '↓'} {Math.abs(value).toFixed(1)}%
      </span>
    </div>
  )
}

export function MasteryCard({ data, trend }: Props) {
  const { score, automationRate, agentIntensity, mcpIntensity } = data

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
      <h2 className="text-sm font-semibold text-gray-700 mb-5">使いこなし度</h2>

      <div className="flex gap-8 items-start">
        {/* A: 活用スコア ゲージ */}
        <div className="flex flex-col items-center gap-1 shrink-0">
          <GaugeRing score={score} />
          <span className="text-xs text-gray-400">活用スコア</span>
        </div>

        {/* B: 各レート バー */}
        <div className="flex-1 flex flex-col gap-4">
          <div>
            <div className="flex justify-between text-xs text-gray-600 mb-1.5">
              <span>自動化率 (Tool per message)</span>
              <span className="font-semibold">{automationRate.toFixed(1)}%</span>
            </div>
            <Bar value={automationRate} color="#6366f1" />
          </div>
          <div>
            <div className="flex justify-between text-xs text-gray-600 mb-1.5">
              <span>エージェント活用 (Subagent/session)</span>
              <span className="font-semibold">{agentIntensity.toFixed(1)}</span>
            </div>
            <Bar value={agentIntensity} max={20} color="#8b5cf6" />
          </div>
          <div>
            <div className="flex justify-between text-xs text-gray-600 mb-1.5">
              <span>MCP活用 (MCP/session)</span>
              <span className="font-semibold">{mcpIntensity.toFixed(1)}</span>
            </div>
            <Bar value={mcpIntensity} max={20} color="#06b6d4" />
          </div>
        </div>

        {/* C: 前期比トレンド */}
        {trend && (
          <div className="flex flex-col gap-2 shrink-0 min-w-[130px] border-l border-gray-100 pl-6">
            <span className="text-xs font-semibold text-gray-500 mb-1">前期比</span>
            <TrendBadge value={trend.skill}    label="Skill" />
            <TrendBadge value={trend.subagent} label="Subagent" />
            <TrendBadge value={trend.mcp}      label="MCP" />
            <TrendBadge value={trend.messages} label="Messages" />
          </div>
        )}
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/MasteryCard.tsx
git commit -m "feat: add MasteryCard component with gauge, automation rate, and trend"
```

---

## Task 5: DashboardPage 全面リニューアル

**Files:**
- Modify: `frontend/src/pages/DashboardPage.tsx`

**Step 1: DashboardPage を新デザインに差し替え**

```typescript
import { useEffect, useState } from 'react'
import { api, type Summary, type DailyEntry } from '../lib/queries'
import { StatCard } from '../components/StatCard'
import { MasteryCard } from '../components/MasteryCard'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend,
} from 'recharts'

interface Props {
  days: number
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function calcTrend(curr: number, prev: number): number | undefined {
  if (prev === 0) return undefined
  return ((curr - prev) / prev) * 100
}

interface PeriodStats {
  sessions: number
  cost: number
  messages: number
  skillUses: number
  subagentUses: number
  mcpUses: number
}

function sumDaily(entries: DailyEntry[]): PeriodStats {
  return entries.reduce(
    (acc, e) => ({
      sessions:     acc.sessions     + e.sessions,
      cost:         acc.cost         + e.estimated_cost_usd,
      messages:     acc.messages     + (e.messages ?? 0),
      skillUses:    acc.skillUses    + (e.skill_uses ?? 0),
      subagentUses: acc.subagentUses + (e.subagent_uses ?? 0),
      mcpUses:      acc.mcpUses      + (e.mcp_uses ?? 0),
    }),
    { sessions: 0, cost: 0, messages: 0, skillUses: 0, subagentUses: 0, mcpUses: 0 }
  )
}

function calcMastery(summary: Summary) {
  const { total_sessions, total_skill_uses, total_subagent_uses, total_mcp_uses, total_messages } = summary
  if (total_sessions === 0 || total_messages === 0) {
    return { score: 0, automationRate: 0, agentIntensity: 0, mcpIntensity: 0 }
  }
  const automationRate = ((total_skill_uses + total_subagent_uses + total_mcp_uses) / total_messages) * 100
  const agentIntensity = total_subagent_uses / total_sessions
  const mcpIntensity   = total_mcp_uses / total_sessions

  // スコア: 自動化率(40%) + エージェント活用(30%) + MCP活用(30%)
  const autoScore    = Math.min(automationRate / 100 * 100, 100) * 0.4
  const agentScore   = Math.min(agentIntensity / 20 * 100, 100) * 0.3
  const mcpScore     = Math.min(mcpIntensity / 20 * 100, 100) * 0.3
  const score = Math.round(autoScore + agentScore + mcpScore)

  return { score, automationRate, agentIntensity, mcpIntensity }
}

export function DashboardPage({ days }: Props) {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [allDaily, setAllDaily] = useState<DailyEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([api.summary(), api.daily(days === 9999 ? 3650 : days * 2)]).then(([s, d]) => {
      setSummary(s)
      setAllDaily(d)
      setLoading(false)
    })
  }, [days])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Loading...</div>
    )
  }
  if (!summary) return <div className="text-red-500">Failed to load</div>

  const isAll = days === 9999
  const currentDaily = isAll ? allDaily : allDaily.slice(-days)
  const prevDaily    = isAll ? [] : allDaily.slice(0, -days)

  const current = sumDaily(currentDaily)
  const prev    = sumDaily(prevDaily)

  const spark = (key: keyof DailyEntry) =>
    currentDaily.map(e => (e[key] as number) ?? 0)

  const trends = {
    skill:    isAll ? undefined : calcTrend(current.skillUses,    prev.skillUses),
    subagent: isAll ? undefined : calcTrend(current.subagentUses, prev.subagentUses),
    mcp:      isAll ? undefined : calcTrend(current.mcpUses,      prev.mcpUses),
    messages: isAll ? undefined : calcTrend(current.messages,     prev.messages),
    sessions: isAll ? undefined : calcTrend(current.sessions,     prev.sessions),
    cost:     isAll ? undefined : calcTrend(current.cost,         prev.cost),
  }

  const mastery = calcMastery(summary)
  const chartData = isAll ? allDaily : allDaily.slice(-Math.min(days, allDaily.length))

  return (
    <div className="flex flex-col gap-6">
      {/* Overview heading */}
      <div>
        <h2 className="text-base font-semibold text-gray-800">Overview</h2>
        {!isAll && (
          <p className="text-xs text-gray-400 mt-0.5">直近 {days} 日間のデータ</p>
        )}
      </div>

      {/* 6 Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard
          title="Skill実行数"
          value={isAll ? fmtNum(summary.total_skill_uses) : fmtNum(current.skillUses)}
          trend={trends.skill}
          sparkData={spark('skill_uses')}
          accentColor="#ec4899"
          badge={{ label: 'Skill', color: '#ec4899' }}
        />
        <StatCard
          title="Subagent数"
          value={isAll ? fmtNum(summary.total_subagent_uses) : fmtNum(current.subagentUses)}
          trend={trends.subagent}
          sparkData={spark('subagent_uses')}
          accentColor="#8b5cf6"
          badge={{ label: 'Agent', color: '#8b5cf6' }}
        />
        <StatCard
          title="MCP呼び出し"
          value={isAll ? fmtNum(summary.total_mcp_uses) : fmtNum(current.mcpUses)}
          trend={trends.mcp}
          sparkData={spark('mcp_uses')}
          accentColor="#06b6d4"
          badge={{ label: 'MCP', color: '#06b6d4' }}
        />
        <StatCard
          title="メッセージ"
          value={isAll ? fmtNum(summary.total_messages) : fmtNum(current.messages)}
          trend={trends.messages}
          sparkData={spark('messages')}
          accentColor="#f59e0b"
        />
        <StatCard
          title="セッション"
          value={isAll ? summary.total_sessions.toLocaleString() : current.sessions.toLocaleString()}
          trend={trends.sessions}
          sparkData={spark('sessions')}
          accentColor="#10b981"
        />
        <StatCard
          title="コスト"
          value={`$${(isAll ? summary.estimated_cost_usd : current.cost).toFixed(2)}`}
          sub="USD"
          trend={trends.cost}
          sparkData={spark('estimated_cost_usd')}
          accentColor="#f97316"
        />
      </div>

      {/* 使いこなし度 */}
      <MasteryCard
        data={mastery}
        trend={isAll ? undefined : trends}
      />

      {/* Activity Breakdown Chart (Skill/Subagent/MCP 日別) */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">
          日別 活動内訳 (Skill / Subagent / MCP)
          {!isAll && ` — 直近 ${days} 日`}
        </h2>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} margin={{ top: 5, right: 16, left: 0, bottom: 5 }} barSize={6}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              tickFormatter={(d: string) => d.slice(5)}
              axisLine={false}
              tickLine={false}
            />
            <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={30} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="skill_uses"    name="Skill"    fill="#ec4899" radius={[2,2,0,0]} stackId="a" />
            <Bar dataKey="subagent_uses" name="Subagent" fill="#8b5cf6" radius={[2,2,0,0]} stackId="a" />
            <Bar dataKey="mcp_uses"      name="MCP"      fill="#06b6d4" radius={[2,2,0,0]} stackId="a" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Daily Cost chart */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">
          日別コスト (USD){!isAll && ` — 直近 ${days} 日`}
        </h2>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={chartData} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
            <defs>
              <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f97316" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              tickFormatter={(d: string) => d.slice(5)}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              tickFormatter={(v: number) => `$${v.toFixed(2)}`}
              axisLine={false}
              tickLine={false}
              width={50}
            />
            <Tooltip
              formatter={(v: number | undefined) =>
                v !== undefined ? [`$${v.toFixed(4)}`, 'コスト'] : ['', 'コスト']
              }
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
            />
            <Area
              type="monotone"
              dataKey="estimated_cost_usd"
              stroke="#f97316"
              strokeWidth={2}
              fill="url(#costGrad)"
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
```

**Step 2: TypeScript エラー確認**

```bash
cd frontend && npx tsc --noEmit 2>&1
```

Expected: エラーなし

**Step 3: dev server で目視確認**

```bash
cd frontend && npm run dev
# ブラウザで http://localhost:5173 を確認
# - 6枚のカードが表示される
# - 使いこなし度セクションが表示される
# - 日別チャートが表示される
```

**Step 4: Commit**

```bash
git add frontend/src/pages/DashboardPage.tsx
git commit -m "feat: redesign DashboardPage with Zenn-style cards and mastery section"
```

---

## Task 6: ToolsPage — MCP タブ追加

**Files:**
- Modify: `frontend/src/pages/ToolsPage.tsx`

**Step 1: Tools / MCP タブ切り替えに更新**

```typescript
import { useEffect, useState } from 'react'
import { api, type ToolEntry } from '../lib/queries'

const BAR_COLORS = ['#6366f1','#8b5cf6','#ec4899','#f43f5e','#f97316','#eab308','#22c55e','#14b8a6','#06b6d4','#3b82f6']

function RankingTable({ items, title }: { items: ToolEntry[]; title: string }) {
  const max = items[0]?.count ?? 1
  if (items.length === 0) {
    return <p className="text-gray-400 text-sm px-6 py-8">{title}のデータがありません。</p>
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-gray-100">
          <th className="text-left px-6 py-3 font-medium text-gray-500 w-12">順位</th>
          <th className="text-left px-6 py-3 font-medium text-gray-500">ツール名</th>
          <th className="text-right px-6 py-3 font-medium text-gray-500 w-32">利用回数</th>
        </tr>
      </thead>
      <tbody>
        {items.map((t, i) => {
          const barPct = (t.count / max) * 100
          const color = BAR_COLORS[i % BAR_COLORS.length]
          return (
            <tr key={t.tool_name} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
              <td className="px-6 py-3 text-gray-400 text-xs">{i + 1}</td>
              <td className="px-6 py-3">
                <span className="font-mono text-gray-900 text-xs">{t.tool_name}</span>
                <div className="mt-1.5 h-1.5 bg-gray-100 rounded-full w-48">
                  <div
                    className="h-1.5 rounded-full transition-all"
                    style={{ width: `${barPct}%`, backgroundColor: color }}
                  />
                </div>
              </td>
              <td className="px-6 py-3 text-right font-bold text-gray-900">
                {t.count.toLocaleString()}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export function ToolsPage() {
  const [tools, setTools]       = useState<ToolEntry[]>([])
  const [mcpTools, setMcpTools] = useState<ToolEntry[]>([])
  const [tab, setTab]           = useState<'tools' | 'mcp'>('tools')
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    Promise.all([api.tools(), api.mcpTools()]).then(([t, m]) => {
      setTools(t)
      setMcpTools(m)
      setLoading(false)
    })
  }, [])

  if (loading) {
    return <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Loading...</div>
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-4">
          <h2 className="text-sm font-semibold text-gray-700 mr-4">ツール利用ランキング</h2>
          {(['tools', 'mcp'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`text-xs font-semibold px-3 py-1 rounded-full transition-colors ${
                tab === t
                  ? t === 'mcp'
                    ? 'bg-cyan-100 text-cyan-700'
                    : 'bg-indigo-100 text-indigo-700'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {t === 'tools' ? 'Built-in Tools' : 'MCP Tools'}
            </button>
          ))}
        </div>
        <RankingTable
          items={tab === 'tools' ? tools : mcpTools}
          title={tab === 'tools' ? 'ツール' : 'MCPツール'}
        />
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add frontend/src/pages/ToolsPage.tsx
git commit -m "feat: add MCP tab to ToolsPage"
```

---

## Task 7: ビルド確認 & Supabase migration 適用

**Step 1: フロントエンドをビルド**

```bash
cd frontend && npm run build 2>&1
```

Expected: ビルドエラーなし

**Step 2: Supabase migration を適用（未適用の場合）**

Supabase Studio の SQL Editor で `supabase/migrations/002_mcp_and_extended_stats.sql` の内容を実行する。

**Step 3: 本番データで動作確認**

```bash
cd frontend && npm run dev
# ブラウザで確認:
# 1. ダッシュボードの6カードが正しい数値を表示
# 2. 使いこなし度ゲージが表示される
# 3. 日別活動内訳チャートにデータが出る
# 4. ツールページのMCPタブにデータが出る
```

**Step 4: Final commit**

```bash
git add -A
git commit -m "chore: final build verification for dashboard redesign"
```
