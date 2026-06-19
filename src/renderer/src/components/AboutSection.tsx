import { useEffect, useState } from 'react'
import type { AppMeta, UpdateInfo } from '@shared/types'

/** App info + version + a one-click "check for updates" (compares the latest
 *  GitHub release to the running version and offers the installer to download). */
export default function AboutSection(): JSX.Element {
  const [meta, setMeta] = useState<AppMeta | null>(null)
  const [status, setStatus] = useState<'idle' | 'checking' | 'done'>('idle')
  const [update, setUpdate] = useState<UpdateInfo | null>(null)

  useEffect(() => {
    window.pomodoro.getAppMeta().then(setMeta).catch(() => {})
  }, [])

  const open = (url?: string): void => {
    if (url) window.pomodoro.openExternal(url)
  }

  const check = async (): Promise<void> => {
    setStatus('checking')
    setUpdate(null)
    try {
      setUpdate(await window.pomodoro.checkForUpdate())
    } catch {
      /* ignore */
    }
    setStatus('done')
  }

  return (
    <div className="about">
      <div className="about-head">
        <span className="about-name">Petomato</span>
        <span className="about-ver">v{meta?.version ?? '…'}</span>
      </div>
      <div className="about-by">
        Made by{' '}
        <button className="link" onClick={() => open(meta?.authorUrl)}>
          {meta?.author ?? 'Rene Uwumuhire'}
        </button>
      </div>
      <div className="about-links">
        <button className="text-btn" onClick={() => open(meta?.siteUrl)}>
          Website
        </button>
        <button className="text-btn" onClick={() => open(meta?.repoUrl)}>
          GitHub
        </button>
      </div>

      <button className="folder-btn" onClick={check} disabled={status === 'checking'}>
        {status === 'checking' ? 'Checking…' : 'Check for updates'}
      </button>

      {status === 'done' && update && (
        <div className="about-update">
          {update.error ? (
            <span className="muted">
              Couldn’t reach GitHub —{' '}
              <button className="link" onClick={() => open(update.releaseUrl)}>
                open Releases
              </button>
            </span>
          ) : update.hasUpdate ? (
            <>
              <span className="up">Update available — v{update.latest}</span>
              <button className="folder-btn primary" onClick={() => open(update.assetUrl)}>
                Download v{update.latest}
              </button>
            </>
          ) : (
            <span className="ok">You’re on the latest version ✓</span>
          )}
        </div>
      )}
    </div>
  )
}
