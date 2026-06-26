# Releasing Petomato (with auto-update)

Petomato ships an in-app auto-updater (Tauri's updater plugin). The app checks
GitHub Releases for a newer **signed** build, downloads it, installs it, and
relaunches — no manual download. This doc covers cutting a release.

## How updating works

- `src-tauri/tauri.conf.json` → `plugins.updater` holds the **public** key and the
  endpoint: `…/releases/latest/download/latest.json`.
- Every release uploads `latest.json` plus the platform artifacts. The app
  compares versions, verifies the artifact's signature against the embedded
  public key, then installs + relaunches.
- The **About → Check for Updates** button does this on demand; the main window
  also does a silent check on launch and shows an "Update" pill if one is ready.

> First-run caveat: builds **before** the updater existed (≤ v2.0.3) can't
> auto-update — users install the first updater-enabled build manually. From
> that build onward, updates are automatic.

## ⚠️ macOS is currently UNSIGNED — read this

The CI workflow does **not** Apple-code-sign the mac build (the `APPLE_*` env
block in `release.yml` is commented out — there's no Developer ID cert yet). The
updater `.app.tar.gz` is still signed with the Tauri **updater** key, so
auto-update is cryptographically verified, but macOS **Gatekeeper** is a separate
gate that only a real Apple signature satisfies. Consequences:

- **Fresh install:** double-clicking the app shows *"'Petomato' is damaged and
  can't be opened. You should eject the disk image."* — it is **not** damaged;
  Gatekeeper refuses to launch an unsigned, quarantined app. Fix (one time, after
  dragging the app into `/Applications`):

  ```bash
  xattr -dr com.apple.quarantine /Applications/Petomato.app
  ```

  Then open it normally. (For an unsigned/ad-hoc app, right-click → *Open* often
  does **not** work — the quarantine strip above is the reliable path.)

- **Auto-update relaunch:** when an installed copy updates itself in place, the
  replaced bundle is still unsigned, so macOS **may re-quarantine it** and show
  the same "damaged" prompt on the post-update relaunch. The user then re-runs the
  `xattr` command. In other words, **unsigned mac auto-update is not seamless** —
  it can require a manual step after each update.

**The cure** is a proper Apple signature + notarization (see *Signing keys* and
the secrets table below). Once configured, the "damaged"/quarantine prompts
disappear for you and every user, and in-place mac auto-update becomes seamless.
Windows is unaffected by all of this.

## Signing keys

Two independent signatures are involved:

1. **Updater key** (ed25519, Tauri) — proves an update came from you.
   - Private key: `~/.tauri/petomato-updater.key` (generated locally — **keep secret, back it up**; losing it breaks updates for all installs).
   - Public key: already embedded in `tauri.conf.json`.
   - Regenerate with: `pnpm tauri signer generate -w ~/.tauri/petomato-updater.key`
2. **Apple Developer ID** — code-signs + notarizes the macOS app (unchanged from before).

## Option A — push a tag, let CI publish (recommended, cross-platform)

```bash
./scripts/release.sh 2.1.0
```

This bumps the version in `package.json`, `Cargo.toml`, and `tauri.conf.json`,
commits, tags `v2.1.0`, and pushes. The `release` GitHub Actions workflow
(`.github/workflows/release.yml`) then builds macOS (per-chip `aarch64` + `x86_64`,
plus a `universal` DMG for manual download) and Windows, signs the **updater**
artifacts, generates `latest.json`, and publishes the GitHub Release. Apple
code-signing runs only once the `APPLE_*` secrets are set (see the unsigned-macOS
note above). Auto-update serves the per-chip artifacts (~half the size of
universal).

### Required GitHub repo secrets

Settings → Secrets and variables → Actions:

| Secret | What it is |
| --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | Contents of `~/.tauri/petomato-updater.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Its password (empty if none) |
| `APPLE_CERTIFICATE` | base64 of your Developer ID `.p12` |
| `APPLE_CERTIFICATE_PASSWORD` | `.p12` export password |
| `APPLE_SIGNING_IDENTITY` | `Developer ID Application: Name (TEAMID)` |
| `APPLE_ID` | Apple ID email (for notarization) |
| `APPLE_PASSWORD` | app-specific password from appleid.apple.com |
| `APPLE_TEAM_ID` | your 10-char team id |

Set the updater key secret with:

```bash
gh secret set TAURI_SIGNING_PRIVATE_KEY < ~/.tauri/petomato-updater.key
gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD --body ""
```

## Option B — build + publish locally (macOS only)

```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)"
export APPLE_ID="you@example.com"; export APPLE_PASSWORD="xxxx-xxxx-xxxx-xxxx"; export APPLE_TEAM_ID="TEAMID"
./scripts/release-mac.sh          # builds, signs, notarizes, writes latest.json
```

It prints the exact `gh release upload …` command to publish the DMG, the
`.app.tar.gz` + `.sig`, and `latest.json`. (Windows users won't get auto-updates
from a mac-only release — use Option A for both platforms.)
