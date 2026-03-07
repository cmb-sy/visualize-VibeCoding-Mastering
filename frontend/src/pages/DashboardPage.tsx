import { useEffect, useState } from 'react'
import { api, type Summary, type DailyEntry } from '../lib/queries'
import { StatCard } from '../components/StatCard'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

export function DashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [daily, setDaily] = useState<DailyEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([api.summary(), api.daily(90)]).then(([s, d]) => {
      setSummary(s)
      setDaily(d)
      setLoading(false)
    })
  }, [])

  if (loading) return <div className="text-gray-500">Loading...</div>
  if (!summary) return <div className="text-red-500">Failed to load</div>

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Total Sessions" value={summary.total_sessions} />
        <StatCard
          title="Estimated Cost"
          value={`$${summary.estimated_cost_usd.toFixed(2)}`}
          sub="USD"
        />
        <StatCard
          title="Total Tokens"
          value={fmtTokens(summary.total_input_tokens + summary.total_output_tokens)}
          sub={`${fmtTokens(summary.total_input_tokens)} in / ${fmtTokens(summary.total_output_tokens)} out`}
        />
        <StatCard
          title="Tool / Skill / Agent"
          value={`${summary.total_tool_uses} / ${summary.total_skill_uses} / ${summary.total_subagent_uses}`}
          sub="uses"
        />
      </div>

      <div className="bg-white rounded-xl shadow p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Daily Cost (USD) – last 90 days</h2>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={daily} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d: string) => d.slice(5)} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `$${v.toFixed(3)}`} />
            <Tooltip formatter={(v: number | undefined) => v !== undefined ? [`$${v.toFixed(4)}`, 'Cost'] : ['', 'Cost']} />
            <Line type="monotone" dataKey="estimated_cost_usd" stroke="#6366f1" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-xl shadow p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Daily Sessions – last 90 days</h2>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={daily} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d: string) => d.slice(5)} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="sessions" stroke="#10b981" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
