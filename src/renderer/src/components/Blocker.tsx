import { useEffect, useState } from 'react'
import { usePomodoro } from '@/state/usePomodoro'
import { IconBlocked } from '@/icons'

function fmt(ms: number): string {
  const t = Math.max(0, Math.round(ms / 1000))
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

/** Fullscreen overlay shown over a blocked app/site during strict focus. */
export default function Blocker(): JSX.Element {
  const state = usePomodoro((s) => s.state)
  const [site, setSite] = useState(
    new URLSearchParams(window.location.search).get('site') ?? 'this site'
  )

  useEffect(() => {
    const off = window.pomodoro.onBlockerSite((s) => setSite(s))
    return off
  }, [])

  return (
    <div className="strict-root blocker-root">
      <div className="aurora" />
      <div className="strict-center">
        <div className="block-emoji">
          <IconBlocked size={64} />
        </div>
        <div className="strict-label">Stay focused</div>
        <div className="block-site">{site}</div>
        <div className="strict-sub">Blocked while you’re in a focus session.</div>
        {state && <div className="block-time">{fmt(state.remainingMs)} left</div>}
        <button className="strict-skip" onClick={() => window.pomodoro.snoozeBlocker()}>
          Back to work
        </button>
      </div>
    </div>
  )
}
