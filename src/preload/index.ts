import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type {
  AppMeta,
  ChimeRequest,
  PomodoroApi,
  Settings,
  Tag,
  Task,
  TimerState,
  UpdateInfo
} from '../shared/types'

const api: PomodoroApi = {
  start: () => ipcRenderer.send('timer:start'),
  pause: () => ipcRenderer.send('timer:pause'),
  reset: () => ipcRenderer.send('timer:reset'),
  skip: () => ipcRenderer.send('timer:skip'),
  focusNow: () => ipcRenderer.send('timer:focusNow'),
  getState: () => ipcRenderer.invoke('timer:getState') as Promise<TimerState>,
  updateSettings: (partial: Partial<Settings>) =>
    ipcRenderer.invoke('settings:update', partial) as Promise<TimerState>,
  getStats: () => ipcRenderer.invoke('stats:get'),

  getTasks: () => ipcRenderer.invoke('tasks:get') as Promise<Task[]>,
  addTask: (title: string, tag: Tag, est: number, minutes: number) =>
    ipcRenderer.invoke('tasks:add', title, tag, est, minutes) as Promise<Task[]>,
  updateTask: (id: string, patch: Partial<Task>) =>
    ipcRenderer.invoke('tasks:update', id, patch) as Promise<Task[]>,
  deleteTask: (id: string) => ipcRenderer.invoke('tasks:delete', id) as Promise<Task[]>,
  reorderTasks: (ids: string[]) => ipcRenderer.invoke('tasks:reorder', ids) as Promise<Task[]>,
  setActiveTask: (id: string | null) =>
    ipcRenderer.invoke('tasks:setActive', id) as Promise<TimerState>,

  showMini: () => ipcRenderer.send('win:showMini'),
  showMain: () => ipcRenderer.send('win:showMain'),
  toggleMini: () => ipcRenderer.send('win:toggleMini'),
  hideMain: () => ipcRenderer.send('win:hide'),
  getAppMeta: () => ipcRenderer.invoke('app:meta') as Promise<AppMeta>,
  checkForUpdate: () => ipcRenderer.invoke('app:checkUpdate') as Promise<UpdateInfo>,
  openExternal: (url: string) => ipcRenderer.send('app:openExternal', url),

  getAudioSlots: () => ipcRenderer.invoke('audio:slots') as Promise<Record<string, boolean>>,
  getMusicLibrary: () => ipcRenderer.invoke('audio:library') as Promise<string[]>,
  getMusicFolderInfo: () =>
    ipcRenderer.invoke('audio:folderInfo') as Promise<{
      path: string
      isCustom: boolean
      count: number
    }>,
  pickMusicFolder: () => ipcRenderer.invoke('audio:pickFolder') as Promise<TimerState | null>,
  setMusicFolder: (path: string) =>
    ipcRenderer.invoke('audio:setFolder', path) as Promise<TimerState>,
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  openMusicFolder: () => ipcRenderer.send('audio:openFolder'),

  snoozeBlocker: () => ipcRenderer.send('blocker:snooze'),
  onBlockerSite: (cb: (site: string) => void) => {
    const l = (_e: unknown, site: string): void => cb(site)
    ipcRenderer.on('blocker:site', l)
    return () => ipcRenderer.removeListener('blocker:site', l)
  },
  testBlocker: () => ipcRenderer.invoke('blocker:test') as Promise<{
    app: string
    title: string
    url: string
    error: string
    blocked: string | null
  }>,

  onState: (cb: (state: TimerState) => void) => {
    const l = (_e: unknown, s: TimerState): void => cb(s)
    ipcRenderer.on('timer:state', l)
    return () => ipcRenderer.removeListener('timer:state', l)
  },
  onChime: (cb: (req: ChimeRequest) => void) => {
    const l = (_e: unknown, r: ChimeRequest): void => cb(r)
    ipcRenderer.on('timer:chime', l)
    return () => ipcRenderer.removeListener('timer:chime', l)
  },
  onTasks: (cb: (tasks: Task[]) => void) => {
    const l = (_e: unknown, t: Task[]): void => cb(t)
    ipcRenderer.on('tasks:state', l)
    return () => ipcRenderer.removeListener('tasks:state', l)
  }
}

contextBridge.exposeInMainWorld('pomodoro', api)
