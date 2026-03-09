// frontend/src/components/SessionDot.tsx
import type { SessionStats } from '../lib/queries'

interface Props {
  cx?: number
  cy?: number
  payload?: SessionStats
}

function scoreToColor(score: number): string {
  // 0→赤(0°) / 5+→緑(120°)
  const hue = Math.min(score / 5, 1) * 120
  return `hsl(${hue}, 65%, 48%)`
}

export function SessionDot({ cx = 0, cy = 0, payload }: Props) {
  if (!payload) return null
  const color = scoreToColor(payload.efficiency_score)
  // duration_minutes が長いほど大きい点 (4px〜14px)
  const r = Math.min(Math.max(Math.sqrt((payload.duration_minutes || 1) + 1) * 1.8, 4), 14)
  const hasClear = payload.clear_count > 0

  return (
    <g>
      {hasClear && (
        <circle
          cx={cx} cy={cy} r={r + 4}
          fill="none"
          stroke="#ef4444"
          strokeWidth="1.5"
          strokeDasharray="3 2"
          opacity={0.7}
        />
      )}
      <circle cx={cx} cy={cy} r={r} fill={color} opacity={0.72} />
    </g>
  )
}
