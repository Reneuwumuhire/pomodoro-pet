# Petomato — Electron → Tauri 2 Migration

Goal: keep the **exact v1.0.5 React UI** while replacing the Electron shell (Chromium +
Node) with **Tauri 2** (OS-native WebView + a Rust core). Expected bundle: **~120 MB → ~10–15 MB**.

The frontend (`src/renderer`) is reused **as-is**. Only the thin Electron preload API
(`window.pomodoro`) is swapped for a Tauri shim (`src/renderer/src/platform/tauri.ts`) that
calls Rust `#[tauri::command]`s and `listen()`s for events. No React component changes.

---

## 1. Architecture map — Electron → Tauri

| Electron (`src/main/*.ts`)            | Responsibility                                            | Tauri replacement |
|---------------------------------------|-----------------------------------------------------------|-------------------|
| `timer.ts` `TimerEngine`              | 1 Hz countdown, focus→break cycle, source of truth        | `src-tauri/src/timer.rs` — `TimerEngine` behind `Mutex` in `State`, ticked by a `tokio` interval task that `emit`s `timer-state` |
| `store.ts` (electron-store)           | Persist settings / tasks / stats (JSON)                   | `tauri-plugin-store` (JSON in app-data dir) — `store.rs` typed getters/setters |
| `ipc.ts` (`ipcMain.handle/on`)        | 30+ IPC channels                                          | `commands.rs` — one `#[tauri::command]` per channel; `generate_handler![]` |
| `windows.ts` (BrowserWindow × 5 + Tray)| main / mini / strict / blocked / about windows + tray    | `tauri.conf.json > app.windows` + runtime `WebviewWindowBuilder`; `TrayIconBuilder` with live `set_title` |
| `notifications.ts`                    | Native phase-end notification                            | `tauri-plugin-notification` |
| `focusGuard.ts` (osascript polling)   | macOS strict-mode site blocker (read + redirect tabs)    | `focus_guard.rs` — `std::process::Command("osascript")` on an interval, `#[cfg(target_os="macos")]`. **Hard part — see §4** |
| `music.ts` (`pomo-audio://` protocol) | Serve bundled + user-folder mp3s to `<audio>`            | Bundled mp3s ride in `frontendDist` (Vite). User folder → `convertFileSrc()` (asset protocol) + `fs` scope. **See §4** |
| `update.ts` (GitHub releases check)   | "Check for Updates" + About                              | `tauri-plugin-updater` (signed) **or** keep the manual GitHub-API check as a command + `tauri-plugin-opener` |
| `preload/index.ts` (`window.pomodoro`)| contextBridge API                                        | `src/renderer/src/platform/tauri.ts` — same shape, backed by `invoke`/`listen` |

### IPC surface → Tauri commands/events

```
start/pause/reset/skip/focusNow      → invoke('start') …            (commands, fire-and-forget)
getState                             → invoke('get_state')          (returns TimerState)
updateSettings(partial)              → invoke('update_settings',{partial})
getStats                             → invoke('get_stats')
getTasks/addTask/updateTask/         → invoke('tasks_*')            (return Task[])
  deleteTask/reorderTasks/setActiveTask
showMini/showMain/toggleMini/hideMain→ invoke('win_*')             (window control)
getAudioSlots/getMusicLibrary/       → invoke('audio_*')
  getMusicFolderInfo/pickMusicFolder/setMusicFolder/openMusicFolder
getPathForFile(File)                 → @tauri-apps/plugin-dialog open() / drag-drop event (no preload needed)
snoozeBlocker/testBlocker            → invoke('blocker_*')
onState/onChime/onTasks/onBlockerSite→ listen('timer-state' | 'chime' | 'tasks-state' | 'blocker-site')
```

---

## 2. Project file tree

