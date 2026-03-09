// frontend/src/pages/EfficiencyPage.tsx
import { useEffect, useState, useMemo } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
  AreaChart, Area, ScatterChart, Scatter, Cell,
  BarChart,
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
    { label: '<1x',   min: 0,  max: 1,        count: 0, color: '#6366f1' },
    { label: '1–2x',  min: 1,  max: 2,        count: 0, color: '#6366f1' },
    { label: '2–5x',  min: 2,  max: 5,        count: 0, color: '#6366f1' },
    { label: '5–10x', min: 5,  max: 10,       count: 0, color: '#6366f1' },
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

  // KPI: average tokens / session (直近30セッション)
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
                formatter={(value: number | undefined, name: string | undefined) => [
                  value == null ? '' : name === 'セッション数' ? value : value.toFixed(2),
                  name ?? '',
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
                formatter={(v: number | undefined) => [v == null ? '' : `${v.toFixed(1)}%`, 'Cache ヒット率']}
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
                formatter={(v: number | undefined) => [v ?? '', 'セッション数']}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
              />
              <Bar dataKey="count" name="セッション数" radius={[3, 3, 0, 0]}>
                {growthBins.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
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
