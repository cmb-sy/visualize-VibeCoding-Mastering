import type { Summary } from '../lib/queries'

// シグモイド関数: x/(x+c) — 上限なし、cでスケールを調整
function sigmoid(x: number, c: number): number {
  if (c <= 0) return 0
  return (x / (x + c)) * 100
}

interface Props {
  summary: Summary
  trend?: {
    skill: number | undefined
    subagent: number | undefined
    mcp: number | undefined
    messages: number | undefined
    sessions: number | undefined
  }
}

function GaugeRing({ score, label, sub }: { score: number; label: string; sub: string }) {
  const r = 40
  const circ = 2 * Math.PI * r
  const filled = Math.min(score / 100, 1) * circ
  const color = score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444'
  return (
    <div className="flex flex-col items-center gap-1 shrink-0">
      <svg width="104" height="104" viewBox="0 0 104 104" aria-label={`${label} ${Math.round(score)}/100`}>
        <title>{label} {Math.round(score)}/100</title>
        <circle cx="52" cy="52" r={r} fill="none" stroke="#f3f4f6" strokeWidth="9" />
        <circle
          cx="52" cy="52" r={r}
          fill="none" stroke={color} strokeWidth="9"
          strokeDasharray={`${filled} ${circ - filled}`}
          strokeLinecap="round"
          transform="rotate(-90 52 52)"
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
        <text x="52" y="57" textAnchor="middle" fontSize="20" fontWeight="bold" fill="#111827">
          {Math.round(score)}
        </text>
      </svg>
      <span className="text-[11px] text-gray-400">{label}</span>
      <span className="text-[10px] text-gray-300">{sub}</span>
    </div>
  )
}

