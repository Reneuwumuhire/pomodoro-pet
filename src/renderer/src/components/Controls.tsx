import { Status } from '@shared/types'
import { IconPlay, IconPause, IconReset } from '@/icons'

interface Props {
  status: Status
  onToggle: () => void
  onReset: () => void
}

/** Red START/PAUSE + dark RESET, styled as physical buttons. */
export default function Controls({ status, onToggle, onReset }: Props): JSX.Element {
  const running = status === 'running'
  return (
    <div className="controls">
      <button className="btn btn-red" onClick={onToggle}>
        <span className="btn-label">{running ? 'PAUSE' : 'START'}</span>
        <span className="btn-icon" aria-hidden>
          {running ? <IconPause size={18} /> : <IconPlay size={18} />}
        </span>
      </button>
      <button className="btn btn-dark" onClick={onReset}>
        <span className="btn-label">RESET</span>
        <span className="btn-icon" aria-hidden>
          <IconReset size={17} />
        </span>
      </button>
    </div>
  )
}
