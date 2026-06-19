import { app, net, shell } from 'electron'

const REPO = 'Reneuwumuhire/petomato'

export interface AppMeta {
  name: string
  version: string
  author: string
  authorUrl: string
  repoUrl: string
  siteUrl: string
}

export interface UpdateInfo {
  current: string
  latest: string | null
  hasUpdate: boolean
  releaseUrl: string
  assetUrl: string
  error?: string
}

export function appMeta(): AppMeta {
  return {
    name: 'Petomato',
    version: app.getVersion(),
    author: 'Rene Uwumuhire',
    authorUrl: 'https://github.com/Reneuwumuhire',
    repoUrl: `https://github.com/${REPO}`,
    siteUrl: 'https://reneuwumuhire.github.io/petomato/'
  }
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
export async function checkForUpdate(): Promise<UpdateInfo> {
  const current = app.getVersion()
  const releaseUrl = `https://github.com/${REPO}/releases`
  try {
    const res = await net.fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { 'User-Agent': 'Petomato', Accept: 'application/vnd.github+json' }
    })
    if (!res.ok) return { current, latest: null, hasUpdate: false, releaseUrl, assetUrl: releaseUrl, error: 'network' }
    const rel = (await res.json()) as {
      tag_name?: string
      html_url?: string
      assets?: { name: string; browser_download_url: string }[]
    }
    const latest = (rel.tag_name || '').replace(/^v/i, '')
    const hasUpdate = !!latest && cmp(latest, current) > 0
    // pick the installer for this platform
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
    return { current, latest: null, hasUpdate: false, releaseUrl, assetUrl: releaseUrl, error: 'network' }
  }
}

export function openExternal(url: string): void {
  if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
}
