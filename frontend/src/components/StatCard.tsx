// frontend/src/components/StatCard.tsx
interface Props {
  title: string
  value: string | number
  sub?: string
}

export function StatCard({ title, value, sub }: Props) {
  return (
    <div className="bg-white rounded-xl shadow p-5 flex flex-col gap-1">
      <span className="text-sm text-gray-500">{title}</span>
      <span className="text-2xl font-bold text-gray-900">{value}</span>
      {sub && <span className="text-xs text-gray-400">{sub}</span>}
    </div>
  )
}
