import { app, net, protocol, shell } from 'electron'
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'fs'
import { basename, join } from 'path'
import { pathToFileURL } from 'url'
import { getSettings } from './store'

export const SCHEME = 'pomo-audio'

/** Ambient slot key (used by the renderer) -> filename the user drops in to override it. */
export const SLOT_FILES: Record<string, string> = {
  rain: 'rain.mp3',
  brown: 'ocean.mp3',
  whitenoise: 'white.mp3',
  cafe: 'cafe.mp3'
}

export function musicDir(): string {
  return join(app.getPath('userData'), 'music')
}

function isDir(p: string): boolean {
  try {
    return !!p && existsSync(p) && statSync(p).isDirectory()
  } catch {
    return false
  }
}

/** The folder we actually read songs from: the user's chosen folder, else the app folder. */
export function activeMusicDir(): string {
  const custom = getSettings().musicFolder
  return isDir(custom) ? custom : musicDir()
}

export function isCustomMusicDir(): boolean {
  return isDir(getSettings().musicFolder)
}

const README = `Petomato — custom music
============================

MUSIC — drop any songs here (.mp3, .m4a, .wav, .ogg, .flac).
They become your playlist: songs play one after another during sessions, and
you can fast-forward (⏩) or jump to the next song (⏭) from the speaker bar.
If the folder has no songs, a built-in lo-fi loop plays instead.

AMBIENT — these exact names override the built-in ambient loops:
  rain.mp3   →  "Rain"
  ocean.mp3  →  "Ocean"
  white.mp3  →  "White" noise
  cafe.mp3   →  "Café"
(They're treated as ambient, not added to the song playlist.)

Free, royalty-free music to drop in (download in your browser):
  • https://pixabay.com/music/   (Pixabay Content License — free, no attribution)

Changes apply when you start the next session (no restart needed).
`

export function ensureMusicDir(): void {
  const dir = musicDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const readme = join(dir, 'README.txt')
  if (!existsSync(readme)) writeFileSync(readme, README)
}

const AMBIENT_SLOTS = ['rain.mp3', 'ocean.mp3', 'white.mp3', 'cafe.mp3']
const AUDIO_EXT = /\.(mp3|m4a|aac|wav|ogg|oga|flac)$/i

/** All songs in the active music folder = the playlist (excludes the ambient slots). */
export function audioLibrary(): string[] {
  const dir = activeMusicDir()
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => AUDIO_EXT.test(f) && !AMBIENT_SLOTS.includes(f.toLowerCase()))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
}

/** Which slots currently have a custom file present (ambient overrides live in the active folder). */
export function audioSlots(): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  for (const [slot, file] of Object.entries(SLOT_FILES)) {
    out[slot] = existsSync(join(activeMusicDir(), file))
  }
  return out
}

export function openMusicFolder(): void {
  if (!isCustomMusicDir()) ensureMusicDir()
  void shell.openPath(activeMusicDir())
}

/** Active folder path + whether it's user-chosen + how many songs it holds. */
export function musicFolderInfo(): { path: string; isCustom: boolean; count: number } {
  return { path: activeMusicDir(), isCustom: isCustomMusicDir(), count: audioLibrary().length }
}

/** Must be called once, before app `ready`. */
export function registerMusicScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: SCHEME, privileges: { secure: true, supportFetchAPI: true, stream: true, bypassCSP: false } }
  ])
}

/** Must be called once, after app `ready`. Serves files from the music folder. */
export function registerMusicProtocol(): void {
  protocol.handle(SCHEME, (request) => {
    const url = new URL(request.url)
    // Decode (allows spaces/unicode in song names) and take only the basename
    // so the request can never escape the music folder.
    const name = basename(decodeURIComponent(url.pathname.replace(/^\/+/, '')))
    const file = join(activeMusicDir(), name)
    if (!name || !existsSync(file)) return new Response('not found', { status: 404 })
    return net.fetch(pathToFileURL(file).toString())
  })
}
