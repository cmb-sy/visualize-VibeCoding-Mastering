// frontend/src/api.ts
export interface Summary {
  total_sessions: number
  total_input_tokens: number
  total_output_tokens: number
  total_cache_read_tokens: number
  total_cache_write_tokens: number
  estimated_cost_usd: number
  total_tool_uses: number
  total_skill_uses: number
  total_subagent_uses: number
}

export interface DailyEntry {
  date: string
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  sessions: number
  estimated_cost_usd: number
}

export interface ToolEntry { tool_name: string; count: number }
export interface SkillEntry { skill_name: string; count: number }
export interface SubagentEntry { subagent_type: string; count: number }
export interface ProjectEntry {
  project_name: string
  project_path: string
  sessions: number
  input_tokens: number
  output_tokens: number
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export const api = {
  summary: () => get<Summary>('/api/summary'),
  daily: (days = 90) => get<DailyEntry[]>(`/api/daily?days=${days}`),
  tools: () => get<ToolEntry[]>('/api/tools'),
  skills: () => get<SkillEntry[]>('/api/skills'),
  subagents: () => get<SubagentEntry[]>('/api/subagents'),
  projects: () => get<ProjectEntry[]>('/api/projects'),
}
