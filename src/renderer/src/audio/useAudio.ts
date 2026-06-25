import { useCallback, useEffect, useRef, useState } from 'react'
import { usePomodoro } from '@/state/usePomodoro'
import { connectElement, resume, setElementVolume, setPlaying } from './audioBus'
import { prettyTrack, setMusicHandlers } from './musicControls'

import lofi1Url from '../assets/audio/lofi1.mp3'
import lofi2Url from '../assets/audio/lofi2.mp3'
import lofi3Url from '../assets/audio/lofi3.mp3'
import lofi4Url from '../assets/audio/lofi4.mp3'
import rainUrl from '../assets/audio/rain.mp3'
import whiteUrl from '../assets/audio/whitenoise.mp3'
import brownUrl from '../assets/audio/brown.mp3'
import cafeUrl from '../assets/audio/cafe.mp3'

const BUNDLED: Record<string, string> = {
  lofi1: lofi1Url,
  lofi2: lofi2Url,
  lofi3: lofi3Url,
  lofi4: lofi4Url,
  rain: rainUrl,
  whitenoise: whiteUrl,
  brown: brownUrl,
  cafe: cafeUrl
}
// Ambient drop-in overrides, keyed by slot.
const AMBIENT_FILE: Record<string, string> = {
  rain: 'rain.mp3',
  whitenoise: 'white.mp3',
  brown: 'ocean.mp3',
  cafe: 'cafe.mp3'
}
// Folder a custom song lives in (from settings.musicFolder). The Tauri build uses it
// to build an asset: URL; Electron ignores it and uses the pomo-audio:// protocol.
let currentMusicDir = ''
const trackUrl = (file: string): string => {
  const conv = (window as unknown as { __convertFileSrc?: (p: string) => string }).__convertFileSrc
  if (conv && currentMusicDir) return conv(`${currentMusicDir}/${file}`)
  return `pomo-audio://local/${encodeURIComponent(file)}`
}

function ambientUrl(slot: string, slots: Record<string, boolean>): string {
  if (slots[slot]) return trackUrl(AMBIENT_FILE[slot])
  return BUNDLED[slot]
}

/**
 * Drives music + ambient playback from the live timer state. The music folder
 * is treated as a playlist: songs auto-advance, and the speaker bar can skip /
 * fast-forward. Falls back to the bundled loop when the folder is empty.
 */
export function useAudio(): void {
  const state = usePomodoro((s) => s.state)
  const musicRef = useRef<HTMLAudioElement | null>(null)
  const ambientRef = useRef<HTMLAudioElement | null>(null)
  const libraryRef = useRef<string[]>([])
  const idxRef = useRef(0)
  const [slots, setSlots] = useState<Record<string, boolean>>({})

  // play song i from the library (wraps around)
  const playIndex = useCallback((i: number): void => {
    const lib = libraryRef.current
    const m = musicRef.current
    if (!lib.length || !m) return
    idxRef.current = ((i % lib.length) + lib.length) % lib.length
    const url = trackUrl(lib[idxRef.current])
    m.loop = false
    m.src = url
    m.dataset.url = url
    m.currentTime = 0
    resume()
    void m.play().catch(() => {})
  }, [])

  // expose next / fast-forward / now-playing to the speaker bar
  useEffect(() => {
    setMusicHandlers({
      next: () => playIndex(idxRef.current + 1),
      forward: (sec) => {
        const m = musicRef.current
        if (!m) return
        const dur = Number.isFinite(m.duration) ? m.duration : m.currentTime + sec
        if (m.currentTime + sec >= dur && libraryRef.current.length) playIndex(idxRef.current + 1)
        else m.currentTime = m.currentTime + sec
      },
      now: () => ({
        name: libraryRef.current.length ? prettyTrack(libraryRef.current[idxRef.current]) : '',
        hasLibrary: libraryRef.current.length > 0
      })
    })
  }, [playIndex])

  // load the library + which ambient slots are overridden; refresh on run-start
  useEffect(() => {
    const load = (): void => {
      window.pomodoro.getAudioSlots().then(setSlots).catch(() => {})
      window.pomodoro
        .getMusicLibrary()
        .then((lib) => {
          libraryRef.current = lib
          if (idxRef.current >= lib.length) idxRef.current = 0
        })
        .catch(() => {})
    }
    load()
    const off = window.pomodoro.onState((s) => {
      if (s.status === 'running') load()
    })
    return off
  }, [])

  // reload the playlist immediately when the music folder changes
  const musicFolder = state?.settings.musicFolder
  useEffect(() => {
    currentMusicDir = musicFolder ?? ''
    window.pomodoro
      .getMusicLibrary()
      .then((lib) => {
        libraryRef.current = lib
        if (idxRef.current >= lib.length) idxRef.current = 0
      })
      .catch(() => {})
  }, [musicFolder])

  // create the two audio elements once
  useEffect(() => {
    const m = new Audio()
    const a = new Audio()
    // Folder songs are served from http://asset.localhost — a DIFFERENT origin than
    // the app. Routed through a MediaElementSource (audioBus), cross-origin media
    // without CORS is silenced by WebKit (it "plays" but outputs nothing). Request
    // it CORS-clean so the Web Audio graph actually produces sound; Tauri's asset
    // protocol replies with Access-Control-Allow-Origin, and same-origin bundled
    // tracks are unaffected.
    m.crossOrigin = 'anonymous'
    a.crossOrigin = 'anonymous'
    a.loop = true
    musicRef.current = m
    ambientRef.current = a
    m.onended = (): void => {
      if (libraryRef.current.length) playIndex(idxRef.current + 1)
    }
    connectElement(m)
    connectElement(a)
    return () => {
      m.pause()
      a.pause()
      setPlaying(false)
    }
  }, [playIndex])

  // react to timer state
  useEffect(() => {
    const m = musicRef.current
    const a = ambientRef.current
    if (!m || !a || !state) return
    const s = state.settings
    const running = state.status === 'running'
    const isBreak = state.phase === 'short' || state.phase === 'long'
    const master = s.muted ? 0 : s.volume
    const musicEnabled = (isBreak ? s.breakMusic : s.focusMusic) !== 'none'
    const lib = libraryRef.current

    // ---- music ----
    if (musicEnabled && running) {
      setElementVolume(m, s.musicVolume * master)
      if (lib.length) {
        // playlist mode — keep playing the current song, advancing on end
        m.loop = false
        const cur = trackUrl(lib[idxRef.current])
        if (m.dataset.url !== cur) {
          m.src = cur
          m.dataset.url = cur
        }
        resume()
        if (m.paused) void m.play().catch(() => {})
      } else {
        // single bundled/slot loop
        m.loop = true
        const slot = isBreak ? s.breakMusic : s.focusMusic
        const url = BUNDLED[slot]
        if (m.dataset.url !== url) {
          m.src = url
          m.dataset.url = url
        }
        resume()
        if (m.paused) void m.play().catch(() => {})
      }
    } else if (!m.paused) {
      m.pause()
    }

    // ---- ambient (continuous loop while running) ----
    const aUrl = s.ambient === 'none' ? null : ambientUrl(s.ambient, slots)
    if (aUrl && running) {
      if (a.dataset.url !== aUrl) {
        a.src = aUrl
        a.dataset.url = aUrl
      }
      setElementVolume(a, s.ambientVolume * master)
      resume()
      if (a.paused) void a.play().catch(() => {})
    } else if (!a.paused) {
      a.pause()
    }

    setPlaying(running && (musicEnabled || !!aUrl))
  }, [state, slots])
}
