import { usePomodoro } from '@/state/usePomodoro'
import Pet from './Pet'
import { petStage } from './LcdScreen'

function fmt(ms: number): string {
  const t = Math.max(0, Math.round(ms / 1000))
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

/** Fullscreen takeover shown during strict-mode breaks: a calming breathing
 *  animation forces a real rest while break music plays from the main window. */
export default function StrictBreak(): JSX.Element {
  const state = usePomodoro((s) => s.state)
  const skip = usePomodoro((s) => s.skip)
  if (!state) return <div className="strict-root" />

  const isLong = state.phase === 'long'
  const stage = petStage(state.completedToday, state.settings.sessionGoal)

  return (
    <div className="strict-root">
      <div className="aurora" />
      <div className="strict-center">
        <div className="breathe">
          <div className="breathe-ring" />
          <div className="breathe-pet">
            <Pet kind={state.settings.pet} stage={stage} awake box={160} ink="#dfeede" />
          </div>
        </div>
        <div className="strict-label">{isLong ? 'Long break' : 'Take a breather'}</div>
        <div className="strict-time">{fmt(state.remainingMs)}</div>
        <div className="strict-sub">Step away from the screen. Breathe in… and out.</div>
        <button className="strict-skip" onClick={skip}>
          Skip break
        </button>
      </div>
    </div>
  )
}
