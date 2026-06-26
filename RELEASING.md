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
(`.github/workflows/release.yml`) then builds macOS (universal) + Windows, signs
everything, generates `latest.json`, and publishes the GitHub Release.

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
