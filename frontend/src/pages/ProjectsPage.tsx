import { useEffect, useState } from 'react'
import { api, type ProjectEntry } from '../api'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'

const COLORS = ['#6366f1','#8b5cf6','#ec4899','#f43f5e','#f97316','#eab308','#22c55e','#14b8a6','#06b6d4','#3b82f6']

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

export function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.projects().then(d => { setProjects(d); setLoading(false) })
  }, [])

  if (loading) return <div className="text-gray-500">Loading...</div>

  const top10 = projects.slice(0, 10)

  return (
    <div className="flex flex-col gap-8">
      <div className="bg-white rounded-xl shadow p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Sessions by Project (top 10)</h2>
        <ResponsiveContainer width="100%" height={Math.max(250, top10.length * 36)}>
          <BarChart data={top10} layout="vertical" margin={{ top: 5, right: 30, left: 120, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11 }} />
            <YAxis dataKey="project_name" type="category" tick={{ fontSize: 11 }} width={120} />
            <Tooltip />
            <Bar dataKey="sessions" radius={[0, 4, 4, 0]}>
              {top10.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">#</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Project</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Sessions</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Input Tokens</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Output Tokens</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p, i) => (
              <tr key={p.project_path} className="border-b last:border-0 hover:bg-gray-50">
                <td className="px-4 py-2 text-gray-400">{i + 1}</td>
                <td className="px-4 py-2">
                  <div className="font-medium text-gray-900">{p.project_name}</div>
                  <div className="text-xs text-gray-400 truncate max-w-xs">{p.project_path}</div>
                </td>
                <td className="px-4 py-2 text-right text-gray-900">{p.sessions}</td>
                <td className="px-4 py-2 text-right text-gray-500">{fmtTokens(p.input_tokens)}</td>
                <td className="px-4 py-2 text-right text-gray-500">{fmtTokens(p.output_tokens)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
