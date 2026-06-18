// Bridge so the speaker bar can drive the music element owned by useAudio.

export interface NowPlaying {
  name: string // display name of the current track ('' if none)
  hasLibrary: boolean // true when the music folder has songs to skip through
}

interface Handlers {
  next: () => void
  forward: (seconds: number) => void
  now: () => NowPlaying
}

let handlers: Handlers = {
  next: () => {},
  forward: () => {},
  now: () => ({ name: '', hasLibrary: false })
}

export function setMusicHandlers(h: Handlers): void {
  handlers = h
}
export function nextTrack(): void {
  handlers.next()
}
export function forwardTrack(seconds = 30): void {
  handlers.forward(seconds)
}
export function nowPlaying(): NowPlaying {
  return handlers.now()
}

/** "My Song 01.mp3" -> "My Song 01" */
export function prettyTrack(file: string): string {
  return file.replace(/\.[a-z0-9]+$/i, '').replace(/[_]+/g, ' ')
}
