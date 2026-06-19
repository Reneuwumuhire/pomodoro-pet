/**
 * Tauri implementation of the exact `window.pomodoro` API the React UI already uses
 * (see `src/shared/types.ts > PomodoroApi`). Because the shape is identical, NO component
 * changes are needed — only the wiring underneath flips from Electron IPC to Tauri.
 *
 *   Electron:  ipcRenderer.send('timer:start')         →  Tauri: invoke('start')
 *   Electron:  ipcRenderer.invoke('timer:getState')    →  Tauri: invoke('get_state')
 *   Electron:  ipcRenderer.on('timer:state', cb)        →  Tauri: listen('timer-state', cb)
 *
 * Install once at startup:  `import { installTauriApi } from './platform/tauri'; installTauriApi()`
 */
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { open } from '@tauri-apps/plugin-dialog'
import { convertFileSrc } from '@tauri-apps/api/core'
import type { ChimeRequest, PomodoroApi, Settings, Tag, Task, TimerState } from '@shared/types'

/** Bridge a Tauri event to the `onX(cb) => unsubscribe` callback style the UI expects. */
function sub<T>(event: string, cb: (payload: T) => void): () => void {
  let off: UnlistenFn | undefined
  void listen<T>(event, (e) => cb(e.payload)).then((fn) => (off = fn))
  return () => off?.()
}

export const tauriApi: PomodoroApi = {
  // timer
  start: () => void invoke('start'),
  pause: () => void invoke('pause'),
  reset: () => void invoke('reset'),
  skip: () => void invoke('skip'),
  focusNow: () => void invoke('focus_now'),
  getState: () => invoke<TimerState>('get_state'),
  updateSettings: (partial: Partial<Settings>) => invoke<TimerState>('update_settings', { partial }),
  getStats: () => invoke('get_stats'),

  // tasks
  getTasks: () => invoke('tasks_get'),
  addTask: (title: string, tag: Tag, est: number, minutes: number) =>
    invoke<Task[]>('tasks_add', { title, tag, est, minutes }),
  updateTask: (id: string, patch: Partial<Task>) => invoke<Task[]>('tasks_update', { id, patch }),
  deleteTask: (id: string) => invoke<Task[]>('tasks_delete', { id }),
  reorderTasks: (ids: string[]) => invoke<Task[]>('tasks_reorder', { ids }),
  setActiveTask: (id: string | null) => invoke<TimerState>('tasks_set_active', { id }),

  // windows
  showMini: () => void invoke('win_show_mini'),
  showMain: () => void invoke('win_show_main'),
  toggleMini: () => void invoke('win_toggle_mini'),
  hideMain: () => void invoke('win_hide'),

  // audio / music folder
  getAudioSlots: () => invoke('audio_slots'),
  getMusicLibrary: () => invoke('audio_library'),
  getMusicFolderInfo: () => invoke('audio_folder_info'),
  openMusicFolder: () => void invoke('audio_open_folder'),
  setMusicFolder: (path: string) => invoke<TimerState>('audio_set_folder', { path }),
  // native folder picker via the dialog plugin (replaces Electron dialog.showOpenDialog)
  pickMusicFolder: async () => {
    const dir = await open({ directory: true, multiple: false, title: 'Choose your music folder' })
    return dir ? invoke<TimerState>('audio_set_folder', { path: dir as string }) : null
  },
  // drag-drop: convert an absolute path to an asset: URL the <audio> element can load
  getPathForFile: (file: File) => convertFileSrc((file as unknown as { path: string }).path),

  // focus shield
  snoozeBlocker: () => void invoke('blocker_snooze'),
  testBlocker: () => invoke('blocker_test'),

  // subscriptions (events)
  onState: (cb: (s: TimerState) => void) => sub('timer-state', cb),
  onChime: (cb: (r: ChimeRequest) => void) => sub('chime', cb),
  onTasks: (cb: (t: Task[]) => void) => sub('tasks-state', cb),
  onBlockerSite: (cb: (site: string) => void) => sub('blocker-site', cb)
}

/** Expose it as `window.pomodoro` so every existing component keeps working unchanged. */
export function installTauriApi(): void {
  ;(window as unknown as { pomodoro: PomodoroApi }).pomodoro = tauriApi
}
