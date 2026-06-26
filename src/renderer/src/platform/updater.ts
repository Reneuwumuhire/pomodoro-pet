/**
 * In-app auto-update, backed by Tauri's updater plugin. The flow is:
 *   check() → (newer signed release on GitHub?) → downloadAndInstall() → relaunch()
 *
 * The release manifest lives at the `endpoints` URL in tauri.conf.json
 * (GitHub Releases → latest.json) and every artifact is verified against the
 * embedded ed25519 public key, so a tampered download can't be installed.
 *
 * Note: updates only work in a packaged build. In `tauri dev` (and in any build
 * predating the updater) `check()` throws — callers fall back to opening the
 * Releases page in the browser.
 */
import { check, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'

export interface UpdateProgress {
  phase: 'checking' | 'available' | 'downloading' | 'installing' | 'uptodate'
  version?: string
  notes?: string
  /** 0..1 download progress when the content length is known. */
  percent?: number
}

/** Ask GitHub whether a newer signed release exists. Returns the handle or null. */
export async function checkForUpdate(): Promise<Update | null> {
  return await check()
}

/**
 * Download + install a known-available update, reporting progress, then relaunch
 * into the new version. Does NOT return on success (the process restarts).
 */
export async function downloadAndRelaunch(
  update: Update,
  onProgress: (p: UpdateProgress) => void
): Promise<void> {
  let total = 0
  let received = 0
  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case 'Started':
        total = event.data.contentLength ?? 0
        onProgress({ phase: 'downloading', version: update.version, percent: 0 })
        break
      case 'Progress':
        received += event.data.chunkLength
        onProgress({
          phase: 'downloading',
          version: update.version,
          percent: total ? received / total : undefined
        })
        break
      case 'Finished':
        onProgress({ phase: 'installing', version: update.version })
        break
    }
  })
  // Installed — restart so the user lands in the new version immediately.
  await relaunch()
}

/**
 * One-shot convenience used by the About window: check, and if an update exists,
 * download + install + relaunch. Resolves `false` when already up to date.
 */
export async function checkAndInstall(onProgress: (p: UpdateProgress) => void): Promise<boolean> {
  onProgress({ phase: 'checking' })
  const update = await check()
  if (!update) {
    onProgress({ phase: 'uptodate' })
    return false
  }
  onProgress({ phase: 'available', version: update.version, notes: update.body })
  await downloadAndRelaunch(update, onProgress)
  return true
}
