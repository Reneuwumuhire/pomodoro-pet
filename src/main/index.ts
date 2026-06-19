import { app, BrowserWindow, globalShortcut } from 'electron'
import { TimerEngine } from './timer'
import { registerIpc } from './ipc'
import { createMainWindow, createTray, showBlockerWindow, showMini, toggleMini } from './windows'
import { ensureMusicDir, registerMusicProtocol, registerMusicScheme } from './music'
import { setupFocusGuard, stopGuard } from './focusGuard'
import { setupAboutPanel } from './update'

// Must run before app `ready`.
registerMusicScheme()

let engine: TimerEngine | null = null

// Single instance — focus the existing window if launched twice.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => createMainWindow())

  app.whenReady().then(() => {
    // Menu-bar app: hide the dock icon so it lives in the tray.
    if (process.platform === 'darwin') app.dock?.hide()

    registerMusicProtocol()
    ensureMusicDir()
    setupAboutPanel()

    engine = new TimerEngine()
    registerIpc(engine)
    setupFocusGuard(engine)
    createTray(engine)
    createMainWindow()

    // Global shortcut: show/hide the floating mini widget from anywhere.
    globalShortcut.register('CommandOrControl+Shift+M', () => toggleMini())

    // Dev-only: auto-start the countdown for visual verification.
    if (process.env['POMO_PHASE'] === 'short') engine.skip() // focus -> short break
    if (process.env['POMO_AUTOSTART']) engine.start()
    if (process.env['POMO_MINI']) showMini()
    if (process.env['POMO_BLOCK']) showBlockerWindow('youtube.com')

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
    })
  })

  // Tray app stays alive when all windows are closed.
  app.on('window-all-closed', () => {
    // Intentionally do not quit — the tray keeps the timer running.
  })

  app.on('before-quit', () => {
    globalShortcut.unregisterAll()
    stopGuard()
    engine?.dispose()
  })
}