```
petomato/
├─ src/renderer/                 # UNCHANGED React/Vite UI (the v1.0.5 look)
│  ├─ index.html mini.html strict.html blocked.html
│  └─ src/
│     ├─ components/ pets/ styles/ audio/ state/
│     └─ platform/
│        ├─ index.ts             # picks tauri.ts (or keeps electron preload during transition)
│        └─ tauri.ts             # window.pomodoro shim → invoke()/listen()   ← NEW
├─ vite.config.ts                # web build for Tauri → ../dist-web          ← NEW
├─ src-tauri/                                                                  ← NEW (the Rust core)
│  ├─ Cargo.toml
│  ├─ build.rs
│  ├─ tauri.conf.json            # hardened: macOS 13.0+, Win WebView2 bootstrapper
│  ├─ capabilities/default.json  # Tauri 2 permission grants
│  ├─ icons/                     # icon.icns / icon.ico / *.png
│  └─ src/
│     ├─ main.rs                 # builder, plugins, state, tray, handler list
│     ├─ model.rs                # Settings/Task/Stats/TimerState (serde mirror of shared/types.ts)
│     ├─ timer.rs                # TimerEngine + 1 Hz tick task
│     ├─ store.rs                # persistence (tauri-plugin-store)
│     ├─ commands.rs             # #[tauri::command] handlers (the IPC surface)
│     ├─ windows.rs              # create/toggle main·mini·strict·blocked·about
│     └─ focus_guard.rs          # macOS osascript site-blocker (cfg-gated)
├─ .github/workflows/tauri-release.yml   # universal-apple-darwin + win x64/arm64  ← NEW
└─ (electron files stay until cutover: electron.vite.config.ts, src/main, src/preload)
```

---

## 3. Cross-platform constraints (how they're satisfied)

- **macOS 13.0 (Ventura) → 26.0 (Tahoe):** `bundle.macOS.minimumSystemVersion: "13.0"`. There is
  no upper bound in macOS deployment targets — 13.0 means "13.0 and newer", which covers Tahoe.
  WKWebView is the system WebView on all of those, so no Chromium ships.
- **Universal binary (Intel + Apple Silicon M1–M5):** build with `--target universal-apple-darwin`
  (Tauri lipos `x86_64` + `aarch64` automatically). Requires both Rust targets installed.
- **Windows 10 (1803+) & 11, x64 + ARM64:** targets `x86_64-pc-windows-msvc` and
  `aarch64-pc-windows-msvc`. WebView2 is the runtime.
- **WebView2 Evergreen Bootstrapper fallback:** `bundle.windows.webviewInstallMode =
  { "type": "downloadBootstrapper", "silent": true }` — the NSIS/MSI installer silently downloads
  & installs the Evergreen runtime on machines that lack it (e.g. older Win10).

---

## 4. Hard parts (flagged early, with strategy)

1. **Focus-shield (macOS site blocker) — `focusGuard.ts`.** Pure AppleScript; no Node deps, so it
   ports 1:1 to Rust shelling out to `osascript` via `std::process::Command`, gated with
   `#[cfg(target_os = "macos")]`. A `tokio` interval drives it while strict-focus is active. The
   **v1.0.6 fix is baked in**: the full-screen overlay only triggers on the *foreground* tab
   (`url`), while background blocked tabs are silently redirected to `about:blank`. Needs the
   `NSAppleEventsUsageDescription` Info.plist key + Automation/Accessibility permission (same as
   today). No Tauri sidecar required.
2. **Audio (`pomo-audio://` custom protocol).** Two cases:
   - *Bundled* lo-fi/ambient mp3s: imported in the renderer, so Vite bundles them into
     `dist-web` and they play from the WebView origin — nothing to port.
   - *User music folder* (files outside the bundle): replace the custom protocol with Tauri's
     **asset protocol** — `convertFileSrc(absolutePath)` returns an `asset://` URL the `<audio>`
     element can load, gated by an `fs`/`asset` scope in capabilities. The folder listing
     (`getMusicLibrary`) becomes a Rust `read_dir` command.
