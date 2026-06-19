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

/// Toggle the main popover, positioning it centered just below the tray icon
/// (menu-bar popover behaviour). Coords are physical pixels from the tray rect.
pub fn toggle_main_at(app: &AppHandle, tray_center_x: f64, tray_bottom_y: f64) {
    if let Some(w) = app.get_webview_window("main") {
        if w.is_visible().unwrap_or(false) {
            let _ = w.hide();
            return;
        }
        if let Ok(size) = w.outer_size() {
            let x = (tray_center_x - size.width as f64 / 2.0).max(8.0);
            let _ = w.set_position(PhysicalPosition::new(x, tray_bottom_y + 2.0));
        }
        let _ = w.show();
        let _ = w.set_focus();
    }
    if let Some(m) = app.get_webview_window("mini") { let _ = m.hide(); }
}

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
            .maximized(true)
            .build()
            .expect("build strict")
    });
    let _ = win.set_fullscreen(true);
    let _ = win.show();
    let _ = win.set_focus();
}
fn hide_strict(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("strict") { let _ = w.hide(); }
}

pub fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
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
            // sized to fit the card (280x246) + a transparent gutter for its rounded
            // drop shadow; native window shadow OFF so there's no square artifact.
            .inner_size(330.0, 300.0)
            .resizable(false)
            .decorations(false)
            .transparent(true)
            .shadow(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .build()
            .expect("build mini")
    });
    let _ = win.set_visible_on_all_workspaces(true);
    // Always (re)open top-right; the user can then drag it wherever.
    position_mini_top_right(app, &win);
    let _ = win.show();
    let _ = win.set_focus();
}

fn position_mini_top_right(app: &AppHandle, win: &tauri::WebviewWindow) {
    if let Ok(Some(mon)) = app.primary_monitor() {
        let scale = mon.scale_factor();
        let mpos = mon.position();
        let msize = mon.size();
        let margin = (12.0 * scale) as i32;
        let below_menubar = (36.0 * scale) as i32;
        let w = win.outer_size().map(|s| s.width as i32).unwrap_or((330.0 * scale) as i32);
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
    if let Some(w) = app.get_webview_window("about") { let _ = w.show(); let _ = w.set_focus(); return; }
    let _ = WebviewWindowBuilder::new(app, "about", WebviewUrl::App("about.html".into()))
        .title("About Petomato")
        .inner_size(360.0, 480.0)
        .resizable(false)
        .build();
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
            .maximized(true)
            .build()
            .expect("build blocker")
    });
    let _ = win.set_fullscreen(true);
    let _ = win.emit("blocker-site", site); // update the site when already open
    let _ = win.show();
}
pub fn hide_blocker(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("blocker") { let _ = w.hide(); }
}

fn urlencoding(s: &str) -> String {
    s.chars().map(|c| if c.is_ascii_alphanumeric() { c.to_string() } else { format!("%{:02X}", c as u32) }).collect()
}
