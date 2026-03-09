import { supabase } from './supabase'

// ==================== 型定義 ====================

export interface Summary {
  total_sessions: number
  total_input_tokens: number
  total_output_tokens: number
  total_cache_read_tokens: number
  total_cache_write_tokens: number
  estimated_cost_usd: number
  total_tool_uses: number
  total_non_mcp_tool_uses: number
  total_mcp_uses: number
  total_skill_uses: number
  total_subagent_uses: number
  total_messages: number
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

// ==================== クエリ ====================

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
}
