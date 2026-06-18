import { TimerState } from '@shared/types'
import PixelDigits from './PixelDigits'
import Pet from './Pet'
import { petInkFor } from '@/themes'

interface Props {
  state: TimerState
  petBox?: number
  compact?: boolean
}

const PHASE_TEXT: Record<string, string> = {
  focus: 'FOCUS',
  short: 'SHORT BREAK',
  long: 'LONG BREAK'
}

export function petStage(completedToday: number, sessionGoal: number): number {
  if (completedToday <= 0) return 0
  if (completedToday < Math.max(1, Math.ceil(sessionGoal / 2))) return 1
  return 2
}

export default function LcdScreen({ state, petBox = 100, compact }: Props): JSX.Element {
  const { phase, remainingMs, sessionIndex, completedToday, settings, status } = state
  const stage = petStage(completedToday, settings.sessionGoal)
  const header = phase === 'focus' ? `SESSION ${sessionIndex}` : PHASE_TEXT[phase]

  return (
    <div className={`lcd lcd-${phase} ${compact ? 'lcd-compact' : ''}`}>
      <div className="lcd-inner">
        <div className="lcd-header">{header}</div>
        <PixelDigits ms={remainingMs} />
        <div className="lcd-pet">
          <Pet
            kind={settings.pet}
            stage={stage}
            awake={status === 'running'}
            box={compact ? 56 : petBox}
            ink={petInkFor(settings.theme)}
          />
        </div>
        {!compact && (
          <div className="lcd-dots">
            {Array.from({ length: settings.sessionGoal }).map((_, i) => (
              <span key={i} className={`lcd-dot ${i < completedToday ? 'on' : ''}`} />
            ))}
          </div>
        )}
      </div>
      <div className="lcd-scanlines" />
      <div className="lcd-glare" />
    </div>
  )
}
