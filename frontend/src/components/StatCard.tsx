interface Props {
  title: string
  value: string | number
  sub?: string
  trend?: number
  accentColor?: string
  badge?: { label: string; color: string }
}

export function StatCard({ title, value, sub, trend, badge }: Props) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex flex-col items-center gap-1">
      <div className="flex items-center justify-between w-full mb-1">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{title}</span>
        <div className="flex items-center gap-1.5">
          {badge && (
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
              style={{ backgroundColor: badge.color + '20', color: badge.color }}
            >
              {badge.label}
            </span>
          )}
          {trend !== undefined && (
            <span className={`text-xs font-semibold flex items-center gap-0.5 ${
              trend >= 0 ? 'text-emerald-600' : 'text-red-500'
            }`}>
              {trend >= 0 ? '↑' : '↓'} {Math.abs(trend).toFixed(1)}%
            </span>
          )}
        </div>
      </div>
      <span className="text-3xl font-bold text-gray-900 leading-none">{value}</span>
      {sub && <span className="text-xs text-gray-400 mt-0.5">{sub}</span>}
    </div>
  )
}
