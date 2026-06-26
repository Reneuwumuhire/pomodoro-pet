import { useEffect, useState } from 'react'
import type { Update } from '@tauri-apps/plugin-updater'
import { checkForUpdate, downloadAndRelaunch, type UpdateProgress } from '@/platform/updater'

/**
 * Silent on-launch update check. Stays invisible unless a newer signed release
 * exists, then shows an unobtrusive pill offering to update + restart. Any error
 * (dev build, offline, build predating the updater) is swallowed — the About
 * window's "Check for Updates" button remains the explicit path.
 */
export default function UpdateBanner(): JSX.Element | null {
  const [update, setUpdate] = useState<Update | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    let cancelled = false
    checkForUpdate()
      .then((u) => {
        if (!cancelled) setUpdate(u)
      })
      .catch(() => {
        /* updater unavailable — stay silent */
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (!update || dismissed) return null

  const onUpdate = async (): Promise<void> => {
    setBusy('Starting…')
    try {
      await downloadAndRelaunch(update, (p: UpdateProgress) => {
        if (p.phase === 'downloading') {
          setBusy(`Downloading ${p.percent != null ? `${Math.round(p.percent * 100)}%` : '…'}`)
        } else if (p.phase === 'installing') {
          setBusy('Restarting…')
        }
      })
    } catch {
      setBusy(null) // let the user retry or use About → Open Releases
    }
  }

  return (
    <div className="update-banner" data-no-drag>
      <span className="update-label">v{update.version} available</span>
      {busy ? (
        <span className="update-busy">{busy}</span>
      ) : (
        <>
          <button className="update-go" type="button" onClick={onUpdate}>
            Update
          </button>
          <button
            className="update-x"
            type="button"
            title="Later"
            onClick={() => setDismissed(true)}
          >
            ✕
          </button>
        </>
      )}
    </div>
  )
}
