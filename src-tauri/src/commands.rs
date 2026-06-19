//! `#[tauri::command]` handlers — the Rust side of the IPC contract the old Electron
//! `ipcMain.handle/on` channels provided. Registered in `main.rs > generate_handler![]`,
//! called from the frontend via `invoke(...)`.
use crate::model::{Phase, Settings, Stats, Task, TimerState};
use crate::store;
use crate::timer::{broadcast, AppState};
use serde_json::{json, Value};
use std::path::Path;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_notification::NotificationExt;

// ── Timer commands (fire-and-forget) ─────────────────────────────────────────
#[tauri::command]
pub fn start(state: State<AppState>, app: AppHandle) { state.engine.lock().unwrap().start(); broadcast(&app); }
#[tauri::command]
pub fn pause(state: State<AppState>, app: AppHandle) { state.engine.lock().unwrap().pause(); broadcast(&app); }
#[tauri::command]
pub fn reset(state: State<AppState>, app: AppHandle) { state.engine.lock().unwrap().reset(); broadcast(&app); }
#[tauri::command]
pub fn skip(state: State<AppState>, app: AppHandle) { state.engine.lock().unwrap().advance(false); broadcast(&app); }
#[tauri::command]
pub fn focus_now(state: State<AppState>, app: AppHandle) {
    state.engine.lock().unwrap().focus_now();
    broadcast(&app);
}

// ── State / settings / stats ─────────────────────────────────────────────────
#[tauri::command]
pub fn get_state(state: State<AppState>) -> TimerState { state.engine.lock().unwrap().snapshot() }

#[tauri::command]
pub fn update_settings(partial: Value, state: State<AppState>, app: AppHandle) -> TimerState {
    let snap = {
        let mut e = state.engine.lock().unwrap();
        let mut cur = serde_json::to_value(&e.settings).unwrap();
        if let (Some(obj), Some(p)) = (cur.as_object_mut(), partial.as_object()) {
            for (k, v) in p { obj.insert(k.clone(), v.clone()); }
        }
        let merged = serde_json::from_value::<Settings>(cur).unwrap_or_else(|_| e.settings.clone());
        e.apply_settings(merged); // recomputes durations when not running, like applySettings()
        e.snapshot()
    };
    store::save_settings(&app, &snap.settings);
    crate::windows::sync_strict(&app);
    broadcast(&app);
    snap
}

#[tauri::command]
pub fn get_stats(app: AppHandle) -> Stats { store::load_stats(&app) }

// ── Tasks ────────────────────────────────────────────────────────────────────
#[tauri::command]
pub fn tasks_get(app: AppHandle) -> Vec<Task> { store::load_tasks(&app) }

#[tauri::command]
pub fn tasks_add(title: String, tag: String, est: u32, minutes: u32, app: AppHandle) -> Vec<Task> {
    let mut tasks = store::load_tasks(&app);
    let order = tasks.iter().map(|t| t.order).max().map(|m| m + 1).unwrap_or(0);
    tasks.push(Task {
        id: new_id(), title, tag,
        minutes: minutes.max(1), est_pomodoros: est.max(1),
        done_pomodoros: 0, completed: false, order,
    });
    store::save_tasks(&app, &tasks);
    let _ = app.emit("tasks-state", &tasks);
    tasks
}

#[tauri::command]
pub fn tasks_update(id: String, patch: Value, app: AppHandle) -> Vec<Task> {
    let mut tasks = store::load_tasks(&app);
    for t in tasks.iter_mut() {
        if t.id == id {
            let mut v = serde_json::to_value(&*t).unwrap();
            if let (Some(o), Some(p)) = (v.as_object_mut(), patch.as_object()) {
                for (k, val) in p { o.insert(k.clone(), val.clone()); }
            }
            if let Ok(merged) = serde_json::from_value::<Task>(v) { *t = merged; }
        }
    }
    store::save_tasks(&app, &tasks);
    let _ = app.emit("tasks-state", &tasks);
    tasks
}

#[tauri::command]
pub fn tasks_delete(id: String, app: AppHandle) -> Vec<Task> {
    let tasks: Vec<Task> = store::load_tasks(&app).into_iter().filter(|t| t.id != id).collect();
    store::save_tasks(&app, &tasks);
    let _ = app.emit("tasks-state", &tasks);
    tasks
}

