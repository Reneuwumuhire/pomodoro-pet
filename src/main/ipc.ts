import { dialog, ipcMain } from 'electron'
import { statSync } from 'fs'
import { dirname } from 'path'
import { TimerEngine } from './timer'
import {
  allWindows,
  hideMain,
  mainWin,
  setPopoverPinned,
  showMain,
  showMini,
  syncStrictWindow,
  toggleMini
} from './windows'
import { notifyPhase } from './notifications'
import { audioLibrary, audioSlots, musicFolderInfo, openMusicFolder } from './music'
import { snoozeGuard, testGuard } from './focusGuard'
import {
  getSettings,
  getStats,
  getTasks,
  setActiveTaskId,
  setSettings,
  setTasks
} from './store'
import { ChimeRequest, Tag, Task } from '../shared/types'

function broadcast(channel: string, payload: unknown): void {
  for (const win of allWindows()) win.webContents.send(channel, payload)
}

let idCounter = 0
function newId(): string {
  idCounter += 1
  return `t${Date.now().toString(36)}${idCounter}`
}

export function registerIpc(engine: TimerEngine): void {
  // timer commands
  ipcMain.on('timer:start', () => engine.start())
  ipcMain.on('timer:pause', () => engine.pause())
  ipcMain.on('timer:reset', () => engine.reset())
  ipcMain.on('timer:skip', () => engine.skip())
  ipcMain.on('timer:focusNow', () => engine.focusNow())
  ipcMain.handle('timer:getState', () => engine.getState())

  // settings + stats
  ipcMain.handle('stats:get', () => getStats())
  ipcMain.handle('settings:update', (_e, partial) => {
    setSettings(partial)
    engine.applySettings()
    syncStrictWindow(engine)
    return engine.getState()
  })

  // tasks
  ipcMain.handle('tasks:get', () => getTasks())
  ipcMain.handle('tasks:add', (_e, title: string, tag: Tag, est: number, minutes: number) => {
    const tasks = getTasks()
    const order = tasks.length ? Math.max(...tasks.map((t) => t.order)) + 1 : 0
    const task: Task = {
      id: newId(),
      title,
      tag,
      minutes: Math.max(1, minutes || 25),
      estPomodoros: Math.max(1, est),
      donePomodoros: 0,
      completed: false,
      order
    }
    const next = setTasks([...tasks, task])
    broadcast('tasks:state', next)
    return next
  })
  ipcMain.handle('tasks:update', (_e, id: string, patch: Partial<Task>) => {
    const next = setTasks(getTasks().map((t) => (t.id === id ? { ...t, ...patch } : t)))
    broadcast('tasks:state', next)
    return next
  })
  ipcMain.handle('tasks:delete', (_e, id: string) => {
    const next = setTasks(getTasks().filter((t) => t.id !== id))
    broadcast('tasks:state', next)
    return next
  })
  ipcMain.handle('tasks:reorder', (_e, ids: string[]) => {
    const byId = new Map(getTasks().map((t) => [t.id, t]))
    const next = setTasks(
      ids.map((id, i) => ({ ...(byId.get(id) as Task), order: i })).filter(Boolean)
    )
    broadcast('tasks:state', next)
    return next
  })
  ipcMain.handle('tasks:setActive', (_e, id: string | null) => {
    setActiveTaskId(id)
    return engine.getState()
  })

  // window control (single-widget rule)
  ipcMain.on('win:showMini', () => showMini())
  ipcMain.on('win:showMain', () => showMain())
  ipcMain.on('win:toggleMini', () => toggleMini())
  ipcMain.on('win:hide', () => hideMain())

  // custom music folder
  ipcMain.handle('audio:slots', () => audioSlots())
  ipcMain.handle('audio:library', () => audioLibrary())
  ipcMain.handle('audio:folderInfo', () => musicFolderInfo())
  ipcMain.on('audio:openFolder', () => openMusicFolder())

  ipcMain.handle('audio:pickFolder', async () => {
    // Keep the popover open while the native picker is up.
    setPopoverPinned(true)
    try {
      const win = mainWin()
      const res = win
        ? await dialog.showOpenDialog(win, {
            title: 'Choose your music folder',
            properties: ['openDirectory']
          })
        : await dialog.showOpenDialog({ title: 'Choose your music folder', properties: ['openDirectory'] })
      if (res.canceled || !res.filePaths[0]) return null
      setSettings({ musicFolder: res.filePaths[0] })
      return engine.getState()
    } finally {
      setPopoverPinned(false)
      mainWin()?.focus()
    }
  })

  ipcMain.handle('audio:setFolder', (_e, path: string) => {
    let folder = ''
    if (typeof path === 'string' && path) {
      try {
        // dropping a song selects its containing folder; dropping a folder uses it
        folder = statSync(path).isDirectory() ? path : dirname(path)
      } catch {
        folder = ''
      }
    }
    setSettings({ musicFolder: folder })
    return engine.getState()
  })

  // distraction blocker overlay dismissed -> brief grace period
  ipcMain.on('blocker:snooze', () => snoozeGuard())
  ipcMain.handle('blocker:test', () => testGuard())

  // pushes
  engine.onChange((state) => {
    broadcast('timer:state', state)
    syncStrictWindow(engine)
  })
  engine.onPhaseEnd((finished, next) => {
    const s = getSettings()
    // Notification muting: suppress our notifications during focus if asked.
    const suppress = s.muteNotificationsDuringFocus && next === 'focus'
    if (!suppress) notifyPhase(next)
    if (!s.muted) {
      const req: ChimeRequest = { volume: s.volume }
      broadcast('timer:chime', req)
    }
    void finished
  })
}
