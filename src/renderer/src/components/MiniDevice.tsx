import { usePomodoro } from '@/state/usePomodoro'
import LcdScreen from './LcdScreen'
import { IconExpand, IconClose } from '@/icons'

/** Compact always-on-top widget. Expand returns to the main popover; close
 *  hides the widget entirely (tray + ⌘⇧M bring it back). */
export default function MiniDevice(): JSX.Element {
  const state = usePomodoro((s) => s.state)
  const toggle = usePomodoro((s) => s.toggle)
  const reset = usePomodoro((s) => s.reset)

  if (!state) return <div className="loading">…</div>

  return (
    <div className="mini-device">
      <div className="mini-bar">
        <div className="mini-drag" />
        <button className="mini-win" onClick={() => window.pomodoro.showMain()} title="Expand">
          <IconExpand size={12} />
        </button>
        <button className="mini-win" onClick={() => window.pomodoro.toggleMini()} title="Hide widget">
          <IconClose size={12} />
        </button>
      </div>
      <LcdScreen state={state} compact />
      <div className="mini-controls">
        <button className="mini-btn red" onClick={toggle}>
          {state.status === 'running' ? 'PAUSE' : 'START'}
        </button>
        <button className="mini-btn dark" onClick={reset}>
          RESET
        </button>
      </div>
    </div>
  )
}
