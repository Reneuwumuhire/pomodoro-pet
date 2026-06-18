import { useEffect, useRef } from 'react'
import { PetKind } from '@shared/types'
import { GRID, spriteFor } from '@/pets/petData'

interface Props {
  kind: PetKind
  /** 0 egg, 1 baby, 2 grown */
  stage: number
  /** true while the timer is running (pet is awake/active) */
  awake: boolean
  /** target square display size in CSS px */
  box?: number
  /** ink color (defaults to LCD ink) */
  ink?: string
}

const INK = '#2f3a24'

export default function Pet({ kind, stage, awake, box = 96, ink = INK }: Props): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const raf = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingEnabled = false

    const dpr = window.devicePixelRatio || 1
    canvas.width = box * dpr
    canvas.height = box * dpr
    canvas.style.width = `${box}px`
    canvas.style.height = `${box}px`
    ctx.scale(dpr, dpr)

    // crisp integer scale; baby is one step smaller than grown
    const base = Math.max(1, Math.floor(box / GRID))
    const scale = stage >= 2 ? base : Math.max(1, base - 1)
    const offset = (box - GRID * scale) / 2

    const start = performance.now()

    const frame = (now: number): void => {
      const t = (now - start) / 1000
      const bob = Math.round(Math.sin(t * (awake ? 3 : 1.2)) * (awake ? 1 : 0.6))
      const blink = awake && Math.floor(t * 1000) % 3500 < 140
      const sleep = !awake

      const grid = spriteFor(kind, { stage, sleep, blink })

      ctx.clearRect(0, 0, box, box)
      ctx.fillStyle = ink
      for (let y = 0; y < GRID; y++)
        for (let x = 0; x < GRID; x++)
          if (grid[y][x]) ctx.fillRect(offset + x * scale, offset + (y + bob) * scale, scale, scale)

      if (sleep) {
        const zx = box * 0.7
        const zy = box * 0.22
        const wob = Math.sin(t * 2) * 2
        drawZ(ctx, zx + wob, zy, scale * 1.1)
        drawZ(ctx, zx + 6 + wob, zy - scale * 2, scale * 0.8)
      }
      raf.current = requestAnimationFrame(frame)
    }
    raf.current = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf.current)
  }, [kind, stage, awake, box, ink])

  return <canvas ref={canvasRef} className="pet-canvas" />
}

function drawZ(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.fillRect(x, y, s * 3, s)
  ctx.fillRect(x, y + s * 2, s * 3, s)
  for (let i = 0; i < 2; i++) ctx.fillRect(x + s * (2 - i), y + s * (1 + i * 0.5), s, s)
}
