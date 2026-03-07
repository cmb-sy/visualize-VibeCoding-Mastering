import { useEffect, useState } from 'react'
import { api, type ProjectEntry } from '../lib/queries'

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

const RANK_COLORS = ['#f97316', '#6b7280', '#92400e']

export function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.projects().then(d => { setProjects(d); setLoading(false) })
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
        Loading...
      </div>
    )
  }

  const maxSessions = projects[0]?.sessions ?? 1

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">プロジェクト別利用状況</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-6 py-3 font-medium text-gray-500 w-12">順位</th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">プロジェクト</th>
              <th className="text-right px-6 py-3 font-medium text-gray-500 w-24">セッション</th>
              <th className="text-right px-6 py-3 font-medium text-gray-500 w-28">入力 Token</th>
              <th className="text-right px-6 py-3 font-medium text-gray-500 w-28">出力 Token</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p, i) => {
              const barPct = (p.sessions / maxSessions) * 100
              const isTop3 = i < 3
              return (
                <tr
                  key={p.project_path}
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
                  <td className="px-6 py-3">
                    <div className="font-medium text-gray-900 text-xs">{p.project_name}</div>
                    <div className="text-xs text-gray-400 truncate max-w-xs mt-0.5">{p.project_path}</div>
                    <div className="mt-1.5 h-1 bg-gray-100 rounded-full w-48">
                      <div
                        className="h-1 rounded-full bg-indigo-500 transition-all"
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                  </td>
                  <td className="px-6 py-3 text-right font-bold text-gray-900">{p.sessions}</td>
                  <td className="px-6 py-3 text-right text-gray-500 text-xs">{fmtTokens(p.input_tokens)}</td>
                  <td className="px-6 py-3 text-right text-gray-500 text-xs">{fmtTokens(p.output_tokens)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
