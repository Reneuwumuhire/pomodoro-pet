import type { PomodoroApi } from '../shared/types'

declare global {
  interface Window {
    pomodoro: PomodoroApi
  }
}

export {}
