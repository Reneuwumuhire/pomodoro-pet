import { Notification } from 'electron'
import { Phase } from '../shared/types'

const TITLES: Record<Phase, string> = {
  focus: 'Focus time',
  short: 'Short break',
  long: 'Long break'
}

const MESSAGES: Record<Phase, string> = {
  focus: 'Back to it — your pet is waiting. 🐾',
  short: 'Nice work! Take a short break.',
  long: 'Great session streak! Enjoy a long break. ☕'
}

/** Show a native notification announcing the phase that is about to start. */
export function notifyPhase(next: Phase): void {
  if (!Notification.isSupported()) return
  const n = new Notification({
    title: TITLES[next],
    body: MESSAGES[next],
    silent: true // we play our own chime in the renderer
  })
  n.show()
}
