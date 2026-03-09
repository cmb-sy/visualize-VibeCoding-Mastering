import { useState } from 'react'
import type { Summary } from '../lib/queries'

// シグモイド関数: x/(x+c) — 上限なし、cでスケールを調整
// x=0 → 0, x=c → 50, x=2c → 67, x=3c → 75 (×100後)
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

type Tab = 'A' | 'B' | 'C' | 'D'

function GaugeRing({ score }: { score: number }) {
  const r = 40
  const circ = 2 * Math.PI * r
  const filled = Math.min(score / 100, 1) * circ
  const color = score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444'
  return (
    <svg width="104" height="104" viewBox="0 0 104 104" aria-label={`活用スコア ${Math.round(score)}/100`}>
      <title>活用スコア {Math.round(score)}/100</title>
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

function StatBox({ value, label, color }: { value: string | number; label: string; color: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-gray-100 p-4 gap-1">
      <span className="text-2xl font-bold tabular-nums" style={{ color }}>{value}</span>
      <span className="text-[11px] text-gray-400 text-center leading-tight">{label}</span>
    </div>
  )
}

// ========== Tab A: 量ベース ==========
function TabA({ summary, trend }: { summary: Summary; trend: Props['trend'] }) {
  const s = summary.total_sessions
  if (s === 0) return <p className="text-gray-400 text-sm py-4">データがありません</p>

  const skillPerSession    = summary.total_skill_uses / s
  const subagentPerSession = summary.total_subagent_uses / s
  const mcpPerSession      = summary.total_mcp_uses / s

  // sigmoid: c=3 for skill (3/session→50%), c=5 for subagent/mcp (5/session→50%)
  const skillScore    = sigmoid(skillPerSession,    3)
  const subagentScore = sigmoid(subagentPerSession, 5)
  const mcpScore      = sigmoid(mcpPerSession,      5)
  const composite     = (skillScore + subagentScore + mcpScore) / 3

  return (
    <div className="flex gap-6 items-start">
      <div className="flex flex-col items-center gap-1 shrink-0">
        <GaugeRing score={composite} />
        <span className="text-[11px] text-gray-400">量スコア</span>
        <span className="text-[10px] text-gray-300">x/(x+c) 平均</span>
      </div>
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
  )
}

// ========== Tab B: 多様性ベース ==========
function TabB({ summary }: { summary: Summary }) {
  const items = [
    { value: summary.distinct_skills,          label: 'Skill\n種類数',         color: '#ec4899' },
    { value: summary.distinct_subagent_types,  label: 'Subagent\nタイプ数',    color: '#8b5cf6' },
    { value: summary.distinct_mcp_tools,       label: 'MCPツール\n種類数',      color: '#06b6d4' },
    { value: summary.distinct_tools,           label: 'Built-in\nツール種類数', color: '#6366f1' },
  ]
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-gray-400">使っている機能の「幅」を測ります。同じ機能を繰り返すより、多様な機能を活用しているほど高くなります。</p>
      <div className="grid grid-cols-4 gap-3">
        {items.map(it => (
          <StatBox key={it.label} value={it.value} label={it.label} color={it.color} />
        ))}
      </div>
    </div>
  )
}

// ========== Tab C: 効率ベース ==========
function TabC({ summary }: { summary: Summary }) {
  const s = summary.total_sessions
  if (s === 0) return <p className="text-gray-400 text-sm py-4">データがありません</p>

  // 全アクション = tool_uses (MCP含む、Task含む) + skill_uses
  const totalActions = summary.total_tool_uses + summary.total_skill_uses
  const actionsPerSession = totalActions / s
  const score = sigmoid(actionsPerSession, 20) // 20回/session→50点

  const breakdown = [
    { label: 'Built-in ツール', value: summary.total_non_mcp_tool_uses, color: '#6366f1' },
    { label: 'MCP',             value: summary.total_mcp_uses,          color: '#06b6d4' },
    { label: 'Skill',           value: summary.total_skill_uses,        color: '#ec4899' },
    { label: 'Subagent (Agent tool)', value: summary.total_subagent_uses, color: '#8b5cf6' },
  ]
  const maxVal = Math.max(...breakdown.map(b => b.value), 1)

  return (
    <div className="flex gap-6 items-start">
      <div className="flex flex-col items-center gap-1 shrink-0">
        <GaugeRing score={score} />
        <span className="text-[11px] text-gray-400">効率スコア</span>
        <span className="text-[10px] text-gray-300">20回/session→50点</span>
      </div>
      <div className="flex-1 flex flex-col gap-3">
        <div className="text-sm font-semibold text-gray-700 tabular-nums">
          {actionsPerSession.toFixed(1)} <span className="text-xs font-normal text-gray-400">アクション / session</span>
        </div>
        <p className="text-xs text-gray-400 -mt-1">1セッションでClaudeに何件の作業をさせたかを測ります。</p>
        <div className="flex flex-col gap-2 mt-1">
          {breakdown.map(b => (
            <BarRow
              key={b.label}
              label={b.label}
              value={(b.value / maxVal) * 100}
              displayValue={`${b.value.toLocaleString()} 回`}
              color={b.color}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ========== Tab D: Zenn準拠 (比率) ==========
function TabD({ summary }: { summary: Summary }) {
  const am = summary.assistant_messages
  if (am === 0) return <p className="text-gray-400 text-sm py-4">データがありません</p>

  const skillRate    = (summary.total_skill_uses    / am) * 100
  const subagentRate = (summary.total_subagent_uses / am) * 100
  const mcpRate      = (summary.total_mcp_uses      / am) * 100

  const rows = [
    { label: 'Skill活用率',    value: skillRate,    color: '#ec4899', badge: 'Skill' },
    { label: 'Subagent活用率', value: subagentRate, color: '#8b5cf6', badge: 'Agent' },
    { label: 'MCP活用率',      value: mcpRate,      color: '#06b6d4', badge: 'MCP'   },
  ]

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-gray-400">
        分母: assistantメッセージ数（{am.toLocaleString()} 件）。
        Claudeの応答1件あたり何回その機能を使ったかを示します。
      </p>
      <div className="flex flex-col gap-4">
        {rows.map(r => (
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
    </div>
  )
}

// ========== Main ==========

const TABS: { id: Tab; label: string; desc: string }[] = [
  { id: 'A', label: 'A 量',    desc: '機能をどれだけ多く使ったか（シグモイドスコア）' },
  { id: 'B', label: 'B 多様性', desc: '何種類の機能を使ったか' },
  { id: 'C', label: 'C 効率',  desc: '1セッションあたりの作業量' },
  { id: 'D', label: 'D 比率',  desc: 'メッセージ比の活用率（Zenn準拠）' },
]

export function MasteryCard({ summary, trend }: Props) {
  const [tab, setTab] = useState<Tab>('A')
  const current = TABS.find(t => t.id === tab)!

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">使いこなし度</h2>
          <p className="text-xs text-gray-400 mt-0.5">{current.desc}</p>
        </div>
        <div className="flex gap-1 bg-gray-50 rounded-lg p-1">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                tab === t.id ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-[120px]">
        {tab === 'A' && <TabA summary={summary} trend={trend} />}
        {tab === 'B' && <TabB summary={summary} />}
        {tab === 'C' && <TabC summary={summary} />}
        {tab === 'D' && <TabD summary={summary} />}
      </div>
    </div>
  )
}
