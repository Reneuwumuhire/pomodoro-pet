// drawPet + PET_KINDS come from assets/pet.js (loaded first, shared global scope)

// --- theme data (must mirror styles.css device skins) ----------------------
const THEMES = [
  { id: 'lcd', ink: '#2f3a24', swatch: ['#d9d9d9', '#9aa97f', '#e8463a'] },
  { id: 'midnight', ink: '#aeb6c2', swatch: ['#1a1c22', '#0e1116', '#ff4d4d'] },
  { id: 'neon', ink: '#ff7ae0', swatch: ['#0a0a12', '#120a1f', '#22f5ff'] },
  { id: 'sunset', ink: '#7a3f23', swatch: ['#ff8a5b', '#ffe8d2', '#d6336c'] },
  { id: 'aurora', ink: '#cdfaff', swatch: ['#1b1040', '#0c1430', '#22d3ee'] },
  { id: 'mono', ink: '#2b2b2b', swatch: ['#ececec', '#e4e1d8', '#ff5a1f'] }
]
let theme = THEMES[0]

// --- live hero device ------------------------------------------------------
const petCanvas = document.getElementById('d-pet')
const timeEl = document.getElementById('d-time')
const phaseEl = document.getElementById('d-phase')
const dotsEl = document.getElementById('d-dots')
const toggleBtn = document.getElementById('d-toggle')
const resetBtn = document.getElementById('d-reset')
const grille = document.getElementById('d-grille')

const GOAL = 4
let total = 25 * 60
let remaining = total
let running = false
let completed = 1
let last = performance.now()

function fmt(s) {
  const m = Math.floor(s / 60)
  const ss = Math.floor(s % 60)
  return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}
function renderDots() {
  dotsEl.innerHTML = ''
  for (let i = 0; i < GOAL; i++) {
    const d = document.createElement('i')
    if (i < completed) d.className = 'on'
    dotsEl.appendChild(d)
  }
}
function setToggle() {
  toggleBtn.querySelector('.d-label').textContent = running ? 'PAUSE' : 'START'
  toggleBtn.querySelector('.d-ico').textContent = running ? '❚❚' : '▶'
}
toggleBtn.addEventListener('click', () => { running = !running; last = performance.now(); setToggle() })
resetBtn.addEventListener('click', () => { remaining = total; running = false; setToggle(); timeEl.textContent = fmt(remaining) })

// grille "equalizer"
const gctx = grille.getContext('2d')
function sizeGrille() {
  const r = grille.getBoundingClientRect()
  grille.width = r.width * 2
  grille.height = r.height * 2
}
window.addEventListener('resize', sizeGrille)

let blink = false
let lastBlink = 0
function loop(now) {
  const dt = (now - last) / 1000
  last = now
  if (running) {
    remaining = Math.max(0, remaining - dt)
    if (remaining <= 0) { completed = (completed % GOAL) + 1; remaining = total; renderDots() }
  }
  timeEl.textContent = fmt(remaining)

  // pet: awake when running, gentle bob, occasional blink
  if (now - lastBlink > 3200) { blink = true; lastBlink = now }
  if (now - lastBlink > 3340) blink = false
  const t = now / 1000
  const bob = Math.round(Math.sin(t * (running ? 3 : 1.2)) * (running ? 1 : 0.6))
  drawPet(petCanvas, 'cat', theme.ink, { sleep: !running, blink: running && blink, bob })

  // grille bars
  if (grille.width) {
    const w = grille.width, h = grille.height
    gctx.clearRect(0, 0, w, h)
    const cols = 30, rows = 4
    const gx = w / cols, gy = h / rows, r = Math.min(gx, gy) * 0.28
    for (let c = 0; c < cols; c++) {
      const lvl = running ? (0.2 + 0.8 * Math.abs(Math.sin(t * 4 + c * 0.5)) * Math.random() ** 0.4) : 0.12 + 0.1 * (0.5 + 0.5 * Math.sin(t * 1.5 + c * 0.6))
      const lit = lvl * rows
      for (let row = 0; row < rows; row++) {
        const on = rows - 1 - row < lit
        gctx.beginPath()
        gctx.arc(gx * (c + 0.5), gy * (row + 0.5), r, 0, Math.PI * 2)
        gctx.fillStyle = on ? 'rgba(40,40,40,.8)' : 'rgba(0,0,0,.16)'
        gctx.fill()
      }
    }
  }
  requestAnimationFrame(loop)
}

// --- skin switcher ---------------------------------------------------------
const switchEl = document.getElementById('skin-switch')
THEMES.forEach((th) => {
  const b = document.createElement('button')
  b.className = 'skin-dot' + (th.id === theme.id ? ' on' : '')
  b.style.background = `linear-gradient(135deg, ${th.swatch[0]} 0 45%, ${th.swatch[1]} 45% 78%, ${th.swatch[2]} 78%)`
  b.title = th.id
  b.addEventListener('click', () => {
    theme = th
    document.body.dataset.theme = th.id
    document.querySelectorAll('.skin-dot').forEach((d, i) => d.classList.toggle('on', THEMES[i].id === th.id))
  })
  switchEl.appendChild(b)
})

