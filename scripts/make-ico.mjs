// Build resources/icon.ico (for the Windows app) from resources/icon.png.
// ICO can embed PNG-compressed entries (Windows Vista+), so we just pack
// several square PNG sizes generated with `sips`.
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'resources/icon.png')
const sizes = [16, 24, 32, 48, 64, 128, 256]
const tmp = mkdtempSync(join(tmpdir(), 'ico-'))

const pngs = sizes.map((s) => {
  const out = join(tmp, `${s}.png`)
  execSync(`sips -z ${s} ${s} "${src}" --out "${out}"`, { stdio: 'ignore' })
  return { size: s, data: readFileSync(out) }
})

const count = pngs.length
const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0) // reserved
header.writeUInt16LE(1, 2) // type: icon
header.writeUInt16LE(count, 4)

const dir = Buffer.alloc(16 * count)
let offset = 6 + 16 * count
const bodies = []
pngs.forEach((p, i) => {
  const b = i * 16
  dir.writeUInt8(p.size >= 256 ? 0 : p.size, b + 0) // width
  dir.writeUInt8(p.size >= 256 ? 0 : p.size, b + 1) // height
  dir.writeUInt8(0, b + 2) // palette
  dir.writeUInt8(0, b + 3) // reserved
  dir.writeUInt16LE(1, b + 4) // color planes
  dir.writeUInt16LE(32, b + 6) // bits per pixel
  dir.writeUInt32LE(p.data.length, b + 8)
  dir.writeUInt32LE(offset, b + 12)
  offset += p.data.length
  bodies.push(p.data)
})

writeFileSync(join(root, 'resources/icon.ico'), Buffer.concat([header, dir, ...bodies]))
console.log('wrote resources/icon.ico', count, 'sizes')
