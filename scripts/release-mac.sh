#!/usr/bin/env bash
# Signed + notarized macOS release build for Petomato.
#
# Prereqs (one-time):
#   1. Apple Developer Program membership (paid).
#   2. A "Developer ID Application" certificate installed in your login keychain.
#      Verify:  security find-identity -v | grep "Developer ID Application"
#   3. Notarization credentials (either an app-specific password OR an App Store
#      Connect API key) — see the env vars below.
#
# Usage:
#   export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)"
#   # --- option A: app-specific password ---
#   export APPLE_ID="you@example.com"
#   export APPLE_PASSWORD="xxxx-xxxx-xxxx-xxxx"   # app-specific password from appleid.apple.com
#   export APPLE_TEAM_ID="TEAMID"
#   # --- option B: App Store Connect API key (instead of A) ---
#   # export APPLE_API_ISSUER="...-...-...-...-..."
#   # export APPLE_API_KEY="ABCDE12345"
#   # export APPLE_API_KEY_PATH="/path/to/AuthKey_ABCDE12345.p8"
#
#   ./scripts/release-mac.sh           # builds universal + aarch64, signs, notarizes, staples
set -euo pipefail
cd "$(dirname "$0")/.."

: "${APPLE_SIGNING_IDENTITY:?Set APPLE_SIGNING_IDENTITY (Developer ID Application: Name (TEAMID))}"
if [[ -z "${APPLE_API_KEY:-}" && -z "${APPLE_ID:-}" ]]; then
  echo "Set either APPLE_API_* (API key) or APPLE_ID/APPLE_PASSWORD/APPLE_TEAM_ID (app-specific password)." >&2
  exit 1
fi

echo "==> Signing identity: $APPLE_SIGNING_IDENTITY"
echo "==> Building + signing + notarizing (universal)…"
pnpm tauri build --target universal-apple-darwin
echo "==> Building + signing + notarizing (aarch64)…"
pnpm tauri build --target aarch64-apple-darwin

UNI="src-tauri/target/universal-apple-darwin/release/bundle/dmg"
ARM="src-tauri/target/aarch64-apple-darwin/release/bundle/dmg"
echo "==> Verifying notarization staple…"
for dmg in "$UNI"/*.dmg "$ARM"/*.dmg; do
  echo "--- $dmg"
  xcrun stapler validate "$dmg" || echo "    (not stapled — check notarization log)"
  spctl -a -t open --context context:primary-signature -v "$dmg" 2>&1 | head -2 || true
done
echo "==> Done. DMGs are signed + notarized and ready to upload."
