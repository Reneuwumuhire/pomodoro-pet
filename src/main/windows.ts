import { app, BrowserWindow, Menu, nativeImage, screen, Tray } from 'electron'
import { writeFileSync } from 'fs'
import { join } from 'path'
import { TimerEngine } from './timer'

const isDev = !app.isPackaged

let mainWindow: BrowserWindow | null = null
let miniWindow: BrowserWindow | null = null
let strictWindow: BrowserWindow | null = null
let blockerWindow: BrowserWindow | null = null
let tray: Tray | null = null
// When true, the popover won't auto-hide on blur (e.g. while a native dialog is open).
let popoverPinned = false

export function setPopoverPinned(v: boolean): void {
  popoverPinned = v
}

export function mainWin(): BrowserWindow | null {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
}

const preload = (): string => join(__dirname, '../preload/index.mjs')

type Entry = 'index' | 'mini' | 'strict' | 'blocked'

function entryUrl(entry: Entry): { url?: string; file?: string } {
  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    return { url: `${process.env['ELECTRON_RENDERER_URL']}/${entry}.html` }
  }
  return { file: join(__dirname, `../renderer/${entry}.html`) }
}

function loadEntry(win: BrowserWindow, entry: Entry, query = ''): void {
  const { url, file } = entryUrl(entry)
  if (url) win.loadURL(url + query)
  else if (file) win.loadFile(file!, query ? { search: query } : undefined)
}

function maybeCapture(win: BrowserWindow, envKey: string): void {
  const out = process.env[envKey]
  if (!out) return
  win.webContents.once('did-finish-load', () => {
    setTimeout(async () => {
      const img = await win.webContents.capturePage()
      writeFileSync(out, img.toPNG())
    }, 2000)
  })
}

// ---- main window (menu-bar popover) ----------------------------------------
const PANEL_W = 420
const PANEL_H = 600

/** Anchor the popover just under the tray icon, clamped to the screen. */
function positionUnderTray(win: BrowserWindow): void {
  const trayBounds = tray?.getBounds()
  const display = trayBounds
    ? screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y })
    : screen.getPrimaryDisplay()
  const area = display.workArea
  const [w, h] = win.getSize()

  let x: number
  let y: number
  if (trayBounds && trayBounds.width) {
    x = Math.round(trayBounds.x + trayBounds.width / 2 - w / 2)
    y = Math.round(trayBounds.y + trayBounds.height + 6) // drop just below the menu bar
  } else {
    x = Math.round(area.x + area.width - w - 12)
    y = Math.round(area.y + 8)
  }
  // keep fully on-screen
  x = Math.max(area.x + 8, Math.min(x, area.x + area.width - w - 8))
  y = Math.max(area.y + 8, Math.min(y, area.y + area.height - h - 8))
  win.setPosition(x, y, false)
  if (isDev && process.env['POMO_POPOVER_DEBUG'])
    console.log('[popover] tray=%j -> pos=%j area=%j', trayBounds, { x, y }, area)
}

export function createMainWindow(): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) {
    showMain()
    return mainWindow
  }
  mainWindow = new BrowserWindow({
    width: PANEL_W,
    height: PANEL_H,
    resizable: false,
    movable: true,
    frame: false,
    transparent: true,
    hasShadow: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: { preload: preload(), sandbox: false }
  })
  mainWindow.setAlwaysOnTop(true, 'floating')
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  const q = isDev && process.env['POMO_PANEL'] ? `?panel=${process.env['POMO_PANEL']}` : ''
  loadEntry(mainWindow, 'index', q)
  // Anchor under the tray the first time it opens; after that the user can drag
  // it and we keep wherever they put it.
  mainWindow.on('ready-to-show', () => {
    if (!mainWindow) return
    positionUnderTray(mainWindow)
    mainWindow.show()
  })
  mainWindow.on('closed', () => (mainWindow = null))
  maybeCapture(mainWindow, 'POMO_SHOT')
  return mainWindow
}

/** Hide the popover (it's a draggable widget now, so no auto hide-on-blur). */
export function hideMain(): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide()
}

/** True only if a usable chunk of the window overlaps some display's work area.
 *  Guards against a remembered position that's now off-screen (dragged to an
 *  edge, or a display that was disconnected) — the classic "window is invisible
 *  but the tray/mini still work" case. */
