interface MasteryData {
  score: number
  automationRate: number
  agentIntensity: number
  mcpIntensity: number
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
