import { create } from 'zustand'
import { DEFAULT_SETTINGS, Settings, Stats, Tag, Task, TimerState } from '@shared/types'

interface PomodoroStore {
  state: TimerState | null
  stats: Stats | null
  tasks: Task[]
  ready: boolean
  init: () => void
  refreshStats: () => Promise<void>
  // timer
  start: () => void
  pause: () => void
  toggle: () => void
  reset: () => void
  skip: () => void
  updateSettings: (partial: Partial<Settings>) => Promise<void>
  // tasks
  addTask: (title: string, tag: Tag, est: number, minutes: number) => Promise<void>
  updateTask: (id: string, patch: Partial<Task>) => Promise<void>
  deleteTask: (id: string) => Promise<void>
  reorderTasks: (ids: string[]) => Promise<void>
  setActiveTask: (id: string | null) => Promise<void>
  /** Make a task active, apply its time, and start a focus session now. */
  startTaskSession: (task: Task) => Promise<void>
  // music folder
  pickMusicFolder: () => Promise<void>
  setMusicFolder: (path: string) => Promise<void>
}

export const usePomodoro = create<PomodoroStore>((set, get) => ({
  state: null,
  stats: null,
  tasks: [],
  ready: false,

  init: () => {
    const api = window.pomodoro
    api.getState().then((state) => set({ state, ready: true }))
    api.getStats().then((stats) => set({ stats }))
    api.getTasks().then((tasks) => set({ tasks }))
    api.onState((state) => {
      const prev = get().state
      set({ state })
      if (prev && state.completedToday !== prev.completedToday) {
        api.getStats().then((stats) => set({ stats }))
        api.getTasks().then((tasks) => set({ tasks }))
      }
    })
    api.onTasks((tasks) => set({ tasks }))
  },

  refreshStats: async () => set({ stats: await window.pomodoro.getStats() }),

  start: () => window.pomodoro.start(),
  pause: () => window.pomodoro.pause(),
  toggle: () => {
    const s = get().state
    if (s?.status === 'running') window.pomodoro.pause()
    else window.pomodoro.start()
  },
  reset: () => window.pomodoro.reset(),
  skip: () => window.pomodoro.skip(),
  updateSettings: async (partial) => set({ state: await window.pomodoro.updateSettings(partial) }),

  addTask: async (title, tag, est, minutes) =>
    set({ tasks: await window.pomodoro.addTask(title, tag, est, minutes) }),
  updateTask: async (id, patch) => set({ tasks: await window.pomodoro.updateTask(id, patch) }),
  deleteTask: async (id) => set({ tasks: await window.pomodoro.deleteTask(id) }),
  reorderTasks: async (ids) => set({ tasks: await window.pomodoro.reorderTasks(ids) }),
  setActiveTask: async (id) => set({ state: await window.pomodoro.setActiveTask(id) }),
  startTaskSession: async (task) => {
    await window.pomodoro.setActiveTask(task.id)
    // Apply the task's focus length, then begin a fresh focus session.
    const state = await window.pomodoro.updateSettings({ focusMin: task.minutes })
    set({ state })
    window.pomodoro.focusNow()
  },

  pickMusicFolder: async () => {
    const state = await window.pomodoro.pickMusicFolder()
    if (state) set({ state })
  },
  setMusicFolder: async (path) => set({ state: await window.pomodoro.setMusicFolder(path) })
}))

export function useSettings(): Settings {
  return usePomodoro((s) => s.state?.settings ?? DEFAULT_SETTINGS)
}
