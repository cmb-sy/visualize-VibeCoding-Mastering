import { BarChart, Bar, ResponsiveContainer } from 'recharts'

interface Props {
  title: string
  value: string | number
  sub?: string
  trend?: number       // 前期比 % (正=↑ 負=↓)
  sparkData?: number[] // Sparkline 用の値配列
  accentColor?: string // Sparkline の色
}

export function StatCard({ title, value, sub, trend, sparkData, accentColor = '#6366f1' }: Props) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex flex-col gap-1">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{title}</span>
        {trend !== undefined && (
          <span className={`text-xs font-semibold flex items-center gap-0.5 ${
            trend >= 0 ? 'text-emerald-600' : 'text-red-500'
          }`}>
            {trend >= 0 ? '↑' : '↓'} {Math.abs(trend).toFixed(1)}%
          </span>
        )}
      </div>
      <span className="text-3xl font-bold text-gray-900 leading-none">{value}</span>
      {sub && <span className="text-xs text-gray-400 mt-0.5">{sub}</span>}
      {sparkData && sparkData.length > 0 && (
        <div className="h-10 mt-2 -mx-1">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={sparkData.map((v, i) => ({ v, i }))} barCategoryGap="10%">
              <Bar dataKey="v" fill={accentColor} radius={[2, 2, 0, 0]} opacity={0.7} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
