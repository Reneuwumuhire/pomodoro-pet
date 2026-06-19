//! Persistence (replaces `electron-store` + `store.ts`). JSON via tauri-plugin-store,
//! with the same stats-accrual / task-credit logic as the Electron build.
use crate::model::{Settings, Stats, Task};
use chrono::{Duration, Local};
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

const FILE: &str = "petomato.json";

fn get<T: serde::de::DeserializeOwned>(app: &AppHandle, key: &str) -> Option<T> {
    let store = app.store(FILE).ok()?;
    serde_json::from_value(store.get(key)?).ok()
}
fn set<T: serde::Serialize>(app: &AppHandle, key: &str, value: &T) {
    if let Ok(store) = app.store(FILE) {
        if let Ok(v) = serde_json::to_value(value) {
            store.set(key, v);
            let _ = store.save();
        }
    }
}

// ── settings ─────────────────────────────────────────────────────────────────
pub fn load_settings(app: &AppHandle) -> Settings { get(app, "settings").unwrap_or_default() }
pub fn save_settings(app: &AppHandle, s: &Settings) { set(app, "settings", s); }

// ── dates ────────────────────────────────────────────────────────────────────
fn today_key() -> String { Local::now().format("%Y-%m-%d").to_string() }
fn yesterday_key() -> String { (Local::now() - Duration::days(1)).format("%Y-%m-%d").to_string() }

// ── stats ────────────────────────────────────────────────────────────────────
pub fn load_stats(app: &AppHandle) -> Stats { get(app, "stats").unwrap_or_default() }
pub fn completed_today(app: &AppHandle) -> u32 {
    *load_stats(app).history.get(&today_key()).unwrap_or(&0)
}

/// Record one completed focus session (length + tag); returns today's new count.
pub fn record_completed_focus(app: &AppHandle, focus_min: u32, tag: Option<String>, goal: u32) -> u32 {
    let mut stats = load_stats(app);
    let today = today_key();
    let counted = *stats.history.get(&today).unwrap_or(&0);
    let new_count = counted + 1;

    stats.history.insert(today.clone(), new_count);
    *stats.minutes.entry(today).or_insert(0) += focus_min;
    if let Some(t) = tag { *stats.by_tag.entry(t).or_insert(0) += 1; }
    stats.total_focus += 1;

    // Streak bumps only when crossing the daily goal for the first time today.
    if new_count == goal {
        let hit_yesterday = *stats.history.get(&yesterday_key()).unwrap_or(&0) >= goal;
        stats.streak = if hit_yesterday { stats.streak + 1 } else { 1 };
    }
    set(app, "stats", &stats);
    new_count
}

// ── tasks ────────────────────────────────────────────────────────────────────
pub fn load_tasks(app: &AppHandle) -> Vec<Task> {
    let mut t: Vec<Task> = get(app, "tasks").unwrap_or_default();
    t.sort_by_key(|x| x.order);
    t
}
pub fn save_tasks(app: &AppHandle, t: &[Task]) { set(app, "tasks", &t.to_vec()); }

pub fn load_active_task(app: &AppHandle) -> Option<String> { get(app, "activeTaskId").flatten() }
pub fn save_active_task(app: &AppHandle, id: &Option<String>) { set(app, "activeTaskId", id); }

pub fn active_task_tag(app: &AppHandle, active_id: &Option<String>) -> Option<String> {
    let id = active_id.as_ref()?;
    load_tasks(app).into_iter().find(|t| &t.id == id).map(|t| t.tag)
}

/// Credit a finished pomodoro to the active task (donePomodoros += 1).
pub fn credit_active_task(app: &AppHandle, active_id: &Option<String>) {
    let Some(id) = active_id else { return };
    let mut tasks = load_tasks(app);
    for t in tasks.iter_mut() {
        if &t.id == id { t.done_pomodoros += 1; }
    }
    save_tasks(app, &tasks);
}
