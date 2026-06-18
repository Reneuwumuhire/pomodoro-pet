// A tiny WebAudio bus: routes the music + ambient <audio> elements through a
// shared AnalyserNode so the speaker grille can visualize what's playing.

let ctx: AudioContext | null = null
let analyser: AnalyserNode | null = null
let freq = new Uint8Array(new ArrayBuffer(0))
let anyPlaying = false
const connected = new WeakSet<HTMLMediaElement>()

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

/** Route an <audio> element through the analyser (once per element). */
export function connectElement(el: HTMLAudioElement): void {
  if (connected.has(el)) return
  const node = ensure()
  try {
    const src = ctx!.createMediaElementSource(el)
    src.connect(node)
    connected.add(el)
  } catch {
    // already connected elsewhere — ignore
  }
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
