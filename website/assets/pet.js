// Vanilla port of the app's pixel-pet renderer so the website hero pet is
// genuinely alive (same sprites as the real app).
const GRID = 32

const newGrid = () => Array.from({ length: GRID }, () => new Array(GRID).fill(0))
function set(g, x, y, v = 1) {
  x = Math.round(x); y = Math.round(y)
  if (x < 0 || y < 0 || x >= GRID || y >= GRID) return
  g[y][x] = v
}
function fillEllipse(g, cx, cy, rx, ry, v = 1) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry
      if (dx * dx + dy * dy <= 1) set(g, x, y, v)
    }
}
function strokeEllipse(g, cx, cy, rx, ry, t = 2) {
  const irx = rx - t, iry = ry - t
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const o = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
      const i = irx > 0 && iry > 0 ? ((x - cx) / irx) ** 2 + ((y - cy) / iry) ** 2 : 2
      if (o <= 1 && i >= 1) set(g, x, y, 1)
    }
}
function fillTri(g, ax, ay, bx, by, cx, cy) {
  const minX = Math.floor(Math.min(ax, bx, cx)), maxX = Math.ceil(Math.max(ax, bx, cx))
  const minY = Math.floor(Math.min(ay, by, cy)), maxY = Math.ceil(Math.max(ay, by, cy))
  const ar = (x1, y1, x2, y2, x3, y3) => (x1 - x3) * (y2 - y3) - (x2 - x3) * (y1 - y3)
  for (let y = minY; y <= maxY; y++)
    for (let x = minX; x <= maxX; x++) {
      const d1 = ar(x, y, ax, ay, bx, by), d2 = ar(x, y, bx, by, cx, cy), d3 = ar(x, y, cx, cy, ax, ay)
      if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) set(g, x, y, 1)
    }
}
function line(g, x0, y0, x1, y1) {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0))
  for (let i = 0; i <= n; i++) set(g, x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, 1)
}
function eye(g, x, y, o) {
  if (o.sleep || o.blink) { for (let i = -1; i <= 1; i++) set(g, x + i, y, 1) }
  else fillEllipse(g, x, y, 1.1, 1.3, 1)
}

const PET_KINDS = ['cat', 'dog', 'panda', 'bunny', 'wolf', 'bear']

