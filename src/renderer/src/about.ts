import './styles/about.css'
import iconUrl from './assets/icon.png'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'

interface Meta {
  name: string
  version: string
  author: string
  authorUrl: string
  repoUrl: string
  siteUrl: string
  description: string
}

const REPO = 'Reneuwumuhire/petomato'
const open = (url: string): void => void invoke('open_external', { url })

/** Compare dotted versions: true if `latest` > `current`. */
function isNewer(latest: string, current: string): boolean {
  const a = latest.split('.').map((n) => parseInt(n, 10) || 0)
  const b = current.split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) > (b[i] || 0)) return true
    if ((a[i] || 0) < (b[i] || 0)) return false
  }
  return false
}

async function render(): Promise<void> {
  const m = await invoke<Meta>('app_meta')
  const root = document.getElementById('about-root')!
  root.innerHTML = `
    <div class="about-drag" data-tauri-drag-region></div>
    <button class="about-close" id="x" title="Close">✕</button>
    <img class="about-icon" src="${iconUrl}" alt="Petomato" width="80" height="80" draggable="false" />
    <div class="about-name">${m.name}</div>
    <div class="about-version">Version ${m.version}</div>
    <p class="about-desc">${m.description}</p>
    <div class="about-links">
      <button id="lk-site" type="button">Website</button>
      <button id="lk-gh" type="button">GitHub</button>
    </div>
    <button id="check" class="about-check" type="button">Check for Updates</button>
    <div id="status" class="about-status"></div>
    <div class="about-by">Made by <button id="lk-author" class="link" type="button">${m.author}</button></div>
  `
  ;(document.getElementById('x') as HTMLElement).onclick = () => void getCurrentWindow().close()
  ;(document.getElementById('lk-site') as HTMLElement).onclick = () => open(m.siteUrl)
  ;(document.getElementById('lk-gh') as HTMLElement).onclick = () => open(m.repoUrl)
  ;(document.getElementById('lk-author') as HTMLElement).onclick = () => open(m.authorUrl)

  const status = document.getElementById('status') as HTMLElement
  const check = document.getElementById('check') as HTMLButtonElement
  check.onclick = async (): Promise<void> => {
    check.disabled = true
    status.className = 'about-status'
    status.textContent = 'Checking…'
    try {
      const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
        headers: { Accept: 'application/vnd.github+json' }
      })
      if (!res.ok) throw new Error('network')
      const rel = (await res.json()) as {
        tag_name?: string
        html_url?: string
        assets?: { name: string; browser_download_url: string }[]
      }
      const latest = (rel.tag_name || '').replace(/^v/i, '')
      if (latest && isNewer(latest, m.version)) {
        const dmg = (rel.assets || []).find((a) => /\.dmg$/i.test(a.name))
        const url = dmg?.browser_download_url || rel.html_url || `https://github.com/${REPO}/releases`
        status.className = 'about-status up'
        status.innerHTML = `Update available — v${latest}. <button class="link" id="dl" type="button">Download</button>`
        ;(document.getElementById('dl') as HTMLElement).onclick = () => open(url)
      } else {
        status.className = 'about-status ok'
        status.textContent = `You’re on the latest version ✓`
      }
    } catch {
      status.innerHTML = `Couldn’t reach GitHub. <button class="link" id="op" type="button">Open Releases</button>`
      ;(document.getElementById('op') as HTMLElement).onclick = () => open(`https://github.com/${REPO}/releases`)
    } finally {
      check.disabled = false
    }
  }
}

void render()
