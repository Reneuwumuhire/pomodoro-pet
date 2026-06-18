import { useEffect, useRef } from 'react'
import chimeUrl from './assets/chime.mp3'

/** Plays the completion chime when the main process requests it. */
export function useChime(): void {
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    const audio = new Audio(chimeUrl)
    audioRef.current = audio
    const off = window.pomodoro.onChime((req) => {
      audio.volume = Math.max(0, Math.min(1, req.volume))
      audio.currentTime = 0
      void audio.play().catch(() => {})
    })
    return off
  }, [])
}
