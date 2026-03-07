import { useEffect, useState } from 'react'
import { api, type ToolEntry } from '../lib/queries'

const BAR_COLORS = ['#6366f1','#8b5cf6','#ec4899','#f43f5e','#f97316','#eab308','#22c55e','#14b8a6','#06b6d4','#3b82f6']

export function ToolsPage() {
  const [tools, setTools] = useState<ToolEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.tools().then(d => { setTools(d); setLoading(false) })
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
        Loading...
      </div>
    )
  }

  const max = tools[0]?.count ?? 1

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">ツール利用ランキング</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-6 py-3 font-medium text-gray-500 w-12">順位</th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">ツール名</th>
              <th className="text-right px-6 py-3 font-medium text-gray-500 w-48">利用回数</th>
            </tr>
          </thead>
          <tbody>
            {tools.map((t, i) => {
              const barPct = (t.count / max) * 100
              const color = BAR_COLORS[i % BAR_COLORS.length]
              return (
                <tr key={t.tool_name} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-3 text-gray-400 text-xs">{i + 1}</td>
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-gray-900 text-xs">{t.tool_name}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 bg-gray-100 rounded-full w-48">
                      <div
                        className="h-1.5 rounded-full transition-all"
                        style={{ width: `${barPct}%`, backgroundColor: color }}
                      />
                    </div>
                  </td>
                  <td className="px-6 py-3 text-right font-bold text-gray-900">
                    {t.count.toLocaleString()}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