// --- grow section pets -----------------------------------------------------
const growPets = document.getElementById('grow-pets')
PET_KINDS.forEach((kind) => {
  const c = document.createElement('canvas')
  c.width = 96; c.height = 96
  drawPet(c, kind, '#2c3622', { sleep: false, blink: false, bob: 0 })
  c.title = kind
  c.addEventListener('mouseenter', () => evoKind(kind))
  growPets.appendChild(c)
})
const evoCanvases = [...document.querySelectorAll('.evo-cell canvas')]
function evoKind(kind) {
  evoCanvases.forEach((c) => drawPet(c, kind, '#2c3622', { sleep: false, blink: false, bob: 0 }))
}
evoKind('cat')

// --- scroll reveals --------------------------------------------------------
const io = new IntersectionObserver(
  (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add('in')),
  { threshold: 0.12 }
)
document.querySelectorAll('section > .band-head, .hero-copy, .hero-device, .feat, .skin-grid figure, .num, .evo, .dl-inner').forEach((el) => {
  el.classList.add('reveal')
  io.observe(el)
})

// --- OS-aware downloads ----------------------------------------------------
// Point at the GitHub Releases page (swap `file` for a direct asset URL once a
// release is published, or drop the built files next to this page).
const RELEASES = 'https://github.com/Reneuwumuhire/petomato/releases'
const DOWNLOADS = {
  mac: {
    os: 'macOS',
    file: RELEASES,
    short: 'Apple Silicon & Intel',
    note: 'macOS 13+ (Apple Silicon & Intel) · unsigned build — right-click the app → Open the first time.'
  },
  win: {
    os: 'Windows',
    file: RELEASES,
    short: 'Windows 10/11',
    note: 'Windows 10/11 · unsigned installer — if SmartScreen warns, choose “More info → Run anyway”.'
  }
}

function detectOS() {
  const d = navigator.userAgentData
  const plat = (d && d.platform) || navigator.platform || ''
  const ua = navigator.userAgent || ''
  if (/win/i.test(plat) || /Windows/i.test(ua)) return 'win'
  if (/mac/i.test(plat) || /Mac OS X|Macintosh/i.test(ua)) return 'mac'
  return 'other'
}

function applyDownloads() {
  const os = detectOS()
  const primaryKey = os === 'win' ? 'win' : 'mac' // default unknown/Linux to mac
  const otherKey = primaryKey === 'mac' ? 'win' : 'mac'
  const main = DOWNLOADS[primaryKey]
  const other = DOWNLOADS[otherKey]

  const set = (id, fn) => { const el = document.getElementById(id); if (el) fn(el) }

  // hero
  set('dl-primary', (el) => { el.textContent = `Download for ${main.os}`; el.href = main.file })
  set('dl-note-top', (el) => { el.textContent = `Free · ${main.short} · also on ${other.os}` })
  set('dl-alt', (el) => { el.textContent = `Or download for ${other.os}`; el.href = other.file })

  // bottom: a button per platform, the detected one first/emphasized
  set('dl-btn', (el) => { el.textContent = `Download for ${main.os}`; el.href = main.file })
  set('dl-note', (el) => { el.textContent = main.note })
  set('dl-row', (el) => {
    el.innerHTML = ''
    for (const key of [primaryKey, otherKey]) {
      const d = DOWNLOADS[key]
      const a = document.createElement('a')
      a.href = d.file
      a.className = 'dl-pill' + (key === primaryKey ? ' on' : '')
      a.textContent = d.os
      el.appendChild(a)
    }
  })
}
applyDownloads() // initial: links fall back to the Releases page

// Fetch the latest release: rewire the buttons to direct asset downloads (so a
// click downloads the file instead of opening GitHub) and show the count.
fetch('https://api.github.com/repos/Reneuwumuhire/petomato/releases', { cache: 'no-store' })
  .then((r) => (r.ok ? r.json() : []))
  .then((rels) => {
    rels = rels || []
    const rel = rels.find((r) => !r.draft && (r.assets || []).length) || rels[0]
    if (rel) {
      const url = (re) => {
        const a = (rel.assets || []).find((x) => re.test(x.name))
        return a && a.browser_download_url
      }
      const mac = url(/\.dmg$/i)
      const win = url(/\.exe$/i)
      if (mac) DOWNLOADS.mac.file = mac
      if (win) DOWNLOADS.win.file = win
      if (mac || win) applyDownloads()
    }
    const total = rels.reduce(
      (sum, r) => sum + (r.assets || []).reduce((s, a) => s + (a.download_count || 0), 0),
      0
    )
    // prominent live counter in the stats strip (always shown)
    const stat = document.getElementById('stat-downloads')
    if (stat) stat.textContent = total.toLocaleString()
    // contextual note by the download button (only once there are any)
    const el = document.getElementById('dl-count')
    if (el && total > 0) {
      el.textContent = `⬇ ${total.toLocaleString()} download${total === 1 ? '' : 's'} so far`
      el.hidden = false
    }
  })
  .catch(() => {
    const stat = document.getElementById('stat-downloads')
    if (stat) stat.textContent = '0'
  })

// --- boot ------------------------------------------------------------------
renderDots()
setToggle()
sizeGrille()
requestAnimationFrame(loop)
