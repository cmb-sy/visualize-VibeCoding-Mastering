import { useEffect, useState } from 'react'
import { api, type ToolEntry } from '../api'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'

const COLORS = ['#6366f1','#8b5cf6','#ec4899','#f43f5e','#f97316','#eab308','#22c55e','#14b8a6','#06b6d4','#3b82f6']

export function ToolsPage() {
  const [tools, setTools] = useState<ToolEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.tools().then(d => { setTools(d); setLoading(false) })
  }, [])

  if (loading) return <div className="text-gray-500">Loading...</div>

  return (
    <div className="flex flex-col gap-8">
      <div className="bg-white rounded-xl shadow p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Tool Usage</h2>
        <ResponsiveContainer width="100%" height={Math.max(300, tools.length * 36)}>
          <BarChart data={tools} layout="vertical" margin={{ top: 5, right: 30, left: 60, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11 }} />
            <YAxis dataKey="tool_name" type="category" tick={{ fontSize: 12 }} width={80} />
            <Tooltip />
            <Bar dataKey="count" radius={[0, 4, 4, 0]}>
              {tools.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">#</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Tool</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Count</th>
            </tr>
          </thead>
          <tbody>
            {tools.map((t, i) => (
              <tr key={t.tool_name} className="border-b last:border-0 hover:bg-gray-50">
                <td className="px-4 py-2 text-gray-400">{i + 1}</td>
                <td className="px-4 py-2 font-mono text-gray-900">{t.tool_name}</td>
                <td className="px-4 py-2 text-right text-gray-900">{t.count.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
