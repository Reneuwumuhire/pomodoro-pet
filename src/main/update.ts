import { app, dialog, net, shell } from 'electron'

const REPO = 'Reneuwumuhire/petomato'
const SITE = 'https://reneuwumuhire.github.io/petomato/'
const AUTHOR = 'Rene Uwumuhire'
const AUTHOR_URL = 'https://github.com/Reneuwumuhire'

interface UpdateInfo {
  current: string
  latest: string | null
  hasUpdate: boolean
  releaseUrl: string
  assetUrl: string
  error?: boolean
}

/** Configure the native "About Petomato" panel (app/creator/version/links). */
export function setupAboutPanel(): void {
  app.setAboutPanelOptions({
    applicationName: 'Petomato',
    applicationVersion: `Version ${app.getVersion()}`,
    version: '',
    copyright: `© ${AUTHOR}`,
    authors: [AUTHOR],
    website: SITE,
    credits:
      `A retro-LCD Pomodoro timer with a pixel pet that grows as you focus.\n` +
      `Made by ${AUTHOR} — ${AUTHOR_URL}\n${SITE}`
  })
}

/** Compare dotted versions: 1 if a > b, -1 if a < b, 0 if equal. */
function cmp(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0
    const y = pb[i] || 0
    if (x > y) return 1
    if (x < y) return -1
  }
  return 0
}

/** Ask GitHub for the newest release and compare it to the running version. */
async function checkForUpdate(): Promise<UpdateInfo> {
  const current = app.getVersion()
  const releaseUrl = `https://github.com/${REPO}/releases`
  try {
    const res = await net.fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { 'User-Agent': 'Petomato', Accept: 'application/vnd.github+json' }
    })
    if (!res.ok) return { current, latest: null, hasUpdate: false, releaseUrl, assetUrl: releaseUrl, error: true }
    const rel = (await res.json()) as {
      tag_name?: string
      html_url?: string
      assets?: { name: string; browser_download_url: string }[]
    }
    const latest = (rel.tag_name || '').replace(/^v/i, '')
    const hasUpdate = !!latest && cmp(latest, current) > 0
    const re = process.platform === 'win32' ? /\.exe$/i : /\.dmg$/i
    const asset = (rel.assets || []).find((a) => re.test(a.name))
    return {
      current,
      latest: latest || null,
      hasUpdate,
      releaseUrl: rel.html_url || releaseUrl,
      assetUrl: asset?.browser_download_url || rel.html_url || releaseUrl
    }
  } catch {
    return { current, latest: null, hasUpdate: false, releaseUrl, assetUrl: releaseUrl, error: true }
  }
}

/** "Check for Updates…" — checks GitHub and reports via a native dialog. */
export async function checkForUpdatesInteractive(): Promise<void> {
  const info = await checkForUpdate()
  if (info.error) {
    const r = await dialog.showMessageBox({
      type: 'warning',
      message: 'Couldn’t check for updates',
      detail: 'Could not reach GitHub. Open the releases page in your browser?',
      buttons: ['Open Releases', 'Cancel'],
      defaultId: 0,
      cancelId: 1
    })
    if (r.response === 0) void shell.openExternal(info.releaseUrl)
    return
  }
  if (info.hasUpdate) {
    const r = await dialog.showMessageBox({
      type: 'info',
      message: `Petomato v${info.latest} is available`,
      detail: `You have v${info.current}. Download the new version now?`,
      buttons: ['Download', 'Later'],
      defaultId: 0,
      cancelId: 1
    })
    if (r.response === 0) void shell.openExternal(info.assetUrl)
  } else {
    await dialog.showMessageBox({
      type: 'info',
      message: 'You’re up to date',
      detail: `Petomato v${info.current} is the latest version.`,
      buttons: ['OK']
    })
  }
}
