//! Persistence (replaces `electron-store`). Uses `tauri-plugin-store`, which writes a
//! JSON file under the OS app-data dir. Typed getters/setters mirror `store.ts`.
use crate::model::{Settings, Stats, Task};
use tauri::{AppHandle, Wry};
use tauri_plugin_store::StoreExt;

const FILE: &str = "petomato.json";

fn get<T: serde::de::DeserializeOwned>(app: &AppHandle, key: &str) -> Option<T> {
    let store = app.store(FILE).ok()?;
    let v = store.get(key)?;
    serde_json::from_value(v).ok()
}

fn set<T: serde::Serialize>(app: &AppHandle, key: &str, value: &T) {
    if let Ok(store) = app.store(FILE) {
        if let Ok(v) = serde_json::to_value(value) {
            store.set(key, v);
            let _ = store.save();
        }
    }
}

pub fn load_settings(app: &AppHandle<Wry>) -> Settings { get(app, "settings").unwrap_or_default() }
pub fn save_settings(app: &AppHandle, s: &Settings) { set(app, "settings", s); }

pub fn load_tasks(app: &AppHandle) -> Vec<Task> { get(app, "tasks").unwrap_or_default() }
pub fn save_tasks(app: &AppHandle, t: &[Task]) { set(app, "tasks", &t.to_vec()); }

pub fn load_stats(app: &AppHandle) -> Stats { get(app, "stats").unwrap_or_default() }
pub fn save_stats(app: &AppHandle, s: &Stats) { set(app, "stats", s); }