function isOnScreen(win: BrowserWindow): boolean {
  const b = win.getBounds()
  return screen.getAllDisplays().some((d) => {
    const a = d.workArea
    const w = Math.min(b.x + b.width, a.x + a.width) - Math.max(b.x, a.x)
    const h = Math.min(b.y + b.height, a.y + a.height) - Math.max(b.y, a.y)
    return w > 100 && h > 100
  })
}

/** Show the popover and hide the mini — only one is ever visible. Keeps the
 *  last position, but re-anchors under the tray if it drifted off-screen. */
export function showMain(): void {
  closeMiniWindow()
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow()
    return
  }
  if (!isOnScreen(mainWindow)) positionUnderTray(mainWindow)
  mainWindow.setAlwaysOnTop(true, 'floating')
  mainWindow.show()
  mainWindow.moveTop()
  mainWindow.focus()
}

export function toggleMainWindow(): void {
  // Hide only when it's genuinely visible AND on-screen; if it's "visible" but
  // off-screen (invisible to the user), fall through to show it on-screen.
  if (
    mainWindow &&
    !mainWindow.isDestroyed() &&
    mainWindow.isVisible() &&
    isOnScreen(mainWindow) &&
    !miniVisible()
  ) {
    mainWindow.hide()
  } else {
    showMain()
  }
}

// ---- mini widget -----------------------------------------------------------
function miniVisible(): boolean {
  return !!miniWindow && !miniWindow.isDestroyed() && miniWindow.isVisible()
}

/** Pin the mini to the top-right of the screen that holds the menu bar. */
function positionMiniTopRight(win: BrowserWindow): void {
  const trayBounds = tray?.getBounds()
  const display = trayBounds
    ? screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y })
    : screen.getPrimaryDisplay()
  const area = display.workArea
  const [w] = win.getSize()
  win.setPosition(Math.round(area.x + area.width - w - 12), Math.round(area.y + 12), false)
}

/** Show the mini and hide the main — never both at once. Main stays alive
 *  (hidden) so its audio keeps playing. */
export function showMini(): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide()
  if (miniWindow && !miniWindow.isDestroyed()) {
    positionMiniTopRight(miniWindow)
    miniWindow.show()
    miniWindow.focus()
    return
  }
  miniWindow = new BrowserWindow({
    width: 280,
    height: 248,
    resizable: false,
    frame: false,
    transparent: true,
    hasShadow: true,
    alwaysOnTop: true,
    fullscreenable: false,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    webPreferences: { preload: preload(), sandbox: false }
  })
  miniWindow.setAlwaysOnTop(true, 'floating')
  miniWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  miniWindow.once('ready-to-show', () => miniWindow && positionMiniTopRight(miniWindow))
  positionMiniTopRight(miniWindow)
  loadEntry(miniWindow, 'mini')
  miniWindow.on('closed', () => (miniWindow = null))
  maybeCapture(miniWindow, 'POMO_SHOT_MINI')
}

export function closeMiniWindow(): void {
  if (miniWindow && !miniWindow.isDestroyed()) miniWindow.close()
  miniWindow = null
}

export function isMiniVisible(): boolean {
  return miniVisible()
}

/** One-tap show/hide for the floating mini widget. */
export function toggleMini(): void {
  if (miniVisible()) closeMiniWindow()
  else showMini()
}

// ---- strict-mode fullscreen break -----------------------------------------
export function openStrictWindow(): void {
  if (strictWindow && !strictWindow.isDestroyed()) {
    strictWindow.show()
    return
  }
  const { width, height } = screen.getPrimaryDisplay().bounds
  strictWindow = new BrowserWindow({
    x: 0,
    y: 0,
    width,
    height,
    frame: false,
    transparent: false,
    backgroundColor: '#0d1410',
    alwaysOnTop: true,
    fullscreenable: true,
    skipTaskbar: true,
    kiosk: true,
    webPreferences: { preload: preload(), sandbox: false }
  })
  strictWindow.setAlwaysOnTop(true, 'screen-saver')
  strictWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  loadEntry(strictWindow, 'strict')
  strictWindow.on('closed', () => (strictWindow = null))
  maybeCapture(strictWindow, 'POMO_SHOT_STRICT')
}

export function closeStrictWindow(): void {
  if (strictWindow && !strictWindow.isDestroyed()) strictWindow.close()
  strictWindow = null
}

