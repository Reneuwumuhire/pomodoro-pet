//! `#[tauri::command]` handlers — the Rust side of the IPC contract that the old
//! Electron `ipcMain.handle/on` channels provided. Each is registered in
//! `main.rs > generate_handler![]` and called from the frontend via `invoke(...)`.
use crate::model::{Phase, Settings, Stats, Task, TimerState};
use crate::store;
use crate::timer::{broadcast, AppState};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_notification::NotificationExt;

// ── Timer commands (fire-and-forget) ─────────────────────────────────────────
#[tauri::command]
pub fn start(state: State<AppState>, app: AppHandle) {
    state.engine.lock().unwrap().start();
    broadcast(&app);
}
#[tauri::command]
pub fn pause(state: State<AppState>, app: AppHandle) {
    state.engine.lock().unwrap().pause();
    broadcast(&app);
}
#[tauri::command]
pub fn reset(state: State<AppState>, app: AppHandle) {
    state.engine.lock().unwrap().reset();
    broadcast(&app);
}
#[tauri::command]
pub fn skip(state: State<AppState>, app: AppHandle) {
    state.engine.lock().unwrap().advance();
    broadcast(&app);
}
#[tauri::command]
pub fn focus_now(state: State<AppState>, app: AppHandle) {
    {
        let mut e = state.engine.lock().unwrap();
        e.phase = Phase::Focus;
        e.reset();
        e.start();
    }
    broadcast(&app);
}

// ── State / settings / stats (return values) ─────────────────────────────────
#[tauri::command]
pub fn get_state(state: State<AppState>) -> TimerState {
    state.engine.lock().unwrap().snapshot()
}

#[tauri::command]
pub fn update_settings(partial: serde_json::Value, state: State<AppState>, app: AppHandle) -> TimerState {
    let snap = {
        let mut e = state.engine.lock().unwrap();
        // merge partial → settings (serde round-trip keeps it simple + type-safe)
        let mut cur = serde_json::to_value(&e.settings).unwrap();
        if let (Some(obj), Some(p)) = (cur.as_object_mut(), partial.as_object()) {
            for (k, v) in p { obj.insert(k.clone(), v.clone()); }
        }
        e.settings = serde_json::from_value::<Settings>(cur).unwrap_or_else(|_| e.settings.clone());
        e.snapshot()
    };
    store::save_settings(&app, &snap.settings);
    broadcast(&app);
    snap
}

#[tauri::command]
pub fn get_stats(app: AppHandle) -> Stats {
    store::load_stats(&app)
}

// ── Tasks ────────────────────────────────────────────────────────────────────
#[tauri::command]
pub fn tasks_get(app: AppHandle) -> Vec<Task> { store::load_tasks(&app) }

#[tauri::command]
pub fn tasks_add(title: String, tag: String, est: u32, minutes: u32, app: AppHandle) -> Vec<Task> {
    let mut tasks = store::load_tasks(&app);
    let order = tasks.iter().map(|t| t.order).max().map(|m| m + 1).unwrap_or(0);
    tasks.push(Task {
        id: format!("t{}", uuid_like()),
        title, tag,
        minutes: minutes.max(1),
        est_pomodoros: est.max(1),
        done_pomodoros: 0, completed: false, order,
    });
    store::save_tasks(&app, &tasks);
    let _ = app.emit_to_all("tasks-state", &tasks);
    tasks
}

#[tauri::command]
pub fn tasks_set_active(id: Option<String>, state: State<AppState>, app: AppHandle) -> TimerState {
    state.engine.lock().unwrap().active_task_id = id;
    broadcast(&app);
    state.engine.lock().unwrap().snapshot()
}
// tasks_update / tasks_delete / tasks_reorder follow the same load → mutate → save →
// emit("tasks-state") pattern (omitted here for brevity).

// ── Window control (single-widget rule) ──────────────────────────────────────
#[tauri::command]
pub fn win_show_main(app: AppHandle) { crate::windows::show_main(&app); }
#[tauri::command]
pub fn win_show_mini(app: AppHandle) { crate::windows::show_mini(&app); }
#[tauri::command]
pub fn win_toggle_mini(app: AppHandle) { crate::windows::toggle_mini(&app); }
#[tauri::command]
pub fn win_hide(app: AppHandle) {
    if let Some(w) = app.get_webview_window("main") { let _ = w.hide(); }
}

// ── Focus shield ─────────────────────────────────────────────────────────────
#[tauri::command]
pub fn blocker_snooze() { crate::focus_guard::snooze(6); }
#[tauri::command]
pub async fn blocker_test(app: AppHandle) -> serde_json::Value {
    crate::focus_guard::test_once(&app).await
}

// ── Helpers ──────────────────────────────────────────────────────────────────
/// Native phase-end notification (replaces Electron `notifications.ts`).
pub fn notify_phase(app: &AppHandle, next: Phase) {
    let body = match next {
        Phase::Focus => "Break over — back to focus.",
        Phase::Short => "Focus session done. Take a short break.",
        Phase::Long => "Great run! Time for a long break.",
    };
    let _ = app.notification().builder().title("Petomato").body(body).show();
}

fn uuid_like() -> String {
    // monotonic-ish id without pulling in a uuid crate
    use std::time::{SystemTime, UNIX_EPOCH};
    let n = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    format!("{:x}", n)
}

// small convenience: broadcast to every window
trait EmitAll {
    fn emit_to_all(&self, event: &str, payload: impl serde::Serialize + Clone) -> tauri::Result<()>;
}
impl EmitAll for AppHandle {
    fn emit_to_all(&self, event: &str, payload: impl serde::Serialize + Clone) -> tauri::Result<()> {
        use tauri::Emitter;
        self.emit(event, payload)
    }
}
