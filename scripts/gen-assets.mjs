// Generates app/tray icons without any image dependencies by hand-encoding PNGs.
// Run with: node scripts/gen-assets.mjs
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// ---- minimal PNG encoder (RGBA, 8-bit) -------------------------------------
function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1
  }
  return ~c >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const body = Buffer.concat([typeBuf, data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  // rows with filter byte 0
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride)
  }
  const idat = deflateSync(raw, { level: 9 })
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0))
  ])
}

// ---- drawing helpers -------------------------------------------------------
function makeCanvas(w, h) {
  return { w, h, data: Buffer.alloc(w * h * 4) }
}
function setPx(c, x, y, [r, g, b, a]) {
  if (x < 0 || y < 0 || x >= c.w || y >= c.h) return
  const i = (y * c.w + x) * 4
  // simple alpha over
  const ia = a / 255
  const oa = c.data[i + 3] / 255
  const na = ia + oa * (1 - ia)
  if (na === 0) return
  c.data[i] = (r * ia + c.data[i] * oa * (1 - ia)) / na
  c.data[i + 1] = (g * ia + c.data[i + 1] * oa * (1 - ia)) / na
  c.data[i + 2] = (b * ia + c.data[i + 2] * oa * (1 - ia)) / na
  c.data[i + 3] = na * 255
}
function fillRoundRect(c, x0, y0, w, h, radius, color) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // rounded corner test
      let inside = true
      const corners = [
        [radius, radius],
        [w - radius, radius],
        [radius, h - radius],
        [w - radius, h - radius]
      ]
      if (x < radius && y < radius) inside = dist(x, y, corners[0]) <= radius
      else if (x >= w - radius && y < radius) inside = dist(x, y, corners[1]) <= radius
      else if (x < radius && y >= h - radius) inside = dist(x, y, corners[2]) <= radius
      else if (x >= w - radius && y >= h - radius) inside = dist(x, y, corners[3]) <= radius
      if (inside) setPx(c, x0 + x, y0 + y, color)
    }
  }
}
function dist(x, y, [cx, cy]) {
  return Math.hypot(x - cx, y - cy)
}

// ---- app icon (1024) -------------------------------------------------------
function buildAppIcon(size) {
  const c = makeCanvas(size, size)
  const s = size / 1024
  // red-orange rounded body with vertical gradient
  const r = Math.round(220 * s)
  for (let y = 0; y < size; y++) {
    const t = y / size
    const col = [
      Math.round(0xf0 - 40 * t),
      Math.round(0x55 - 30 * t),
      Math.round(0x3a - 10 * t),
      255
    ]
    for (let x = 0; x < size; x++) {
      // rounded mask
      const inset = 0
      const rr = r
      let inside = true
      if (x < rr && y < rr) inside = dist(x, y, [rr, rr]) <= rr
      else if (x >= size - rr && y < rr) inside = dist(x, y, [size - rr, rr]) <= rr
      else if (x < rr && y >= size - rr) inside = dist(x, y, [rr, size - rr]) <= rr
      else if (x >= size - rr && y >= size - rr) inside = dist(x, y, [size - rr, size - rr]) <= rr
      if (inside) setPx(c, x, y, col)
      void inset
    }
  }
  // green LCD screen
  const sx = Math.round(180 * s)
  const sy = Math.round(300 * s)
  const sw = size - sx * 2
  const sh = Math.round(420 * s)
  fillRoundRect(c, sx, sy, sw, sh, Math.round(60 * s), [0x2b, 0x2b, 0x2b, 255])
  const pad = Math.round(26 * s)
  fillRoundRect(
    c,
    sx + pad,
    sy + pad,
    sw - pad * 2,
    sh - pad * 2,
    Math.round(36 * s),
    [0x9a, 0xa9, 0x7f, 255]
  )
  // two pixel "eyes" of a pet on the screen
  const eye = [0x36, 0x40, 0x2a, 255]
  const ew = Math.round(70 * s)
  const ey = sy + Math.round(150 * s)
  fillRoundRect(c, sx + Math.round(150 * s), ey, ew, ew, Math.round(10 * s), eye)
  fillRoundRect(c, sx + sw - Math.round(150 * s) - ew, ey, ew, ew, Math.round(10 * s), eye)
  // smile
  for (let x = 0; x < sw - Math.round(260 * s); x++) {
    const px = sx + Math.round(130 * s) + x
    const py = ey + Math.round(150 * s) + Math.round(Math.sin((x / (sw)) * Math.PI) * 30 * s)
    fillRoundRect(c, px, py, Math.round(14 * s), Math.round(14 * s), 2, eye)
  }
  return c
}

// ---- tray template (black + alpha), anti-aliased via SDF supersampling -----
function segDist(px, py, ax, ay, bx, by) {
  const vx = bx - ax
  const vy = by - ay
  const wx = px - ax
  const wy = py - ay
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / (vx * vx + vy * vy)))
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy))
}
function buildTray(size) {
  const c = makeCanvas(size, size)
  const cx = size / 2
  const cy = size / 2
  const r = size / 2 - size * 0.07 // outer radius of the clock face
  const ringW = Math.max(1.4, size * 0.085) // stroke width of the ring
  const handW = Math.max(1.2, size * 0.075)
  // clean clock hands: minute pointing up, hour to upper-right (~10:10 look)
  const minLen = r * 0.62
  const hourLen = r * 0.46
  const minTip = [cx, cy - minLen]
  const hourTip = [cx + hourLen * 0.66, cy - hourLen * 0.55]
  const SS = 4 // supersampling factor
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let cov = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS
          const py = y + (sy + 0.5) / SS
          const dRing = Math.abs(Math.hypot(px - cx, py - cy) - (r - ringW / 2))
          const dMin = segDist(px, py, cx, cy, minTip[0], minTip[1])
          const dHour = segDist(px, py, cx, cy, hourTip[0], hourTip[1])
          const dHub = Math.hypot(px - cx, py - cy)
          const inside =
            dRing <= ringW / 2 ||
            dMin <= handW / 2 ||
            dHour <= handW / 2 ||
            dHub <= handW * 0.8
          if (inside) cov++
        }
      }
      if (cov > 0) {
        const a = Math.round((cov / (SS * SS)) * 255)
        const i = (y * size + x) * 4
        c.data[i] = 0
        c.data[i + 1] = 0
        c.data[i + 2] = 0
        c.data[i + 3] = a
      }
    }
  }
  return c
}

// ---- write -----------------------------------------------------------------
function save(c, file) {
  const out = resolve(root, file)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, encodePNG(c.w, c.h, c.data))
  console.log('wrote', file)
}

save(buildAppIcon(1024), 'resources/icon.png')
// menu-bar template icon: 18pt with a crisp @2x retina variant
save(buildTray(18), 'resources/trayTemplate.png')
save(buildTray(36), 'resources/trayTemplate@2x.png')
