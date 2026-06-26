//! macOS strict-mode site blocker — a direct port of `focusGuard.ts`. Pure AppleScript
//! via `osascript`, so it needs **no Node and no Tauri sidecar**. Gated to macOS; on
//! other platforms every fn is a no-op.
//!
//! Behaviour (incl. the v1.0.6 fix): the full-screen overlay is shown ONLY when the
//! *foreground* browser tab is a blocked site, while blocked tabs in background windows
//! are silently redirected to about:blank.
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::{AppHandle, Manager};

static SNOOZE_UNTIL: AtomicU64 = AtomicU64::new(0);

fn now_ms() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    // Never unwrap: this is on the per-tick path and the release profile aborts on
    // panic, which would kill the timer session. A clock before the epoch just maps
    // to 0 (snooze still works correctly relative to a sane clock).
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

pub fn snooze(seconds: u64) {
    SNOOZE_UNTIL.store(now_ms() + seconds * 1000, Ordering::Relaxed);
}

/// Called every tick from the timer loop. Runs detection only while strict-focus is on.
pub fn maybe_sync(app: &AppHandle) {
    #[cfg(target_os = "macos")]
    {
        use crate::timer::AppState;
        let (active, block_list) = {
            let s = app.state::<AppState>();
            let e = s.engine.lock().unwrap();
            let on = e.settings.strict_mode
                && matches!(e.phase, crate::model::Phase::Focus)
                && matches!(e.status, crate::model::Status::Running)
                && !e.settings.block_list.is_empty();
            (on, e.settings.block_list.clone())
        };
        if !active {
            crate::windows::hide_blocker(app);
            return;
        }
        if now_ms() < SNOOZE_UNTIL.load(Ordering::Relaxed) {
            crate::windows::hide_blocker(app);
            return;
        }
        let det = detect_front();
        // When our own overlay grabbed focus, Petomato is the frontmost app. Don't
        // treat that as "user navigated away" and hide the overlay — that would start
        // a show/hide/focus-steal flicker loop against the still-blocked browser tab.
        // Hold the overlay until a real, non-blocked foreground app appears.
        if det.app.to_lowercase().contains("petomato") && crate::windows::blocker_visible(app) {
            return;
        }
        // foreground app/url; redirect background blocked tabs silently, overlay only on
        // the foreground tab (see focusGuard.ts poll()).
        if let Some(hit) = enforce_and_match(&det, &block_list) {
            crate::windows::show_blocker(app, &hit);
        } else {
            crate::windows::hide_blocker(app);
        }
        let _ = app; // used on macOS only
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app; // site blocking is macOS-only (AppleScript)
    }
}

/// One-shot detection for the Settings "Test focus shield" button.
pub fn test_once() -> serde_json::Value {
    #[cfg(target_os = "macos")]
    {
        let d = detect_front();
        serde_json::json!({ "app": d.app, "title": d.title, "url": d.url, "error": d.error, "blocked": serde_json::Value::Null })
    }
    #[cfg(not(target_os = "macos"))]
    {
        serde_json::json!({ "app": "", "title": "", "url": "", "error": "unsupported-os", "blocked": null })
    }
}

#[cfg(target_os = "macos")]
struct Detection { app: String, title: String, url: String, error: String }

#[cfg(target_os = "macos")]
fn osascript(script: &str) -> Result<String, String> {
    use std::process::Command;
    let out = Command::new("osascript").arg("-e").arg(script).output().map_err(|e| e.to_string())?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}

#[cfg(target_os = "macos")]
fn detect_front() -> Detection {
    const FRONT: &str = r#"tell application "System Events"
  set p to first process whose frontmost is true
  set appName to name of p
  set winTitle to ""
  try
    set winTitle to name of front window of p
  end try
  return appName & "||" & winTitle
end tell"#;
    match osascript(FRONT) {
        Err(e) => Detection { app: String::new(), title: String::new(), url: String::new(), error: e },
        Ok(s) => {
            let mut it = s.splitn(2, "||");
            let app = it.next().unwrap_or("").to_string();
            let title = it.next().unwrap_or("").to_string();
            let url = if is_browser(&app) {
                let acc = tab_accessor(&app);
                osascript(&format!("tell application \"{app}\" to get URL of {acc} of front window")).unwrap_or_default()
            } else { String::new() };
            Detection { app, title, url, error: String::new() }
        }
    }
}

#[cfg(target_os = "macos")]
fn is_browser(app: &str) -> bool {
    const C: [&str; 9] = ["Arc","Dia","Google Chrome","Google Chrome Canary","Brave Browser","Microsoft Edge","Vivaldi","Chromium","Opera"];
    C.contains(&app) || app == "Safari" || app == "Safari Technology Preview"
}
#[cfg(target_os = "macos")]
fn tab_accessor(app: &str) -> &'static str {
    if app.starts_with("Safari") { "current tab" } else { "active tab" }
}

/// Tokens for a blocklist entry, e.g. "https://youtube.com/x" → ["youtube.com","youtube"].
#[cfg(target_os = "macos")]
fn matches(hay: &str, block_list: &[String]) -> Option<String> {
    let h = hay.to_lowercase();
    block_list.iter().find(|e| {
        let e = e.to_lowercase();
        let e = e.trim_start_matches("https://").trim_start_matches("http://").trim_start_matches("www.");
        let host = e.split('/').next().unwrap_or(e);
        let main = host.split('.').next().unwrap_or(host);
        [host, main, e].iter().any(|t| t.len() >= 3 && h.contains(t))
    }).cloned()
}

#[cfg(target_os = "macos")]
fn enforce_and_match(d: &Detection, block_list: &[String]) -> Option<String> {
    if d.error.is_empty() == false || d.app.is_empty() { return None; }
    let al = d.app.to_lowercase();
    if al.contains("petomato") { return None; }
    if is_browser(&d.app) {
        // silently redirect every blocked tab across windows (real enforcement)
        let acc = tab_accessor(&d.app);
        let enum_script = format!(
            "tell application \"{app}\"\nset out to \"\"\nset i to 0\nrepeat with w in windows\nset i to i + 1\ntry\nset out to out & i & \"||\" & (URL of {acc} of w) & linefeed\nend try\nend repeat\nreturn out\nend tell",
            app = d.app, acc = acc);
        if let Ok(list) = osascript(&enum_script) {
            let hits: Vec<&str> = list.lines().filter_map(|ln| {
                let mut it = ln.splitn(2, "||");
                let idx = it.next()?; let url = it.next().unwrap_or("");
                if matches(url, block_list).is_some() { Some(idx) } else { None }
            }).collect();
            for idx in hits {
                let _ = osascript(&format!("tell application \"{}\" to set URL of {} of window {} to \"about:blank\"", d.app, acc, idx));
            }
        }
        // overlay only when the FOREGROUND tab is blocked
        matches(&d.url, block_list)
    } else {
        // native app in front (e.g. Slack desktop)
        matches(&format!("{} {}", d.app, d.title), block_list)
    }
}