function BarRow({
  label, value, displayValue, color, sub,
}: {
  label: string; value: number; displayValue: string; color: string; sub?: string
}) {
  const pct = Math.min(value, 100)
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-600 mb-1">
        <span>{label}{sub && <span className="text-gray-400 ml-1">{sub}</span>}</span>
        <span className="font-semibold tabular-nums">{displayValue}</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-1.5">
        <div className="h-1.5 rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}

function TrendBadge({ value, label }: { value: number | undefined; label: string }) {
  if (value === undefined) return null
  return (
    <div className="flex items-center justify-between text-xs py-0.5">
      <span className="text-gray-400">{label}</span>
      <span className={`font-semibold tabular-nums ${value >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
        {value >= 0 ? '↑' : '↓'}{Math.abs(value).toFixed(1)}%
      </span>
    </div>
  )
}


function SectionTitle({ label, desc }: { label: string; desc: string }) {
  return (
    <div className="flex items-baseline gap-2 mb-3">
      <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{label}</span>
      <span className="text-xs text-gray-400">{desc}</span>
    </div>
  )
}

export function MasteryCard({ summary, trend }: Props) {
  const s = summary.total_sessions

  // A: 量スコア計算
  const skillPerSession    = s > 0 ? summary.total_skill_uses / s : 0
  const subagentPerSession = s > 0 ? summary.total_subagent_uses / s : 0
  const mcpPerSession      = s > 0 ? summary.total_mcp_uses / s : 0
  const skillScore         = sigmoid(skillPerSession, 3)
  const subagentScore      = sigmoid(subagentPerSession, 5)
  const mcpScore           = sigmoid(mcpPerSession, 5)
  const compositeA         = (skillScore + subagentScore + mcpScore) / 3

  // C: 効率スコア計算
  const totalActions       = summary.total_tool_uses + summary.total_skill_uses
  const actionsPerSession  = s > 0 ? totalActions / s : 0
  const scoreC             = sigmoid(actionsPerSession, 20)
  const breakdownC = [
    { label: 'MCP',      value: summary.total_mcp_uses,      color: '#06b6d4' },
    { label: 'Skill',    value: summary.total_skill_uses,    color: '#ec4899' },
    { label: 'Subagent', value: summary.total_subagent_uses, color: '#8b5cf6' },
  ]
  const maxValC = Math.max(...breakdownC.map(b => b.value), 1)

  // D: 比率計算
  const am           = summary.assistant_messages
  const skillRate    = am > 0 ? (summary.total_skill_uses / am) * 100 : 0
  const subagentRate = am > 0 ? (summary.total_subagent_uses / am) * 100 : 0
  const mcpRate      = am > 0 ? (summary.total_mcp_uses / am) * 100 : 0

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
      <h2 className="text-sm font-semibold text-gray-700 mb-5">使いこなし度</h2>

      <div className="flex flex-col gap-7">

        {/* A: 量 */}
        <div>
          <SectionTitle label="A 量" desc="機能をどれだけ多く使ったか（シグモイドスコア）" />
          {s === 0 ? (
            <p className="text-gray-400 text-sm">データがありません</p>
          ) : (
            <div className="flex gap-6 items-start">
              <GaugeRing score={compositeA} label="量スコア" sub="x/(x+c) 平均" />
              <div className="flex-1 flex flex-col gap-3">
                <BarRow label="Skill" sub="(回/session)" value={skillScore} displayValue={`${skillPerSession.toFixed(1)} 回`} color="#ec4899" />
                <BarRow label="Subagent" sub="(回/session)" value={subagentScore} displayValue={`${subagentPerSession.toFixed(1)} 回`} color="#8b5cf6" />
                <BarRow label="MCP" sub="(回/session)" value={mcpScore} displayValue={`${mcpPerSession.toFixed(1)} 回`} color="#06b6d4" />
              </div>
              {trend && (
                <div className="shrink-0 min-w-[110px] border-l border-gray-100 pl-5 flex flex-col gap-1">
                  <span className="text-[11px] font-semibold text-gray-400 mb-1">前期比</span>
                  <TrendBadge value={trend.skill}    label="Skill" />
                  <TrendBadge value={trend.subagent} label="Subagent" />
                  <TrendBadge value={trend.mcp}      label="MCP" />
                  <TrendBadge value={trend.sessions} label="Session" />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-gray-100" />

        {/* C: 効率 */}
        <div>
          <SectionTitle label="C 効率" desc="1セッションあたりの作業量" />
          {s === 0 ? (
            <p className="text-gray-400 text-sm">データがありません</p>
          ) : (
            <div className="flex gap-6 items-start">
              <GaugeRing score={scoreC} label="効率スコア" sub="20回/session→50点" />
              <div className="flex-1 flex flex-col gap-3">
                <div className="text-sm font-semibold text-gray-700 tabular-nums">
                  {actionsPerSession.toFixed(1)} <span className="text-xs font-normal text-gray-400">アクション / session</span>
                </div>
                <p className="text-xs text-gray-400 -mt-1">1セッションでClaudeに何件の作業をさせたかを測ります。</p>
                <div className="flex flex-col gap-2 mt-1">
                  {breakdownC.map(b => (
                    <BarRow
                      key={b.label}
                      label={b.label}
                      value={(b.value / maxValC) * 100}
                      displayValue={`${b.value.toLocaleString()} 回`}
                      color={b.color}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-gray-100" />

        {/* D: 比率 */}
        <div>
          <SectionTitle label="D 比率" desc="メッセージ比の活用率（Zenn準拠）" />
          {am === 0 ? (
            <p className="text-gray-400 text-sm">データがありません</p>
          ) : (
            <>
              <p className="text-xs text-gray-400 mb-4">
                分母: assistantメッセージ数（{am.toLocaleString()} 件）。Claudeの応答1件あたり何回その機能を使ったかを示します。
              </p>
              <div className="flex flex-col gap-4">
                {[
                  { label: 'Skill活用率',    value: skillRate,    color: '#ec4899', badge: 'Skill' },
                  { label: 'Subagent活用率', value: subagentRate, color: '#8b5cf6', badge: 'Agent' },
                  { label: 'MCP活用率',      value: mcpRate,      color: '#06b6d4', badge: 'MCP'   },
                ].map(r => (
                  <div key={r.label}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2 text-sm text-gray-700">
                        <span
                          className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                          style={{ backgroundColor: r.color + '20', color: r.color }}
                        >
                          {r.badge}
                        </span>
                        {r.label}
                      </div>
                      <span className="text-xl font-bold tabular-nums" style={{ color: r.color }}>
                        {r.value.toFixed(1)}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-3">
                      <div
                        className="h-3 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(r.value, 100)}%`, backgroundColor: r.color }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  )
}