// ---- distraction blocker overlay ------------------------------------------
function raiseBlocker(win: BrowserWindow): void {
  // Forcefully bring the overlay above everything and take focus so the
  // distraction is hidden and can't be interacted with.
  app.focus({ steal: true })
  win.setAlwaysOnTop(true, 'screen-saver')
  win.show()
  win.focus()
  win.moveTop()
}

export function showBlockerWindow(site: string): void {
  const { width, height } = screen.getPrimaryDisplay().bounds
  if (blockerWindow && !blockerWindow.isDestroyed()) {
    blockerWindow.webContents.send('blocker:site', site)
    raiseBlocker(blockerWindow)
    return
  }
  blockerWindow = new BrowserWindow({
    x: 0,
    y: 0,
    width,
    height,
    frame: false,
    backgroundColor: '#120d0d',
    alwaysOnTop: true,
    fullscreenable: true,
    skipTaskbar: true,
    show: false,
    webPreferences: { preload: preload(), sandbox: false }
  })
  blockerWindow.setAlwaysOnTop(true, 'screen-saver')
  blockerWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  loadEntry(blockerWindow, 'blocked', `?site=${encodeURIComponent(site)}`)
  blockerWindow.on('closed', () => (blockerWindow = null))
  blockerWindow.once('ready-to-show', () => {
    if (blockerWindow) raiseBlocker(blockerWindow)
  })
  maybeCapture(blockerWindow, 'POMO_SHOT_BLOCKED')
}

export function closeBlockerWindow(): void {
  if (blockerWindow && !blockerWindow.isDestroyed()) blockerWindow.close()
  blockerWindow = null
}

/** Open/close the strict overlay to match the current phase + setting. */
export function syncStrictWindow(engine: TimerEngine): void {
  const s = engine.getState()
  const breakRunning =
    s.settings.strictMode && (s.phase === 'short' || s.phase === 'long') && s.status === 'running'
  if (breakRunning) openStrictWindow()
  else closeStrictWindow()
}

// ---- broadcasting ----------------------------------------------------------
export function allWindows(): BrowserWindow[] {
  return [mainWindow, miniWindow, strictWindow, blockerWindow].filter(
    (w): w is BrowserWindow => !!w && !w.isDestroyed()
  )
}

// ---- tray ------------------------------------------------------------------
function formatTime(ms: number): string {
  const total = Math.round(ms / 1000)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}
const PHASE_LABEL: Record<string, string> = {
  focus: 'Focus',
  short: 'Short break',
  long: 'Long break'
}

export function createTray(engine: TimerEngine): Tray {
  // macOS uses a monochrome "template" icon that adapts to the menu bar;
  // Windows/Linux need a regular colored icon (template would render black).
  const isMac = process.platform === 'darwin'
  const iconFile = isMac ? 'trayTemplate.png' : 'trayWin.png'
  const base = isDev ? join(process.cwd(), 'resources') : join(process.resourcesPath, 'resources')
  let image = nativeImage.createFromPath(join(base, iconFile))
  if (image.isEmpty()) image = nativeImage.createEmpty()
  if (isMac) image.setTemplateImage(true)
  tray = new Tray(image)
  tray.setToolTip('Petomato')

  const refresh = (): void => {
    if (!tray || tray.isDestroyed()) return
    const s = engine.getState()
    tray.setTitle(s.status === 'idle' ? '' : ` ${formatTime(s.remainingMs)}`)
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: `${PHASE_LABEL[s.phase]} — ${formatTime(s.remainingMs)}`, enabled: false },
        { type: 'separator' },
        { label: s.status === 'running' ? 'Pause' : 'Start', click: () => engine.toggle() },
        { label: 'Reset', click: () => engine.reset() },
        { label: 'Skip', click: () => engine.skip() },
        { type: 'separator' },
        { label: 'Open Window', click: () => showMain() },
        {
          label: miniVisible() ? 'Hide Mini Widget' : 'Show Mini Widget',
          accelerator: 'CommandOrControl+Shift+M',
          click: () => toggleMini()
        },
        { type: 'separator' },
        { label: 'Quit', click: () => app.quit() }
      ])
    )
  }
  tray.on('click', () => toggleMainWindow())
  engine.onChange(() => refresh())
  refresh()
  return tray
}
