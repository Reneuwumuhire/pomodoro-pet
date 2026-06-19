//! Window lifecycle (replaces `windows.ts`). Tauri multi-window: each renderer entry
//! (index/mini/strict/blocked/about) is its own `WebviewWindow`. The "single-widget
//! rule" (main and mini never both shown) is enforced here.
use crate::model::{Phase, Status};
use crate::timer::AppState;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Manager, PhysicalPosition, WebviewUrl, WebviewWindowBuilder};

/// When pinned (e.g. a native folder picker is open), the popover won't hide-on-blur.
static POPOVER_PINNED: AtomicBool = AtomicBool::new(false);
pub fn set_pinned(v: bool) { POPOVER_PINNED.store(v, Ordering::Relaxed); }
pub fn is_pinned() -> bool { POPOVER_PINNED.load(Ordering::Relaxed) }

/// Fullscreen strict-mode breathing-break takeover, synced to strict breaks
/// (matches Electron's syncStrictWindow): shown while strict mode is on and a
/// break phase is running; hidden otherwise.
pub fn sync_strict(app: &AppHandle) {
    let (strict, show) = {
        let st = app.state::<AppState>();
        let e = st.engine.lock().unwrap();
        (
            e.settings.strict_mode,
            matches!(e.status, Status::Running) && matches!(e.phase, Phase::Short | Phase::Long),
        )
    };
    if strict && show { show_strict(app); } else { hide_strict(app); }
}

fn show_strict(app: &AppHandle) {
    let win = app.get_webview_window("strict").unwrap_or_else(|| {
        WebviewWindowBuilder::new(app, "strict", WebviewUrl::App("strict.html".into()))
            .decorations(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .visible(false)
            .build()
            .expect("build strict")
    });
    // sync_strict runs on every tick — only (re)show + focus on the transition to
    // visible, otherwise it would steal focus continuously.
    if win.is_visible().unwrap_or(false) {
        return;
    }
    let _ = win.set_visible_on_all_workspaces(true);
    // Cover the whole primary monitor — a reliable fullscreen takeover (native
    // fullscreen is flaky for transparent/frameless windows). Only the "Skip break"
    // button closes it (skip → broadcast → sync_strict → hide_strict).
    if let Ok(Some(mon)) = app.primary_monitor() {
        let p = mon.position();
        let s = mon.size();
        let _ = win.set_position(PhysicalPosition::new(p.x, p.y));
        let _ = win.set_size(tauri::PhysicalSize::new(s.width, s.height));
    }
    let _ = win.show();
    let _ = win.set_focus();
    raise_above_everything(&win); // float above the menu bar + fullscreen apps
}

/// Put a window above EVERYTHING on macOS — screen-saver level + join-all-spaces,
/// so the strict break covers the menu bar and overlays fullscreen apps.
#[cfg(target_os = "macos")]
fn raise_above_everything(win: &tauri::WebviewWindow) {
    use objc2::{msg_send, runtime::AnyObject};
    if let Ok(ptr) = win.ns_window() {
        let ns = ptr as *mut AnyObject;
        // NSScreenSaverWindowLevel = 1000; collectionBehavior = CanJoinAllSpaces (1)
        // | FullScreenAuxiliary (1<<8). Also lock it so it can't be dragged — tao
        // makes borderless windows movable-by-background, which is what let the user
        // drag the break overlay.
        unsafe {
            let _: () = msg_send![ns, setLevel: 1000isize];
            let _: () = msg_send![ns, setCollectionBehavior: 1usize | (1usize << 8)];
            let _: () = msg_send![ns, setMovable: false];
            let _: () = msg_send![ns, setMovableByWindowBackground: false];
        }
    }
}
#[cfg(not(target_os = "macos"))]
fn raise_above_everything(_win: &tauri::WebviewWindow) {}
fn hide_strict(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("strict") { let _ = w.hide(); }
}

pub fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        place_top_right(app, &w); // open top-right every time
        let _ = w.set_focus();
    }
    if let Some(m) = app.get_webview_window("mini") { let _ = m.hide(); }
}

pub fn toggle_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        if w.is_visible().unwrap_or(false) { let _ = w.hide(); } else { show_main(app); }
    }
}

