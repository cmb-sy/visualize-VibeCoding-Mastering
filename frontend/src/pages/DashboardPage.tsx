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


export function DashboardPage({ days }: Props) {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [allDaily, setAllDaily] = useState<DailyEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    Promise.all([api.summary(), api.daily(days === 9999 ? 3650 : days * 2)])
      .then(([s, d]) => {
        setSummary(s)
        setAllDaily(d)
        setLoading(false)
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'データの取得に失敗しました')
        setLoading(false)
      })
  }, [days])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Loading...</div>
    )
  }
  if (error) return <div className="text-red-500 text-sm p-4">{error}</div>
  if (!summary) return <div className="text-red-500">Failed to load</div>

  const isAll = days === 9999
  const currentDaily = isAll ? allDaily : allDaily.slice(-days)
  const prevDaily    = isAll ? [] : allDaily.slice(0, -days)

  const current = sumDaily(currentDaily)
  const prev    = sumDaily(prevDaily)

  const spark = (key: Exclude<keyof DailyEntry, 'date'>) =>
    currentDaily.map(e => (e[key] as number) ?? 0)

  const trends = {
    skill:    isAll ? undefined : calcTrend(current.skillUses,    prev.skillUses),
    subagent: isAll ? undefined : calcTrend(current.subagentUses, prev.subagentUses),
    mcp:      isAll ? undefined : calcTrend(current.mcpUses,      prev.mcpUses),
    messages: isAll ? undefined : calcTrend(current.messages,     prev.messages),
    sessions: isAll ? undefined : calcTrend(current.sessions,     prev.sessions),
    cost:     isAll ? undefined : calcTrend(current.cost,         prev.cost),
  }

  const chartData = isAll ? allDaily : allDaily.slice(-Math.min(days, allDaily.length))

  return (
    <div className="flex flex-col gap-6">
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
        summary={summary}
        trend={isAll ? undefined : trends}
      />

      {/* Activity Breakdown Chart */}
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
            <Bar dataKey="skill_uses"    name="Skill"    fill="#ec4899" stackId="a" />
            <Bar dataKey="subagent_uses" name="Subagent" fill="#8b5cf6" stackId="a" />
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
