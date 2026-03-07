import { useEffect, useState } from 'react'
import { api, type SkillEntry, type SubagentEntry } from '../lib/queries'

const RANK_COLORS = ['#f97316', '#6b7280', '#92400e'] // 1位=orange, 2位=gray, 3位=bronze

export function SkillsPage() {
  const [skills, setSkills] = useState<SkillEntry[]>([])
  const [subagents, setSubagents] = useState<SubagentEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([api.skills(), api.subagents()]).then(([s, a]) => {
      setSkills(s)
      setSubagents(a)
      setLoading(false)
    })
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
        Loading...
      </div>
    )
  }

  const totalSkills = skills.reduce((a, s) => a + s.count, 0)
  const totalSubagents = subagents.reduce((a, s) => a + s.count, 0)

  return (
    <div className="flex flex-col gap-6">
      {/* Skill Ranking Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">スキル利用ランキング</h2>
        </div>
        {skills.length === 0 ? (
          <p className="text-gray-400 text-sm px-6 py-8">スキル利用データがありません。</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-6 py-3 font-medium text-gray-500 w-12">順位</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">スキル名</th>
                <th className="text-right px-6 py-3 font-medium text-gray-500 w-32">利用回数</th>
                <th className="text-right px-6 py-3 font-medium text-gray-500 w-24">割合</th>
              </tr>
            </thead>
            <tbody>
              {skills.map((s, i) => {
                const isTop3 = i < 3
                const pct = totalSkills > 0 ? ((s.count / totalSkills) * 100).toFixed(1) : '0.0'
                return (
                  <tr
                    key={s.skill_name}
                    className={`border-b border-gray-50 last:border-0 transition-colors ${
                      i === 0 ? 'bg-orange-50 hover:bg-orange-100' :
                      i === 2 ? 'bg-amber-50/50 hover:bg-amber-50' :
                      'hover:bg-gray-50'
                    }`}
                  >
                    <td className="px-6 py-3">
                      <span
                        className="text-sm font-bold"
                        style={{ color: isTop3 ? RANK_COLORS[i] : '#9ca3af' }}
                      >
                        {i + 1}
                      </span>
                    </td>
                    <td className="px-6 py-3 font-mono text-gray-900 text-xs">{s.skill_name}</td>
                    <td className="px-6 py-3 text-right font-bold text-gray-900">{s.count.toLocaleString()}</td>
                    <td className="px-6 py-3 text-right text-gray-400 text-xs">{pct}%</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Subagent Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">サブエージェント タイプ別</h2>
        </div>
        {subagents.length === 0 ? (
          <p className="text-gray-400 text-sm px-6 py-8">サブエージェント利用データがありません。</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-6 py-3 font-medium text-gray-500">タイプ</th>
                <th className="text-right px-6 py-3 font-medium text-gray-500 w-32">利用回数</th>
                <th className="text-right px-6 py-3 font-medium text-gray-500 w-40">割合</th>
              </tr>
            </thead>
            <tbody>
              {subagents.map((s) => {
                const pct = totalSubagents > 0 ? (s.count / totalSubagents) * 100 : 0
                return (
                  <tr key={s.subagent_type} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                    <td className="px-6 py-3 font-mono text-gray-900 text-xs">{s.subagent_type}</td>
                    <td className="px-6 py-3 text-right font-bold text-gray-900">{s.count.toLocaleString()}</td>
                    <td className="px-6 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-24 bg-gray-100 rounded-full h-1.5">
                          <div
                            className="bg-indigo-500 h-1.5 rounded-full"
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-400 w-10 text-right">{pct.toFixed(1)}%</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