function spriteFor(kind, o = { sleep: false, blink: false }) {
  const g = newGrid()
  const cx = 16, headCy = 12, headR = 7.5, bodyCy = 24, bodyRx = 8.5, bodyRy = 6.5
  strokeEllipse(g, cx, bodyCy, bodyRx, bodyRy, 2)
  fillEllipse(g, cx - 4.5, bodyCy + bodyRy - 1.5, 2.4, 1.8, 1)
  fillEllipse(g, cx + 4.5, bodyCy + bodyRy - 1.5, 2.4, 1.8, 1)
  strokeEllipse(g, cx, headCy, headR, headR, 2)
  const eyeY = headCy + 0.5, eyeDx = 3
  switch (kind) {
    case 'cat':
      fillTri(g, cx - 7, headCy - 4, cx - 3, headCy - 11, cx - 1, headCy - 4)
      fillTri(g, cx + 7, headCy - 4, cx + 3, headCy - 11, cx + 1, headCy - 4)
      eye(g, cx - eyeDx, eyeY, o); eye(g, cx + eyeDx, eyeY, o)
      fillTri(g, cx - 1.4, eyeY + 3, cx + 1.4, eyeY + 3, cx, eyeY + 4.5)
      line(g, cx, eyeY + 4.5, cx, eyeY + 5.5)
      line(g, cx - 3, eyeY + 3, cx - 9, eyeY + 2); line(g, cx - 3, eyeY + 4, cx - 9, eyeY + 5)
      line(g, cx + 3, eyeY + 3, cx + 9, eyeY + 2); line(g, cx + 3, eyeY + 4, cx + 9, eyeY + 5)
      fillEllipse(g, cx + bodyRx + 1, bodyCy + 1, 1.8, 3.6, 1); break
    case 'dog':
      fillEllipse(g, cx - 7, headCy + 2.5, 2.4, 4.2, 1); fillEllipse(g, cx + 7, headCy + 2.5, 2.4, 4.2, 1)
      eye(g, cx - eyeDx, eyeY - 1, o); eye(g, cx + eyeDx, eyeY - 1, o)
      fillEllipse(g, cx, eyeY + 2.5, 1.4, 1.2, 1)
      line(g, cx, eyeY + 3.6, cx, eyeY + 4.6); line(g, cx, eyeY + 4.6, cx - 2, eyeY + 4.2); line(g, cx, eyeY + 4.6, cx + 2, eyeY + 4.2)
      fillEllipse(g, cx + bodyRx + 1, bodyCy - 2, 1.8, 3, 1); break
    case 'panda':
      fillEllipse(g, cx - 6, headCy - 6, 3, 3, 1); fillEllipse(g, cx + 6, headCy - 6, 3, 3, 1)
      fillEllipse(g, cx - eyeDx, eyeY, 2.6, 3.1, 1); fillEllipse(g, cx + eyeDx, eyeY, 2.6, 3.1, 1)
      if (o.sleep || o.blink) { for (let i = -1; i <= 1; i++) { set(g, cx - eyeDx + i, eyeY, 0); set(g, cx + eyeDx + i, eyeY, 0) } }
      else { set(g, cx - eyeDx, eyeY, 0); set(g, cx - eyeDx, eyeY - 1, 0); set(g, cx + eyeDx, eyeY, 0); set(g, cx + eyeDx, eyeY - 1, 0) }
      fillEllipse(g, cx, eyeY + 4, 1.2, 1, 1); line(g, cx, eyeY + 5, cx, eyeY + 6)
      fillEllipse(g, cx - bodyRx, bodyCy - 1, 2.2, 3.2, 1); fillEllipse(g, cx + bodyRx, bodyCy - 1, 2.2, 3.2, 1); break
    case 'bunny':
      strokeEllipse(g, cx - 3, headCy - 8, 1.9, 5.5, 1.4); strokeEllipse(g, cx + 3, headCy - 8, 1.9, 5.5, 1.4)
      eye(g, cx - eyeDx, eyeY, o); eye(g, cx + eyeDx, eyeY, o)
      fillEllipse(g, cx, eyeY + 3, 1.1, 0.9, 1); line(g, cx, eyeY + 3.8, cx, eyeY + 5)
      set(g, cx - 1, eyeY + 5.5, 1); set(g, cx + 1, eyeY + 5.5, 1)
      line(g, cx - 2, eyeY + 3.5, cx - 7, eyeY + 3); line(g, cx + 2, eyeY + 3.5, cx + 7, eyeY + 3)
      fillEllipse(g, cx + bodyRx + 1, bodyCy + 2, 2.2, 2.2, 1); break
    case 'wolf':
      fillTri(g, cx - 7, headCy - 5, cx - 4.5, headCy - 12, cx - 1.5, headCy - 5)
      fillTri(g, cx + 7, headCy - 5, cx + 4.5, headCy - 12, cx + 1.5, headCy - 5)
      eye(g, cx - eyeDx, eyeY - 0.5, o); eye(g, cx + eyeDx, eyeY - 0.5, o)
      strokeEllipse(g, cx, headCy + 5, 2.6, 3.2, 1.4); fillEllipse(g, cx, headCy + 3.2, 1.2, 1, 1); line(g, cx, headCy + 4.2, cx, headCy + 7)
      fillEllipse(g, cx + bodyRx + 1.5, bodyCy, 3, 4.2, 1); break
    case 'bear':
      fillEllipse(g, cx - 5.5, headCy - 6, 2.6, 2.6, 1); fillEllipse(g, cx + 5.5, headCy - 6, 2.6, 2.6, 1)
      eye(g, cx - eyeDx, eyeY - 0.5, o); eye(g, cx + eyeDx, eyeY - 0.5, o)
      strokeEllipse(g, cx, headCy + 4, 3.4, 2.8, 1.5); fillEllipse(g, cx, headCy + 2.8, 1.5, 1.2, 1); line(g, cx, headCy + 4, cx, headCy + 6); break
  }
  return g
}

/** Draw a pet onto a canvas, scaled, centered, in the given ink color. */
function drawPet(canvas, kind, ink, opts) {
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = false
  const box = canvas.width
  const scale = Math.max(1, Math.floor(box / GRID))
  const offset = (box - GRID * scale) / 2
  const grid = spriteFor(kind, opts)
  ctx.clearRect(0, 0, box, box)
  ctx.fillStyle = ink
  const bob = opts.bob || 0
  for (let y = 0; y < GRID; y++)
    for (let x = 0; x < GRID; x++)
      if (grid[y][x]) ctx.fillRect(offset + x * scale, offset + (y + bob) * scale, scale, scale)
}

window.PomoPet = { GRID, PET_KINDS, spriteFor, drawPet }
