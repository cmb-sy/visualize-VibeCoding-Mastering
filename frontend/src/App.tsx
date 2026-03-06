import { useState } from 'react'
import { DashboardPage } from './pages/DashboardPage'
import { ToolsPage } from './pages/ToolsPage'
import { SkillsPage } from './pages/SkillsPage'
import { ProjectsPage } from './pages/ProjectsPage'

const TABS = [
  { id: 'dashboard', label: 'Overview' },
  { id: 'tools', label: 'Tools' },
  { id: 'skills', label: 'Skills & Agents' },
  { id: 'projects', label: 'Projects' },
]

export default function App() {
  const [tab, setTab] = useState('dashboard')

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center gap-8">
          <h1 className="text-lg font-semibold text-gray-900">Claude Stats</h1>
          <nav className="flex gap-1">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  tab === t.id
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-6 py-8">
        {tab === 'dashboard' && <DashboardPage />}
        {tab === 'tools' && <ToolsPage />}
        {tab === 'skills' && <SkillsPage />}
        {tab === 'projects' && <ProjectsPage />}
      </main>
    </div>
  )
}
