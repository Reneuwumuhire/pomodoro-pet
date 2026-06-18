import { Phase, Status, TimerState } from '../shared/types'
import {
  completedToday,
  creditActiveTask,
  getActiveTaskId,
  getActiveTaskTag,
  getSettings,
  recordCompletedFocus
} from './store'

type Listener = (state: TimerState) => void
type PhaseEndHandler = (finished: Phase, next: Phase, autoStarted: boolean) => void

/**
 * The single source of truth for the countdown. Runs in the main process so it
 * keeps ticking when every window is hidden, and so the tray title stays live.
 */
export class TimerEngine {
  private phase: Phase = 'focus'
  private status: Status = 'idle'
  private remainingMs: number
  private totalMs: number
  private sessionIndex = 1
  private interval: ReturnType<typeof setInterval> | null = null
  private lastTick = 0

  private listeners = new Set<Listener>()
  private phaseEndHandlers = new Set<PhaseEndHandler>()

  constructor() {
    this.totalMs = this.durationFor('focus')
    this.remainingMs = this.totalMs
  }

  onChange(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  onPhaseEnd(fn: PhaseEndHandler): () => void {
    this.phaseEndHandlers.add(fn)
    return () => this.phaseEndHandlers.delete(fn)
  }

  start(): void {
    if (this.status === 'running') return
    this.status = 'running'
    this.lastTick = Date.now()
    if (!this.interval) this.interval = setInterval(() => this.tick(), 250)
    this.emit()
  }

  pause(): void {
    if (this.status !== 'running') return
    this.status = 'paused'
    this.stopInterval()
    this.emit()
  }

  toggle(): void {
    this.status === 'running' ? this.pause() : this.start()
  }

  reset(): void {
    this.status = 'idle'
    this.stopInterval()
    this.totalMs = this.durationFor(this.phase)
    this.remainingMs = this.totalMs
    this.emit()
  }

  skip(): void {
    this.advancePhase(false)
  }

  /** Begin a fresh focus session immediately (used when starting a task). */
  focusNow(): void {
    this.phase = 'focus'
    this.totalMs = this.durationFor('focus')
    this.remainingMs = this.totalMs
    this.status = 'idle'
    this.start()
  }

  applySettings(): void {
    if (this.status !== 'running') {
      this.totalMs = this.durationFor(this.phase)
      if (this.status === 'idle') this.remainingMs = this.totalMs
      else this.remainingMs = Math.min(this.remainingMs, this.totalMs)
    }
    this.emit()
  }

  /** Force the engine into a phase (used by tray "skip to break" etc.). */
  getPhase(): Phase {
    return this.phase
  }

  getState(): TimerState {
    return {
      phase: this.phase,
      status: this.status,
      remainingMs: this.remainingMs,
      totalMs: this.totalMs,
      sessionIndex: this.sessionIndex,
      completedToday: completedToday(),
      settings: getSettings(),
      activeTaskId: getActiveTaskId()
    }
  }

  dispose(): void {
    this.stopInterval()
    this.listeners.clear()
    this.phaseEndHandlers.clear()
  }

  private durationFor(phase: Phase): number {
    const s = getSettings()
    const min = phase === 'focus' ? s.focusMin : phase === 'short' ? s.shortMin : s.longMin
    return min * 60 * 1000
  }

  private stopInterval(): void {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
  }

  private tick(): void {
    if (this.status !== 'running') return
    const now = Date.now()
    this.remainingMs = Math.max(0, this.remainingMs - (now - this.lastTick))
    this.lastTick = now
    if (this.remainingMs <= 0) this.advancePhase(true)
    else this.emit()
  }

  private advancePhase(completed: boolean): void {
    const settings = getSettings()
    const finished = this.phase
    let next: Phase

    if (finished === 'focus') {
      if (completed) {
        recordCompletedFocus(settings.focusMin, getActiveTaskTag())
        creditActiveTask()
      }
      const useLong = this.sessionIndex % settings.longBreakAfter === 0
      next = useLong ? 'long' : 'short'
    } else {
      next = 'focus'
      if (finished === 'long') this.sessionIndex = 1
      else this.sessionIndex += 1
    }

    this.phase = next
    this.totalMs = this.durationFor(next)
    this.remainingMs = this.totalMs

    // Decide whether the next phase auto-starts.
    const autoStart =
      completed && (next === 'focus' ? settings.autoStartWork : settings.autoStartBreak)

    if (completed) {
      for (const h of this.phaseEndHandlers) h(finished, next, autoStart)
    }

    if (autoStart) {
      this.status = 'running'
      this.lastTick = Date.now()
      if (!this.interval) this.interval = setInterval(() => this.tick(), 250)
    } else {
      this.status = 'idle'
      this.stopInterval()
    }

    this.emit()
  }

  private emit(): void {
    const state = this.getState()
    for (const fn of this.listeners) fn(state)
  }
}

export type { Status }
