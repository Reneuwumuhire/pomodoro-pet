import { PetKind } from '@shared/types'

/** Logical sprite resolution. Rendered to a canvas with nearest-neighbor scaling. */
export const GRID = 32

export type Grid = number[][] // [y][x]; 1 = ink (dark), 0 = screen

export interface SpriteOptions {
  /** 0/1 = baby (small), 2 = grown. Growth only changes size, never identity. */
  stage: number
  /** Content closed eyes while idle. */
  sleep: boolean
  /** Blink frame. */
  blink: boolean
}

export const PETS: { kind: PetKind; label: string }[] = [
  { kind: 'cat', label: 'CAT' },
  { kind: 'dog', label: 'DOG' },
  { kind: 'panda', label: 'PANDA' },
  { kind: 'bunny', label: 'BUNNY' },
  { kind: 'wolf', label: 'WOLF' },
  { kind: 'bear', label: 'BEAR' }
]

const newGrid = (): Grid => Array.from({ length: GRID }, () => new Array<number>(GRID).fill(0))
function set(g: Grid, x: number, y: number, v = 1): void {
  x = Math.round(x)
  y = Math.round(y)
  if (x < 0 || y < 0 || x >= GRID || y >= GRID) return
  g[y][x] = v
}
function fillEllipse(g: Grid, cx: number, cy: number, rx: number, ry: number, v = 1): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x - cx) / rx
      const dy = (y - cy) / ry
      if (dx * dx + dy * dy <= 1) set(g, x, y, v)
    }
}
function strokeEllipse(g: Grid, cx: number, cy: number, rx: number, ry: number, t = 2): void {
  const irx = rx - t
  const iry = ry - t
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const o = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
      const i = irx > 0 && iry > 0 ? ((x - cx) / irx) ** 2 + ((y - cy) / iry) ** 2 : 2
      if (o <= 1 && i >= 1) set(g, x, y, 1)
    }
}
function fillTri(
  g: Grid, ax: number, ay: number, bx: number, by: number, cx: number, cy: number, v = 1
): void {
  const minX = Math.floor(Math.min(ax, bx, cx))
  const maxX = Math.ceil(Math.max(ax, bx, cx))
  const minY = Math.floor(Math.min(ay, by, cy))
  const maxY = Math.ceil(Math.max(ay, by, cy))
  const ar = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): number =>
    (x1 - x3) * (y2 - y3) - (x2 - x3) * (y1 - y3)
  for (let y = minY; y <= maxY; y++)
    for (let x = minX; x <= maxX; x++) {
      const d1 = ar(x, y, ax, ay, bx, by)
      const d2 = ar(x, y, bx, by, cx, cy)
      const d3 = ar(x, y, cx, cy, ax, ay)
      if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) set(g, x, y, v)
    }
}
function line(g: Grid, x0: number, y0: number, x1: number, y1: number): void {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0))
  for (let i = 0; i <= n; i++) set(g, x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, 1)
}

/** A dark eye on the light face (open dot / closed line). */
function eye(g: Grid, x: number, y: number, o: SpriteOptions): void {
  if (o.sleep || o.blink) {
    for (let i = -1; i <= 1; i++) set(g, x + i, y, 1)
  } else {
    fillEllipse(g, x, y, 1.1, 1.3, 1)
  }
}