pub fn show_mini(app: &AppHandle) {
    if let Some(m) = app.get_webview_window("main") { let _ = m.hide(); }
    let win = app.get_webview_window("mini").unwrap_or_else(|| {
        WebviewWindowBuilder::new(app, "mini", WebviewUrl::App("mini.html".into()))
            .title("Petomato — Mini")
            // Card fills the window with rounded corners; the native macOS window
            // shadow then follows the rounded shape (shadow(false) doesn't reliably
            // remove the native shadow on transparent windows, and a gutter made it
            // draw a square — so let the card fill the window like the main popover).
            .inner_size(280.0, 248.0)
            .resizable(false)
            .decorations(false)
            .transparent(true)
            .always_on_top(true)
            .skip_taskbar(true)
            .build()
            .expect("build mini")
    });
    let _ = win.set_visible_on_all_workspaces(true);
    // Show first so the window is realized, THEN pin it top-right (setting position
    // before show doesn't stick on macOS). The user can drag it afterwards; the next
    // open resets to top-right.
    let _ = win.show();
    place_top_right(app, &win);
    let _ = win.set_focus();
}

/// Move a window to the top-right corner of the primary monitor (below the menu bar).
pub fn place_top_right(app: &AppHandle, win: &tauri::WebviewWindow) {
    if let Ok(Some(mon)) = app.primary_monitor() {
        let scale = mon.scale_factor();
        let mpos = mon.position();
        let msize = mon.size();
        let margin = (12.0 * scale) as i32;
        let below_menubar = (36.0 * scale) as i32;
        let w = win
            .outer_size()
            .ok()
            .map(|s| s.width as i32)
            .filter(|&w| w > 0)
            .unwrap_or((420.0 * scale) as i32);
        let x = mpos.x + msize.width as i32 - w - margin;
        let y = mpos.y + below_menubar;
        let _ = win.set_position(PhysicalPosition::new(x, y));
    }
}

pub fn toggle_mini(app: &AppHandle) {
    match app.get_webview_window("mini") {
        Some(m) if m.is_visible().unwrap_or(false) => { let _ = m.hide(); }
        _ => show_mini(app),
    }
}

pub fn show_about(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("about") {
        let _ = w.center();
        let _ = w.show();
        let _ = w.set_focus();
        return;
    }
    let win = WebviewWindowBuilder::new(app, "about", WebviewUrl::App("about.html".into()))
        .title("About Petomato")
        .inner_size(380.0, 500.0)
        .resizable(false)
        .minimizable(false)
        .maximizable(false)
        .decorations(false)
        .transparent(true)
        .center()
        .build()
        .expect("build about");
    let _ = win.show();
    let _ = win.set_focus();
}

/// Show / hide the full-screen strict-focus blocker overlay (`blocked.html`).
pub fn show_blocker(app: &AppHandle, site: &str) {
    use tauri::Emitter;
    let url = format!("blocked.html?site={}", urlencoding(site));
    let win = app.get_webview_window("blocker").unwrap_or_else(|| {
        WebviewWindowBuilder::new(app, "blocker", WebviewUrl::App(url.into()))
            .decorations(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .visible(false)
            .build()
            .expect("build blocker")
    });
    let _ = win.emit("blocker-site", site); // update the site even when already open
    if win.is_visible().unwrap_or(false) {
        return;
    }
    let _ = win.set_visible_on_all_workspaces(true);
    if let Ok(Some(mon)) = app.primary_monitor() {
        let p = mon.position();
        let s = mon.size();
        let _ = win.set_position(PhysicalPosition::new(p.x, p.y));
        let _ = win.set_size(tauri::PhysicalSize::new(s.width, s.height));
    }
    let _ = win.show();
    let _ = win.set_focus();
    raise_above_everything(&win); // above everything + not draggable
}
pub fn hide_blocker(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("blocker") { let _ = w.hide(); }
}

fn urlencoding(s: &str) -> String {
    s.chars().map(|c| if c.is_ascii_alphanumeric() { c.to_string() } else { format!("%{:02X}", c as u32) }).collect()
}
