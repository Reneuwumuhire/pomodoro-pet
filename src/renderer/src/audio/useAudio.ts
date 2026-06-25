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

/**
 * Drives music + ambient playback from the live timer state.
 *
 * Bundled loops + ambient play through WebView <audio> elements (same-origin assets,
 * routed via WebAudio so the speaker grille reacts). Custom *folder* songs can't play
 * in the WebView on macOS (WKWebView only loads media from its own origin), so they're
 * decoded + played natively by rodio in Rust — we just send play/pause/volume/skip
 * commands. The folder is treated as a playlist that auto-advances.
 */
export function useAudio(): void {
  const state = usePomodoro((s) => s.state)
  const musicRef = useRef<HTMLAudioElement | null>(null) // bundled music loop
  const ambientRef = useRef<HTMLAudioElement | null>(null) // ambient loop
  const [libCount, setLibCount] = useState(0) // # of songs in the folder (0 = bundled mode)
  // Native player (rodio) bookkeeping.
  const startedRef = useRef(false) // playlist loaded into the native player
  const playingRef = useRef(false) // native player currently playing
  const volRef = useRef(-1) // last volume sent to the native player
  const nowRef = useRef<{ name: string; hasLibrary: boolean }>({ name: '', hasLibrary: false })

  // Pull the current track name from the native player so the speaker bar can show it.
  const refreshNow = useCallback(async (): Promise<void> => {
    try {
      const n = await window.pomodoro.musicNow()
      nowRef.current = { name: n.count ? prettyTrack(n.name) : '', hasLibrary: n.count > 0 }
    } catch {
      /* not available (web build) */
    }
  }, [])

  // Speaker-bar controls (skip/forward operate the native playlist).
  useEffect(() => {
    setMusicHandlers({
      next: () => {
        if (libCount) {
          window.pomodoro.musicNext()
          void refreshNow()
        }
      },
      forward: () => {
        if (libCount) {
          window.pomodoro.musicNext()
          void refreshNow()
        }
      },
      now: () => nowRef.current
    })
  }, [libCount, refreshNow])

  // Reload the playlist when the folder changes; reset the native player.
  const musicFolder = state?.settings.musicFolder
  useEffect(() => {
    window.pomodoro.musicStop()
    startedRef.current = false
    playingRef.current = false
    volRef.current = -1
    window.pomodoro
      .getMusicLibrary()
      .then((lib) => setLibCount(lib.length))
      .catch(() => setLibCount(0))
    void refreshNow()
  }, [musicFolder, refreshNow])

  // Keep the speaker-bar label in sync as tracks auto-advance.
  useEffect(() => {
    const id = setInterval(() => {
      if (playingRef.current) void refreshNow()
    }, 1500)
    return () => clearInterval(id)
  }, [refreshNow])

  // Create the two WebView audio elements once (bundled music + ambient).
  useEffect(() => {
    const m = new Audio()
    const a = new Audio()
    a.loop = true
    musicRef.current = m
    ambientRef.current = a
    connectElement(m)
    connectElement(a)
    return () => {
      m.pause()
      a.pause()
      window.pomodoro.musicStop()
      setPlaying(false)
    }
  }, [])

  // React to timer state.
  useEffect(() => {
    const m = musicRef.current
    const a = ambientRef.current
    if (!m || !a || !state) return
    const s = state.settings
    const running = state.status === 'running'
    const isBreak = state.phase === 'short' || state.phase === 'long'
    const master = s.muted ? 0 : s.volume
    const musicEnabled = (isBreak ? s.breakMusic : s.focusMusic) !== 'none'
    const musicVol = s.musicVolume * master
    const hasFolder = libCount > 0

    if (hasFolder) {
      // ---- folder playlist via the native (rodio) player ----
      if (!m.paused) m.pause() // never double up with the bundled element
      if (musicEnabled && running) {
        if (!startedRef.current) {
          window.pomodoro.musicPlay(0, musicVol)
          startedRef.current = true
          playingRef.current = true
          volRef.current = musicVol
          void refreshNow()
        } else if (!playingRef.current) {
          window.pomodoro.musicResume(musicVol)
          playingRef.current = true
          volRef.current = musicVol
        }
        if (playingRef.current && volRef.current !== musicVol) {
          window.pomodoro.musicSetVolume(musicVol)
          volRef.current = musicVol
        }
      } else if (playingRef.current) {
        window.pomodoro.musicPause()
        playingRef.current = false
      }
    } else {
      // ---- bundled loop via the WebView element ----
      if (startedRef.current) {
        window.pomodoro.musicStop()
        startedRef.current = false
        playingRef.current = false
      }
      if (musicEnabled && running) {
        setElementVolume(m, musicVol)
        m.loop = true
        const slot = isBreak ? s.breakMusic : s.focusMusic
        const url = BUNDLED[slot]
        if (url && m.dataset.url !== url) {
          m.src = url
          m.dataset.url = url
        }
        resume()
        if (m.paused) void m.play().catch(() => {})
      } else if (!m.paused) {
        m.pause()
      }
    }

    // ---- ambient (continuous loop while running) ----
    const aUrl = s.ambient === 'none' ? null : BUNDLED[s.ambient]
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
  }, [state, libCount, refreshNow])
}