3. **Tray with live countdown title.** `TrayIconBuilder` + `tray.set_title(Some("24:59"))` each
   tick. macOS shows the title next to the icon (as today); Windows has no tray text, so mirror the
   countdown into the tooltip via `set_tooltip`.
4. **Transparent / frameless / always-on-top popover + draggable card.** Supported:
   `transparent: true, decorations: false, alwaysOnTop: true`; dragging uses `data-tauri-drag-region`
   instead of `-webkit-app-region: drag` (one CSS/attr swap).
5. **No remaining Node-only deps.** `electron-store` → `tauri-plugin-store`; `electron`'s `net`,
   `dialog`, `shell`, `Notification` → `tauri-plugin-{http,dialog,opener,notification}`. zustand +
   react-icons are frontend-only and unaffected.

---

## 5. Build & cross-compilation

**Toolchain:** Rust stable + `rustup target add` for each triple; Node/pnpm for the frontend;
platform SDKs (Xcode CLT on macOS; MSVC Build Tools + the matching Windows target on Windows).

```bash
# one-time targets
rustup target add aarch64-apple-darwin x86_64-apple-darwin          # macOS universal
rustup target add x86_64-pc-windows-msvc aarch64-pc-windows-msvc    # Windows (on a Windows host)

# macOS — Universal DMG + .app (run on macOS)
pnpm tauri build --target universal-apple-darwin

# Windows — x64 and ARM64 NSIS + MSI (run on Windows)
pnpm tauri build --target x86_64-pc-windows-msvc
pnpm tauri build --target aarch64-pc-windows-msvc
```

Cross-compiling Windows from macOS/Linux is not officially supported (MSVC linker) — use the
**GitHub Actions matrix** in `.github/workflows/tauri-release.yml`: a `macos-latest` runner builds
the universal mac bundle; `windows-latest` builds x64; `windows-11-arm` (or x64 host with the arm64
target) builds ARM64. Artifacts land in
`src-tauri/target/<triple>/release/bundle/{dmg,nsis,msi}/`.

---

## 6. Cutover checklist

1. Land `src-tauri/` + the frontend shim; run `pnpm tauri dev` — verify timer, tasks, stats, audio,
   skins, mini, strict break, blocker.
2. Port `focus_guard.rs` and re-grant macOS Automation permission; verify tab redirect + overlay.
3. Wire the tray countdown + notifications.
4. CI green on all three targets; smoke-test installers on Ventura (Intel), Apple Silicon, Win10, Win11-ARM.
5. Delete the Electron files (`electron.vite.config.ts`, `src/main`, `src/preload`,
   `electron-builder.yml`) and the Electron devDeps. Bump to **v2.0.0**.
```
```

---

## 7. Bootstrap (package.json additions)

Left out of `package.json` for now so the existing Electron `--frozen-lockfile` CI keeps
passing. Apply when starting the Tauri work:

```jsonc
// scripts
"dev:web":   "vite",
"build:web": "vite build",
"tauri":     "tauri"

// devDependencies
"@tauri-apps/cli": "^2",

// dependencies (frontend Tauri APIs used by platform/tauri.ts)
"@tauri-apps/api": "^2",
"@tauri-apps/plugin-dialog": "^2"
```

Then: `cargo install create-tauri-app` is not needed — just
`pnpm add -D @tauri-apps/cli && pnpm add @tauri-apps/api @tauri-apps/plugin-dialog`,
drop real icons into `src-tauri/icons/` (`pnpm tauri icon path/to/icon.png` generates all sizes),
and run `pnpm tauri dev`.

> Build status: this scaffold is the verified-by-inspection foundation (JSON configs parse;
> Rust/TS are idiomatic Tauri 2). It is **not yet compiled** — there's no Rust toolchain in the
> authoring sandbox, and Windows targets can only be produced on Windows/CI. First real build:
> `pnpm tauri dev` on macOS, then the CI matrix for the cross-platform installers.
