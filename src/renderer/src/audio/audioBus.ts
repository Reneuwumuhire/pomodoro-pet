// A tiny WebAudio bus: routes the music + ambient <audio> elements through a
// shared AnalyserNode so the speaker grille can visualize what's playing.

let ctx: AudioContext | null = null
let analyser: AnalyserNode | null = null
let freq = new Uint8Array(new ArrayBuffer(0))
let anyPlaying = false
const connected = new WeakSet<HTMLMediaElement>()
// Per-element gain — volume MUST be controlled here, not via `el.volume`: once an
// element is routed through a MediaElementSourceNode, WebKit (Tauri's WebView)
// ignores the element's own volume/muted (Chromium honoured it, so Electron worked).
const gains = new WeakMap<HTMLMediaElement, GainNode>()

function ensure(): AnalyserNode {
  if (!ctx) {
    ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    analyser = ctx.createAnalyser()
    analyser.fftSize = 64
    analyser.smoothingTimeConstant = 0.8
    analyser.connect(ctx.destination)
    freq = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount))
  }
  return analyser!
}

/** Route an <audio> element through a gain node → analyser (once per element). */
export function connectElement(el: HTMLAudioElement): void {
  if (connected.has(el)) return
  const node = ensure()
  try {
    const src = ctx!.createMediaElementSource(el)
    const gain = ctx!.createGain()
    src.connect(gain)
    gain.connect(node)
    gains.set(el, gain)
    connected.add(el)
  } catch {
    // already connected elsewhere — ignore
  }
}

/** Set an element's output level (0..1) via its gain node — the only reliable
 *  volume/mute control once routed through WebAudio (works in WebKit + Chromium). */
export function setElementVolume(el: HTMLAudioElement, v: number): void {
  const g = gains.get(el)
  if (g) g.gain.value = Math.max(0, Math.min(1, v))
}

export function resume(): void {
  ctx?.resume().catch(() => {})
}

export function setPlaying(p: boolean): void {
  anyPlaying = p
}

/**
 * Returns `bars` levels in 0..1. When nothing is playing, returns a gentle
 * idle shimmer so the grille still feels alive.
 */
export function getLevels(bars: number, tSeconds: number): number[] {
  if (analyser && anyPlaying) {
    analyser.getByteFrequencyData(freq)
    const out: number[] = []
    const step = Math.max(1, Math.floor(freq.length / bars))
    for (let i = 0; i < bars; i++) {
      let sum = 0
      for (let j = 0; j < step; j++) sum += freq[i * step + j] ?? 0
      out.push(Math.min(1, sum / step / 200))
    }
    return out
  }
  // idle: slow sine shimmer
  return Array.from({ length: bars }, (_, i) =>
    0.12 + 0.1 * (0.5 + 0.5 * Math.sin(tSeconds * 1.5 + i * 0.6))
  )
}
