import { useEffect, useRef } from 'react'
import { getLevels } from '@/audio/audioBus'
import { nextTrack, nowPlaying } from '@/audio/musicControls'
import { IconVolume, IconMuted, IconSkip, IconMusic } from '@/icons'

interface Props {
  muted: boolean
  onToggleMute: () => void
}

const COLS = 30
const ROWS = 4

/** Bottom chrome: mute, an equalizer grille, and music transport (fast-forward
 *  + next song) with the current track name. */
export default function SpeakerBar({ muted, onToggleMute }: Props): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const nameRef = useRef<HTMLDivElement>(null)
  const raf = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const dpr = window.devicePixelRatio || 1

    const resize = (): void => {
      canvas.width = canvas.clientWidth * dpr
      canvas.height = canvas.clientHeight * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    const start = performance.now()
    let lastName = ''
    const draw = (now: number): void => {
      const t = (now - start) / 1000
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      ctx.clearRect(0, 0, w, h)
      const levels = muted ? new Array(COLS).fill(0.06) : getLevels(COLS, t)
      const gapX = w / COLS
      const gapY = h / ROWS
      const r = Math.min(gapX, gapY) * 0.28
      for (let c = 0; c < COLS; c++) {
        const lit = levels[c] * ROWS
        for (let row = 0; row < ROWS; row++) {
          const on = ROWS - 1 - row < lit
          ctx.beginPath()
          ctx.arc(gapX * (c + 0.5), gapY * (row + 0.5), r, 0, Math.PI * 2)
          ctx.fillStyle = on ? 'rgba(40,40,40,0.85)' : 'rgba(0,0,0,0.16)'
          ctx.fill()
        }
      }
      // keep the track label in sync
      const np = nowPlaying()
      if (nameRef.current && np.name !== lastName) {
        lastName = np.name
        nameRef.current.textContent = np.name
        const row = nameRef.current.parentElement
        if (row) row.style.visibility = np.name ? 'visible' : 'hidden'
      }
      raf.current = requestAnimationFrame(draw)
    }
    raf.current = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf.current)
      ro.disconnect()
    }
  }, [muted])

  return (
    <>
      <div className="speaker-bar">
        <button className="chip" onClick={onToggleMute} title={muted ? 'Unmute' : 'Mute'}>
          {muted ? <IconMuted size={15} /> : <IconVolume size={15} />}
        </button>
        <div className="grille">
          <canvas ref={canvasRef} className="grille-canvas" />
        </div>
        <button className="chip" onClick={() => nextTrack()} title="Next song">
          <IconSkip size={15} />
        </button>
      </div>
      <div className="now-playing">
        <IconMusic size={11} className="np-icon" />
        <span ref={nameRef} />
      </div>
    </>
  )
}
