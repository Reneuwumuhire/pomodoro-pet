//! Window lifecycle (replaces `windows.ts`). Tauri multi-window: each renderer entry
//! (index/mini/strict/blocked/about) is its own `WebviewWindow`. The "single-widget
//! rule" (main and mini never both shown) is enforced here.
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

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
            .inner_size(280.0, 248.0)
            .resizable(false)
            .decorations(false)
            .transparent(true)
            .always_on_top(true)
            .skip_taskbar(true)
            .build()
            .expect("build mini")
    });
    let _ = win.show();
    let _ = win.set_focus();
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
    let _ = win.show();
}
pub fn hide_blocker(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("blocker") { let _ = w.hide(); }
}

fn urlencoding(s: &str) -> String {
    s.chars().map(|c| if c.is_ascii_alphanumeric() { c.to_string() } else { format!("%{:02X}", c as u32) }).collect()
}
