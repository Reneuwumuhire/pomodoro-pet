import type { PomodoroApi } from '@shared/types'

// `window.pomodoro` is provided by the Tauri shim (platform/tauri.ts) at startup.
declare global {
  interface Window {
    pomodoro: PomodoroApi
  }
}

export {}
