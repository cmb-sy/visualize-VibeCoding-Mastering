import { useState } from 'react'
import { DashboardPage } from './pages/DashboardPage'
import { ToolsPage } from './pages/ToolsPage'
import { SkillsPage } from './pages/SkillsPage'
import { EfficiencyPage } from './pages/EfficiencyPage'

const TABS = [
  { id: 'dashboard',  label: 'ダッシュボード' },
  { id: 'tools',      label: 'ツール' },
  { id: 'skills',     label: 'スキル & エージェント' },
  { id: 'efficiency', label: '効率' },
]

const PERIODS = [
  { label: '1D', days: 1 },
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: 'All', days: 9999 },
]

export default function App() {
  const [tab, setTab] = useState('dashboard')
  const [period, setPeriod] = useState(7)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-between py-4">
            <h1 className="text-base font-bold text-gray-900 tracking-tight">
              Claude Code Usage Dashboard
            </h1>
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              {PERIODS.map(p => (
                <button
                  key={p.label}
                  onClick={() => setPeriod(p.days)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                    period === p.days
                      ? 'bg-white shadow-sm text-gray-900'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <nav className="flex -mb-px">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  tab === t.id
                    ? 'border-gray-900 text-gray-900'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-6 py-8">
        {tab === 'dashboard' && <DashboardPage days={period} />}
        {tab === 'tools' && <ToolsPage />}
        {tab === 'skills' && <SkillsPage />}
        {tab === 'efficiency' && <EfficiencyPage />}
      </main>
    </div>
  )
}
