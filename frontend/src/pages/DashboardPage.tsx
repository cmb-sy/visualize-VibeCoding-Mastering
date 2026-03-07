import { useEffect, useState } from 'react'
import { api, type Summary, type DailyEntry } from '../lib/queries'
import { StatCard } from '../components/StatCard'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
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
  inputTokens: number
  outputTokens: number
}

function sumDaily(entries: DailyEntry[]): PeriodStats {
  return entries.reduce(
    (acc, e) => ({
      sessions: acc.sessions + e.sessions,
      cost: acc.cost + e.estimated_cost_usd,
      inputTokens: acc.inputTokens + e.input_tokens,
      outputTokens: acc.outputTokens + e.output_tokens,
    }),
    { sessions: 0, cost: 0, inputTokens: 0, outputTokens: 0 }
  )
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
      <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
        Loading...
      </div>
    )
  }
  if (!summary) return <div className="text-red-500">Failed to load</div>

  // 期間分割: 直近 days 日 vs 前期間
  const isAll = days === 9999
  const currentDaily = isAll ? allDaily : allDaily.slice(-days)
  const prevDaily = isAll ? [] : allDaily.slice(0, -days)

  const current = sumDaily(currentDaily)
  const prev = sumDaily(prevDaily)

  // Sparkline データ（直近days日の日別値）
  const spark = (key: keyof DailyEntry) =>
    currentDaily.map(e => (e[key] as number) ?? 0)

  const sessionTrend = isAll ? undefined : calcTrend(current.sessions, prev.sessions)
  const costTrend = isAll ? undefined : calcTrend(current.cost, prev.cost)
  const tokenTrend = isAll ? undefined : calcTrend(
    current.inputTokens + current.outputTokens,
    prev.inputTokens + prev.outputTokens
  )

  // チャート表示用データ（直近 days 日 or 全期間）
  const chartData = isAll
    ? allDaily
    : allDaily.slice(-Math.min(days, allDaily.length))

  return (
    <div className="flex flex-col gap-6">
      {/* Overview heading */}
      <div>
        <h2 className="text-base font-semibold text-gray-800">Overview</h2>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard
          title="セッション"
          value={isAll ? summary.total_sessions.toLocaleString() : current.sessions.toLocaleString()}
          trend={sessionTrend}
          sparkData={spark('sessions')}
          accentColor="#10b981"
        />
        <StatCard
          title="コスト"
          value={`$${(isAll ? summary.estimated_cost_usd : current.cost).toFixed(2)}`}
          sub="USD"
          trend={costTrend}
          sparkData={spark('estimated_cost_usd')}
          accentColor="#f59e0b"
        />
        <StatCard
          title="トークン (In)"
          value={fmtTokens(isAll ? summary.total_input_tokens : current.inputTokens)}
          trend={tokenTrend}
          sparkData={spark('input_tokens')}
          accentColor="#6366f1"
        />
        <StatCard
          title="トークン (Out)"
          value={fmtTokens(isAll ? summary.total_output_tokens : current.outputTokens)}
          sparkData={spark('output_tokens')}
          accentColor="#8b5cf6"
        />
        <StatCard
          title="スキル実行"
          value={fmtNum(summary.total_skill_uses)}
          accentColor="#ec4899"
        />
        <StatCard
          title="サブエージェント"
          value={fmtNum(summary.total_subagent_uses)}
          accentColor="#06b6d4"
        />
      </div>

      {/* Daily Cost chart */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">
          日別コスト (USD)
          {!isAll && ` — 直近 ${days} 日`}
        </h2>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={chartData} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
            <defs>
              <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
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
              stroke="#f59e0b"
              strokeWidth={2}
              fill="url(#costGrad)"
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Daily Sessions chart */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">
          日別セッション数
          {!isAll && ` — 直近 ${days} 日`}
        </h2>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={chartData} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
            <defs>
              <linearGradient id="sessGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
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
              axisLine={false}
              tickLine={false}
              width={30}
            />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
            />
            <Area
              type="monotone"
              dataKey="sessions"
              stroke="#10b981"
              strokeWidth={2}
              fill="url(#sessGrad)"
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
