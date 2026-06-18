import Store from 'electron-store'
import {
  DEFAULT_SETTINGS,
  DEFAULT_STATS,
  Settings,
  Stats,
  Tag,
  Task
} from '../shared/types'

interface Schema {
  settings: Settings
  stats: Stats
  tasks: Task[]
  activeTaskId: string | null
}

const store = new Store<Schema>({
  defaults: {
    settings: DEFAULT_SETTINGS,
    stats: DEFAULT_STATS,
    tasks: [],
    activeTaskId: null
  }
})

// ---- settings --------------------------------------------------------------
export function getSettings(): Settings {
  return { ...DEFAULT_SETTINGS, ...store.get('settings') }
}
export function setSettings(partial: Partial<Settings>): Settings {
  const next = { ...getSettings(), ...partial }
  store.set('settings', next)
  return next
}

// ---- date helpers ----------------------------------------------------------
function key(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}
export function todayKey(): string {
  return key(new Date())
}
function yesterdayKey(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return key(d)
}

// ---- stats -----------------------------------------------------------------
export function getStats(): Stats {
  return { ...DEFAULT_STATS, ...store.get('stats') }
}

/** Record one completed focus session (with its length + tag). */
export function recordCompletedFocus(focusMin: number, tag: Tag | null): Stats {
  const stats = getStats()
  const today = todayKey()
  const countedToday = stats.history[today] ?? 0
  const goal = getSettings().sessionGoal

  const history = { ...stats.history, [today]: countedToday + 1 }
  const minutes = { ...stats.minutes, [today]: (stats.minutes[today] ?? 0) + focusMin }
  const byTag = tag ? { ...stats.byTag, [tag]: (stats.byTag[tag] ?? 0) + 1 } : stats.byTag
  const totalFocus = stats.totalFocus + 1

  // Streak: bump only when crossing the daily goal for the first time today.
  let streak = stats.streak
  const newCount = countedToday + 1
  if (newCount === goal) {
    const hitYesterday = (stats.history[yesterdayKey()] ?? 0) >= goal
    streak = hitYesterday ? streak + 1 : 1
  }

  const next: Stats = { history, minutes, byTag, streak, totalFocus }
  store.set('stats', next)
  return next
}

export function completedToday(): number {
  return getStats().history[todayKey()] ?? 0
}

// ---- tasks -----------------------------------------------------------------
export function getTasks(): Task[] {
  return [...store.get('tasks')].sort((a, b) => a.order - b.order)
}
export function setTasks(tasks: Task[]): Task[] {
  store.set('tasks', tasks)
  return getTasks()
}
export function getActiveTaskId(): string | null {
  return store.get('activeTaskId')
}
export function setActiveTaskId(id: string | null): void {
  // Don't activate a task that no longer exists.
  if (id && !getTasks().some((t) => t.id === id)) id = null
  store.set('activeTaskId', id)
}

/** Credit a finished pomodoro to the active task. */
export function creditActiveTask(): void {
  const id = getActiveTaskId()
  if (!id) return
  const tasks = getTasks().map((t) =>
    t.id === id ? { ...t, donePomodoros: t.donePomodoros + 1 } : t
  )
  store.set('tasks', tasks)
}

export function getActiveTaskTag(): Tag | null {
  const id = getActiveTaskId()
  if (!id) return null
  return getTasks().find((t) => t.id === id)?.tag ?? null
}
