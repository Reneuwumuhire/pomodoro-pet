interface Props {
  ms: number
  className?: string
}

function format(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** The big mm:ss readout in the pixel font. */
export default function PixelDigits({ ms, className }: Props): JSX.Element {
  return <div className={`pixel-digits ${className ?? ''}`}>{format(ms)}</div>
}
