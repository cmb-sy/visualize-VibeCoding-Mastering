import { useEffect, useState } from 'react'
import { api, type SkillEntry, type SubagentEntry } from '../api'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie,
} from 'recharts'

const COLORS = ['#6366f1','#8b5cf6','#ec4899','#f43f5e','#f97316','#eab308','#22c55e','#14b8a6','#06b6d4','#3b82f6']

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

  if (loading) return <div className="text-gray-500">Loading...</div>

  return (
    <div className="flex flex-col gap-8">
      <div className="bg-white rounded-xl shadow p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Skill Usage</h2>
        {skills.length === 0 ? (
          <p className="text-gray-400 text-sm">No skill usage recorded yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(250, skills.length * 32)}>
            <BarChart data={skills} layout="vertical" margin={{ top: 5, right: 30, left: 120, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis dataKey="skill_name" type="category" tick={{ fontSize: 11 }} width={120} />
              <Tooltip />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {skills.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
      <div className="bg-white rounded-xl shadow p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Subagent Types</h2>
        {subagents.length === 0 ? (
          <p className="text-gray-400 text-sm">No subagent usage recorded yet.</p>
        ) : (
          <div className="flex gap-8 items-center flex-wrap">
            <ResponsiveContainer width={300} height={300}>
              <PieChart>
                <Pie
                  data={subagents}
                  dataKey="count"
                  nameKey="subagent_type"
                  cx="50%"
                  cy="50%"
                  outerRadius={120}
                  label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`}
                >
                  {subagents.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-col gap-2">
              {subagents.map((s, i) => (
                <div key={s.subagent_type} className="flex items-center gap-2 text-sm">
                  <span className="w-3 h-3 rounded-full inline-block" style={{ background: COLORS[i % COLORS.length] }} />
                  <span className="text-gray-700">{s.subagent_type}</span>
                  <span className="text-gray-400 ml-2">{s.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