export function spriteFor(kind: PetKind, o: SpriteOptions): Grid {
  const g = newGrid()
  const cx = 16
  const headCy = 12
  const headR = 7.5
  const bodyCy = 24
  const bodyRx = 8.5
  const bodyRy = 6.5

  // shared sitting body (light interior, dark outline) + paws
  strokeEllipse(g, cx, bodyCy, bodyRx, bodyRy, 2)
  fillEllipse(g, cx - 4.5, bodyCy + bodyRy - 1.5, 2.4, 1.8, 1)
  fillEllipse(g, cx + 4.5, bodyCy + bodyRy - 1.5, 2.4, 1.8, 1)
  strokeEllipse(g, cx, headCy, headR, headR, 2)

  const eyeY = headCy + 0.5
  const eyeDx = 3

  switch (kind) {
    case 'cat':
      fillTri(g, cx - 7, headCy - 4, cx - 3, headCy - 11, cx - 1, headCy - 4)
      fillTri(g, cx + 7, headCy - 4, cx + 3, headCy - 11, cx + 1, headCy - 4)
      eye(g, cx - eyeDx, eyeY, o)
      eye(g, cx + eyeDx, eyeY, o)
      fillTri(g, cx - 1.4, eyeY + 3, cx + 1.4, eyeY + 3, cx, eyeY + 4.5, 1)
      line(g, cx, eyeY + 4.5, cx, eyeY + 5.5)
      line(g, cx - 3, eyeY + 3, cx - 9, eyeY + 2)
      line(g, cx - 3, eyeY + 4, cx - 9, eyeY + 5)
      line(g, cx + 3, eyeY + 3, cx + 9, eyeY + 2)
      line(g, cx + 3, eyeY + 4, cx + 9, eyeY + 5)
      fillEllipse(g, cx + bodyRx + 1, bodyCy + 1, 1.8, 3.6, 1)
      break
    case 'dog':
      fillEllipse(g, cx - 7, headCy + 2.5, 2.4, 4.2, 1)
      fillEllipse(g, cx + 7, headCy + 2.5, 2.4, 4.2, 1)
      eye(g, cx - eyeDx, eyeY - 1, o)
      eye(g, cx + eyeDx, eyeY - 1, o)
      fillEllipse(g, cx, eyeY + 2.5, 1.4, 1.2, 1)
      line(g, cx, eyeY + 3.6, cx, eyeY + 4.6)
      line(g, cx, eyeY + 4.6, cx - 2, eyeY + 4.2)
      line(g, cx, eyeY + 4.6, cx + 2, eyeY + 4.2)
      fillEllipse(g, cx + bodyRx + 1, bodyCy - 2, 1.8, 3, 1)
      break
    case 'panda':
      fillEllipse(g, cx - 6, headCy - 6, 3, 3, 1)
      fillEllipse(g, cx + 6, headCy - 6, 3, 3, 1)
      fillEllipse(g, cx - eyeDx, eyeY, 2.6, 3.1, 1)
      fillEllipse(g, cx + eyeDx, eyeY, 2.6, 3.1, 1)
      // light pupils (open) or light closed line (sleep)
      if (o.sleep || o.blink) {
        for (let i = -1; i <= 1; i++) {
          set(g, cx - eyeDx + i, eyeY, 0)
          set(g, cx + eyeDx + i, eyeY, 0)
        }
      } else {
        set(g, cx - eyeDx, eyeY, 0)
        set(g, cx - eyeDx, eyeY - 1, 0)
        set(g, cx + eyeDx, eyeY, 0)
        set(g, cx + eyeDx, eyeY - 1, 0)
      }
      fillEllipse(g, cx, eyeY + 4, 1.2, 1, 1)
      line(g, cx, eyeY + 5, cx, eyeY + 6)
      fillEllipse(g, cx - bodyRx, bodyCy - 1, 2.2, 3.2, 1)
      fillEllipse(g, cx + bodyRx, bodyCy - 1, 2.2, 3.2, 1)
      break
    case 'bunny':
      strokeEllipse(g, cx - 3, headCy - 8, 1.9, 5.5, 1.4)
      strokeEllipse(g, cx + 3, headCy - 8, 1.9, 5.5, 1.4)
      eye(g, cx - eyeDx, eyeY, o)
      eye(g, cx + eyeDx, eyeY, o)
      fillEllipse(g, cx, eyeY + 3, 1.1, 0.9, 1)
      line(g, cx, eyeY + 3.8, cx, eyeY + 5)
      set(g, cx - 1, eyeY + 5.5, 1)
      set(g, cx + 1, eyeY + 5.5, 1)
      line(g, cx - 2, eyeY + 3.5, cx - 7, eyeY + 3)
      line(g, cx + 2, eyeY + 3.5, cx + 7, eyeY + 3)
      fillEllipse(g, cx + bodyRx + 1, bodyCy + 2, 2.2, 2.2, 1)
      break
    case 'wolf':
      fillTri(g, cx - 7, headCy - 5, cx - 4.5, headCy - 12, cx - 1.5, headCy - 5)
      fillTri(g, cx + 7, headCy - 5, cx + 4.5, headCy - 12, cx + 1.5, headCy - 5)
      eye(g, cx - eyeDx, eyeY - 0.5, o)
      eye(g, cx + eyeDx, eyeY - 0.5, o)
      strokeEllipse(g, cx, headCy + 5, 2.6, 3.2, 1.4)
      fillEllipse(g, cx, headCy + 3.2, 1.2, 1, 1)
      line(g, cx, headCy + 4.2, cx, headCy + 7)
      fillEllipse(g, cx + bodyRx + 1.5, bodyCy, 3, 4.2, 1)
      break
    case 'bear':
      fillEllipse(g, cx - 5.5, headCy - 6, 2.6, 2.6, 1)
      fillEllipse(g, cx + 5.5, headCy - 6, 2.6, 2.6, 1)
      eye(g, cx - eyeDx, eyeY - 0.5, o)
      eye(g, cx + eyeDx, eyeY - 0.5, o)
      strokeEllipse(g, cx, headCy + 4, 3.4, 2.8, 1.5)
      fillEllipse(g, cx, headCy + 2.8, 1.5, 1.2, 1)
      line(g, cx, headCy + 4, cx, headCy + 6)
      break
  }

  return g
}
