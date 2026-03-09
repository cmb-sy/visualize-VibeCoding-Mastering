import { useEffect, useState } from 'react'
import { api, type ToolEntry } from '../lib/queries'

const BAR_COLORS = ['#6366f1','#8b5cf6','#ec4899','#f43f5e','#f97316','#eab308','#22c55e','#14b8a6','#06b6d4','#3b82f6']

function RankingTable({ items, title }: { items: ToolEntry[]; title: string }) {
  const max = items[0]?.count ?? 1
  if (items.length === 0) {
    return <p className="text-gray-400 text-sm px-6 py-8">{title}のデータがありません。</p>
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-gray-100">
          <th className="text-left px-6 py-3 font-medium text-gray-500 w-12">順位</th>
          <th className="text-left px-6 py-3 font-medium text-gray-500">ツール名</th>
          <th className="text-right px-6 py-3 font-medium text-gray-500 w-32">利用回数</th>
        </tr>
      </thead>
      <tbody>
        {items.map((t, i) => {
          const barPct = (t.count / max) * 100
          const color = BAR_COLORS[i % BAR_COLORS.length]
          return (
            <tr key={t.tool_name} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
              <td className="px-6 py-3 text-gray-400 text-xs">{i + 1}</td>
              <td className="px-6 py-3">
                <span className="font-mono text-gray-900 text-xs">{t.tool_name}</span>
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
  )
}

export function ToolsPage() {
  const [tools, setTools]       = useState<ToolEntry[]>([])
  const [mcpTools, setMcpTools] = useState<ToolEntry[]>([])
  const [tab, setTab]           = useState<'tools' | 'mcp'>('tools')
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    Promise.all([api.tools(), api.mcpTools()]).then(([t, m]) => {
      setTools(t)
      setMcpTools(m)
      setLoading(false)
    })
  }, [])

  if (loading) {
    return <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Loading...</div>
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-4">
          <h2 className="text-sm font-semibold text-gray-700 mr-4">ツール利用ランキング</h2>
          {(['tools', 'mcp'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`text-xs font-semibold px-3 py-1 rounded-full transition-colors ${
                tab === t
                  ? t === 'mcp'
                    ? 'bg-cyan-100 text-cyan-700'
                    : 'bg-indigo-100 text-indigo-700'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {t === 'tools' ? 'Built-in Tools' : 'MCP Tools'}
            </button>
          ))}
        </div>
        <RankingTable
          items={tab === 'tools' ? tools : mcpTools}
          title={tab === 'tools' ? 'ツール' : 'MCPツール'}
        />
      </div>
    </div>
  )
}