#[tauri::command]
pub fn tasks_reorder(ids: Vec<String>, app: AppHandle) -> Vec<Task> {
    let cur = store::load_tasks(&app);
    let mut tasks: Vec<Task> = ids.iter().enumerate().filter_map(|(i, id)| {
        cur.iter().find(|t| &t.id == id).map(|t| { let mut t = t.clone(); t.order = i as i32; t })
    }).collect();
    if tasks.is_empty() { tasks = cur; }
    store::save_tasks(&app, &tasks);
    let _ = app.emit("tasks-state", &tasks);
    tasks
}

#[tauri::command]
pub fn tasks_set_active(id: Option<String>, state: State<AppState>, app: AppHandle) -> TimerState {
    // don't activate a task that no longer exists (matches setActiveTaskId)
    let valid = id.filter(|i| store::load_tasks(&app).iter().any(|t| &t.id == i));
    store::save_active_task(&app, &valid);
    let snap = { let mut e = state.engine.lock().unwrap(); e.active_task_id = valid; e.snapshot() };
    broadcast(&app);
    snap
}

// ── Window control (single-widget rule) ──────────────────────────────────────
#[tauri::command]
pub fn win_show_main(app: AppHandle) { crate::windows::show_main(&app); }
#[tauri::command]
pub fn win_show_mini(app: AppHandle) { crate::windows::show_mini(&app); }
#[tauri::command]
pub fn win_toggle_mini(app: AppHandle) { crate::windows::toggle_mini(&app); }
#[tauri::command]
pub fn win_hide(app: AppHandle) { if let Some(w) = app.get_webview_window("main") { let _ = w.hide(); } }

// ── Audio / music folder ─────────────────────────────────────────────────────
const AUDIO_EXT: [&str; 4] = ["mp3", "m4a", "wav", "ogg"];

fn music_dir(app: &AppHandle) -> String {
    let s = app.state::<AppState>();
    let f = s.engine.lock().unwrap().settings.music_folder.clone();
    f
}

#[tauri::command]
pub fn audio_slots() -> Value { json!({}) } // bundled audio ships in the frontend; no custom slots

#[tauri::command]
pub fn audio_library(app: AppHandle) -> Vec<String> {
    let dir = music_dir(&app);
    if dir.is_empty() { return vec![]; }
    let mut songs: Vec<String> = std::fs::read_dir(&dir).map(|rd| {
        rd.filter_map(|e| e.ok()).filter_map(|e| {
            let p = e.path();
            let ext = p.extension().and_then(|x| x.to_str()).unwrap_or("").to_lowercase();
            if AUDIO_EXT.contains(&ext.as_str()) { p.file_name().map(|n| n.to_string_lossy().to_string()) } else { None }
        }).collect()
    }).unwrap_or_default();
    songs.sort();
    songs
}

#[tauri::command]
pub fn audio_folder_info(app: AppHandle) -> Value {
    let dir = music_dir(&app);
    let is_custom = !dir.is_empty();
    let count = if dir.is_empty() { 0 } else { audio_library(app).len() };
    json!({ "path": dir, "isCustom": is_custom, "count": count })
}

#[tauri::command]
pub fn audio_open_folder(app: AppHandle) {
    let dir = music_dir(&app);
    if !dir.is_empty() {
        use tauri_plugin_opener::OpenerExt;
        let _ = app.opener().open_path(dir, None::<&str>);
    }
}

#[tauri::command]
pub fn audio_set_folder(path: String, state: State<AppState>, app: AppHandle) -> TimerState {
    let folder = if path.is_empty() {
        String::new()
    } else if Path::new(&path).is_dir() {
        path
    } else {
        Path::new(&path).parent().map(|p| p.to_string_lossy().to_string()).unwrap_or_default()
    };
    let snap = { let mut e = state.engine.lock().unwrap(); e.settings.music_folder = folder; e.snapshot() };
    store::save_settings(&app, &snap.settings);
    broadcast(&app);
    snap
}

// ── Focus shield ─────────────────────────────────────────────────────────────
#[tauri::command]
pub fn blocker_snooze(app: AppHandle) {
    crate::focus_guard::snooze(6);
    crate::windows::hide_blocker(&app);
}
#[tauri::command]
pub fn blocker_test() -> Value { crate::focus_guard::test_once() }

// ── Helpers ──────────────────────────────────────────────────────────────────
pub fn notify_phase(app: &AppHandle, next: Phase) {
    let body = match next {
        Phase::Focus => "Break over — back to focus.",
        Phase::Short => "Focus session done. Take a short break.",
        Phase::Long => "Great run! Time for a long break.",
    };
    let _ = app.notification().builder().title("Petomato").body(body).show();
}

fn new_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    format!("t{:x}", SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos())
}
