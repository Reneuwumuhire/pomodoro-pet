import { exec } from 'child_process'
import { TimerEngine } from './timer'
import { closeBlockerWindow, showBlockerWindow } from './windows'

// Frontmost app name + its front-window title.
const FRONT_SCRIPT = `tell application "System Events"
  set p to first process whose frontmost is true
  set appName to name of p
  set winTitle to ""
  try
    set winTitle to name of front window of p
  end try
  return appName & "||" & winTitle
end tell`

// Chromium-family browsers expose "active tab"; Safari uses "current tab".
const CHROMIUM = [
  'Arc', 'Dia', 'Google Chrome', 'Google Chrome Canary', 'Brave Browser',
  'Microsoft Edge', 'Vivaldi', 'Chromium', 'Opera'
]
function isBrowser(app: string): boolean {
  return CHROMIUM.includes(app) || app === 'Safari' || app === 'Safari Technology Preview'
}
function tabAccessor(app: string): string {
  return app === 'Safari' || app === 'Safari Technology Preview' ? 'current tab' : 'active tab'
}
function urlScript(app: string): string | null {
  if (!isBrowser(app)) return null
  return `tell application "${app}" to get URL of ${tabAccessor(app)} of front window`
}

function run(script: string): Promise<{ out: string; err: string }> {
  return new Promise((res) => {
    exec(`osascript -e '${script.replace(/'/g, "'\\''")}'`, { timeout: 1500 }, (e, out, se) =>
      res({ out: (out || '').trim(), err: e ? se || e.message : '' })
    )
  })
}

export interface Detection {
  app: string
  title: string
  url: string
  error: string
}

/** What is the user looking at right now? Reads the active app + browser URL. */
export async function detectFront(): Promise<Detection> {
  const front = await run(FRONT_SCRIPT)
  if (front.err) return { app: '', title: '', url: '', error: front.err }
  const [app = '', title = ''] = front.out.split('||')
  let url = ''
  const us = urlScript(app)
  if (us) {
    const r = await run(us)
    if (!r.err) url = r.out
  }
  return { app, title, url, error: '' }
}

/** Tokens to match for a blocklist entry: "https://youtube.com/x" -> ["youtube.com","youtube"]. */
function tokens(entry: string): string[] {
  const e = entry.toLowerCase().trim().replace(/^https?:\/\//, '').replace(/^www\./, '')
  const host = e.split('/')[0]
  const main = host.split('.')[0]
  return [...new Set([host, main, e])].filter((t) => t.length >= 3)
}

/** Which blocklist entry (if any) matches what's on screen. */
export function matchBlock(d: Detection, blockList: string[]): string | null {
  const a = d.app.toLowerCase()
  if (a.includes('pomodoro') || a.includes('electron')) return null
  const hay = `${d.app} ${d.title} ${d.url}`.toLowerCase()
  return blockList.find((e) => tokens(e).some((t) => hay.includes(t))) ?? null
}

function matchesUrl(url: string, blockList: string[]): string | null {
  const u = url.toLowerCase()
  return blockList.find((e) => tokens(e).some((t) => u.includes(t))) ?? null
}

/**
 * The real enforcement: for a browser, find every window whose active tab is a
 * blocked site and navigate it to about:blank. Returns the matched entry (if
 * any) so the caller can also show the overlay. Browser-agnostic, no root.
 */
async function enforceBrowser(app: string, blockList: string[]): Promise<string | null> {
  const acc = tabAccessor(app)
  const enumScript = `tell application "${app}"
set out to ""
set i to 0
repeat with w in windows
set i to i + 1
try
set out to out & i & "||" & (URL of ${acc} of w) & "\n"
end try
end repeat
return out
end tell`
  const r = await run(enumScript)
  if (r.err) return null

  let matched: string | null = null
  const hitIdx: number[] = []
  for (const ln of r.out.split('\n').map((l) => l.trim()).filter(Boolean)) {
    const [idx, url = ''] = ln.split('||')
    const hit = matchesUrl(url, blockList)
    if (hit) {
      hitIdx.push(parseInt(idx, 10))
      matched = hit
    }
  }
  if (hitIdx.length) {
    const redir =
      `tell application "${app}"\n` +
      hitIdx
        .map((i) => `try\nset URL of ${acc} of window ${i} to "about:blank"\nend try`)
        .join('\n') +
      `\nend tell`
    await run(redir)
  }
  return matched
}

let engineRef: TimerEngine | null = null
let timer: ReturnType<typeof setInterval> | null = null
let blockedNow: string | null = null
let snoozeUntil = 0

function guardActive(): boolean {
  if (!engineRef) return false
  const s = engineRef.getState()
  return (
    s.settings.strictMode &&
    s.phase === 'focus' &&
    s.status === 'running' &&
    s.settings.blockList.length > 0
  )
}

async function poll(): Promise<void> {
  if (!engineRef) return
  if (!guardActive()) {
    stopGuard()
    return
  }
  if (Date.now() < snoozeUntil) return

  const d = await detectFront()
  if (process.env['POMO_GUARD_DEBUG'])
    console.log('[guard] app=%j title=%j url=%j err=%j', d.app, d.title, d.url, d.error)
  if (d.error || !d.app) return // can't see (no permission) — fail open
  // Ignore our own windows (e.g. the overlay itself is frontmost) — never use
  // that as a reason to close the overlay, or it flickers and lets the page show.
  const a = d.app.toLowerCase()
  if (a.includes('pomodoro') || a.includes('electron')) return

  const blockList = engineRef.getState().settings.blockList
  // For browsers, actively navigate any blocked tab away (the real block).
  let hit: string | null = null
  if (isBrowser(d.app)) hit = await enforceBrowser(d.app, blockList)
  // Fallback for native apps (e.g. "Slack") or when no tab matched.
  if (!hit) hit = matchBlock(d, blockList)

  if (process.env['POMO_GUARD_DEBUG']) console.log('[guard] hit=%j', hit)

  if (hit) {
    blockedNow = hit
    showBlockerWindow(hit)
  } else if (blockedNow) {
    blockedNow = null
    closeBlockerWindow()
  }
}

export function setupFocusGuard(engine: TimerEngine): void {
  // The active-window detection + tab redirect is macOS-only (AppleScript).
  if (process.platform !== 'darwin') return
  engineRef = engine
  engine.onChange(() => {
    if (guardActive() && !timer) {
      timer = setInterval(poll, 1200)
      void poll()
    } else if (!guardActive() && timer) {
      stopGuard()
    }
  })
}

/** Run one detection immediately (used by the Settings "Test" button). */
export async function testGuard(): Promise<Detection & { blocked: string | null }> {
  if (process.platform !== 'darwin') {
    return { app: '', title: '', url: '', error: 'unsupported-os', blocked: null }
  }
  const d = await detectFront()
  const blocked = engineRef ? matchBlock(d, engineRef.getState().settings.blockList) : null
  return { ...d, blocked }
}

export function snoozeGuard(seconds = 6): void {
  snoozeUntil = Date.now() + seconds * 1000
  blockedNow = null
  closeBlockerWindow()
}

export function stopGuard(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  blockedNow = null
  closeBlockerWindow()
}
