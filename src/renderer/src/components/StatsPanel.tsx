import { useMemo, useState } from 'react'
import { Stats } from '@shared/types'
import { IconClose } from '@/icons'

interface Props {
  stats: Stats | null
  sessionGoal: number
  onClose: () => void
}

type Range = 7 | 30

function dayKey(offset: number): string {
  const d = new Date()
  d.setDate(d.getDate() - offset)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

const PIE_COLORS = ['#e8463a', '#f0a23a', '#3aa0e8', '#5ac46a', '#a86ad8', '#9a9a9a']

export default function StatsPanel({ stats, sessionGoal, onClose }: Props): JSX.Element {
  const [range, setRange] = useState<Range>(7)

  const days = useMemo(() => {
    const out: { label: string; minutes: number; sessions: number; key: string }[] = []
    for (let i = range - 1; i >= 0; i--) {
      const key = dayKey(i)
      out.push({
        key,
        label: key.slice(5),
        minutes: stats?.minutes[key] ?? 0,
        sessions: stats?.history[key] ?? 0
      })
    }
    return out
  }, [stats, range])

  const totalMin = days.reduce((s, d) => s + d.minutes, 0)
  const totalSessions = days.reduce((s, d) => s + d.sessions, 0)
  const maxMin = Math.max(60, ...days.map((d) => d.minutes))

  const tagEntries = Object.entries(stats?.byTag ?? {}).filter(([, v]) => v > 0)
  const tagTotal = tagEntries.reduce((s, [, v]) => s + v, 0)

  // pie slices
  let acc = 0
  const slices = tagEntries.map(([tag, v], i) => {
    const start = (acc / tagTotal) * Math.PI * 2
    acc += v
    const end = (acc / tagTotal) * Math.PI * 2
    const large = end - start > Math.PI ? 1 : 0
    const r = 46
    const cx = 50
    const cy = 50
    const x1 = cx + r * Math.cos(start - Math.PI / 2)
    const y1 = cy + r * Math.sin(start - Math.PI / 2)
    const x2 = cx + r * Math.cos(end - Math.PI / 2)
    const y2 = cy + r * Math.sin(end - Math.PI / 2)
    return {
      tag,
      v,
      color: PIE_COLORS[i % PIE_COLORS.length],
      d: `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} Z`
    }
  })

  const streak = stats?.streak ?? 0
  const milestones = [3, 7, 14, 30, 60, 100]
  const nextMilestone = milestones.find((m) => m > streak) ?? null

  return (
    <div className="panel-backdrop" onClick={onClose}>
      <div className="panel" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head">
          <span>Statistics</span>
          <button className="panel-x" onClick={onClose}>
            <IconClose size={15} />
          </button>
        </div>

        <div className="stat-cards">
          <div>
            <b>{stats?.history[dayKey(0)] ?? 0}</b>
            <span>today / {sessionGoal}</span>
          </div>
          <div>
            <b>{streak}🔥</b>
            <span>day streak</span>
          </div>
          <div>
            <b>{stats?.totalFocus ?? 0}</b>
            <span>all-time</span>
          </div>
        </div>

        <div className="range-tabs">
          <button className={range === 7 ? 'on' : ''} onClick={() => setRange(7)}>
            Week
          </button>
          <button className={range === 30 ? 'on' : ''} onClick={() => setRange(30)}>
            Month
          </button>
        </div>

        <div className="chart-title">
          Focus minutes — {Math.round(totalMin)} min · {totalSessions} sessions
        </div>
        <div className="bar-chart">
          {days.map((d) => (
            <div className="bar-col" key={d.key} title={`${d.label}: ${d.minutes} min`}>
              <div className="bar" style={{ height: `${(d.minutes / maxMin) * 100}%` }} />
            </div>
          ))}
        </div>

        <div className="chart-title">By tag</div>
        {tagTotal === 0 ? (
          <div className="empty">No tagged sessions yet.</div>
        ) : (
          <div className="pie-wrap">
            <svg viewBox="0 0 100 100" className="pie">
              {slices.map((s) => (
                <path key={s.tag} d={s.d} fill={s.color} />
              ))}
            </svg>
            <div className="legend">
              {slices.map((s) => (
                <div key={s.tag}>
                  <i style={{ background: s.color }} />
                  {s.tag} <b>{s.v}</b>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="milestone">
          {nextMilestone
            ? `${nextMilestone - streak} more day${nextMilestone - streak > 1 ? 's' : ''} to a ${nextMilestone}-day streak 🏆`
            : 'Legendary streak — keep going! 🏆'}
        </div>
      </div>
    </div>
  )
}
