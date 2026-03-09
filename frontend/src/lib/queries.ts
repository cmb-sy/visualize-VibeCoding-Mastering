import { supabase } from './supabase'

export interface Summary {
  // 既存
  total_sessions: number
  total_tool_uses: number
  total_skill_uses: number
  total_subagent_uses: number
  total_input_tokens: number
  total_output_tokens: number
  total_cache_read_tokens: number
  total_cache_write_tokens: number
  estimated_cost_usd: number
  total_non_mcp_tool_uses: number
  total_mcp_uses: number
  total_messages: number
  // 003 追加
  distinct_skills: number
  distinct_subagent_types: number
  distinct_mcp_tools: number
  distinct_tools: number
  assistant_messages: number
}

export interface DailyEntry {
  date: string
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  sessions: number
  estimated_cost_usd: number
  messages: number
  mcp_uses: number
  tool_uses: number
  skill_uses: number
  subagent_uses: number
}

export interface ToolEntry    { tool_name: string; count: number }
export interface SkillEntry   { skill_name: string; count: number }
export interface SubagentEntry { subagent_type: string; count: number }
export interface ProjectEntry {
  project_name: string
  project_path: string
  sessions: number
  input_tokens: number
  output_tokens: number
}

export interface SessionStats {
  session_id: string
  project_name: string
  started_at: string
  duration_minutes: number
  user_turns: number
  code_edits: number
  efficiency_score: number
  total_input_tokens: number
  total_output_tokens: number
  total_cache_read: number
  cache_hit_rate: number
  context_growth_factor: number
  clear_count: number
  estimated_cost_usd: number
}

export interface WeeklyEfficiency {
  week: string
  sessions: number
  median_efficiency: number
  avg_efficiency: number
  avg_cache_hit_rate: number
  avg_context_growth: number
  total_code_edits: number
  total_user_turns: number
}

async function query<T>(view: string, options?: { gte?: [string, string]; order?: string }): Promise<T[]> {
  let q = supabase.from(view).select('*')
  if (options?.gte) q = q.gte(options.gte[0], options.gte[1])
  if (options?.order) q = q.order(options.order)
  const { data, error } = await q
  if (error) throw new Error(`Supabase error (${view}): ${error.message}`)
  return (data ?? []) as T[]
}

export const api = {
  summary: async (): Promise<Summary> => {
    const { data, error } = await supabase.from('summary_stats').select('*').single()
    if (error) throw new Error(`Supabase error (summary_stats): ${error.message}`)
    return data as Summary
  },

  daily: (days = 90): Promise<DailyEntry[]> => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)
    const cutoffStr = cutoff.toISOString().slice(0, 10)
    return query<DailyEntry>('daily_stats', { gte: ['date', cutoffStr], order: 'date' })
  },

  tools:     (): Promise<ToolEntry[]>     => query<ToolEntry>('tool_stats'),
  mcpTools:  (): Promise<ToolEntry[]>     => query<ToolEntry>('mcp_stats'),
  skills:    (): Promise<SkillEntry[]>    => query<SkillEntry>('skill_stats'),
  subagents: (): Promise<SubagentEntry[]> => query<SubagentEntry>('subagent_stats'),
  projects:  (): Promise<ProjectEntry[]>  => query<ProjectEntry>('project_stats'),

  sessions: (days = 365): Promise<SessionStats[]> => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)
    const cutoffStr = cutoff.toISOString().slice(0, 10)
    return query<SessionStats>('session_stats', { gte: ['started_at', cutoffStr], order: 'started_at' })
  },
  weeklyEfficiency: (): Promise<WeeklyEfficiency[]> =>
    query<WeeklyEfficiency>('weekly_efficiency', { order: 'week' }),
}
