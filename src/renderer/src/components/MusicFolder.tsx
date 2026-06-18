import { DragEvent, useEffect, useState } from 'react'
import { usePomodoro } from '@/state/usePomodoro'
import { IconFolder } from '@/icons'

interface Info {
  path: string
  isCustom: boolean
  count: number
}

/** Pick / drop / reset the folder the music playlist is read from. */
export default function MusicFolder(): JSX.Element {
  const pick = usePomodoro((s) => s.pickMusicFolder)
  const setFolder = usePomodoro((s) => s.setMusicFolder)
  const folder = usePomodoro((s) => s.state?.settings.musicFolder ?? '')
  const [info, setInfo] = useState<Info | null>(null)
  const [drag, setDrag] = useState(false)

  const refresh = (): void => {
    window.pomodoro.getMusicFolderInfo().then(setInfo).catch(() => {})
  }
  useEffect(refresh, [folder])

  const onDrop = (e: DragEvent): void => {
    e.preventDefault()
    setDrag(false)
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    const path = window.pomodoro.getPathForFile(file)
    if (path) void setFolder(path).then(refresh)
  }

  const name = info?.path ? info.path.split('/').filter(Boolean).pop() : ''
  const count = info ? `${info.count} song${info.count === 1 ? '' : 's'}` : ''

  return (
    <div
      className={`music-folder${drag ? ' drag' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setDrag(true)
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={onDrop}
    >
      <div className="mf-row">
        <IconFolder size={14} />
        <span className="mf-path" title={info?.path}>
          {info?.isCustom ? name : 'Built-in app folder'}
        </span>
        <span className="mf-count">{count}</span>
      </div>
      <div className="mf-actions">
        <button className="text-btn primary" onClick={() => void pick().then(refresh)}>
          Choose folder…
        </button>
        <button className="text-btn" onClick={() => window.pomodoro.openMusicFolder()}>
          Open
        </button>
        {info?.isCustom && (
          <button className="text-btn" onClick={() => void setFolder('').then(refresh)}>
            Use default
          </button>
        )}
      </div>
      <div className="mf-hint">Drag any folder here, or choose one — its songs become your playlist.</div>
    </div>
  )
}
