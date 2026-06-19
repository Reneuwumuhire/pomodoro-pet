//! Serde mirror of `src/shared/types.ts`. `rename_all = "camelCase"` keeps the JSON
//! shape identical to what the existing React UI already consumes — so no component
//! changes are needed.
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Phase {
    Focus,
    Short,
    Long,
}

#[derive(Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Status {
    Idle,
    Running,
    Paused,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub focus_min: u32,
    pub short_min: u32,
    pub long_min: u32,
    pub long_break_after: u32,
    pub session_goal: u32,
    pub pet: String,
    pub theme: String,
    pub volume: f32,
    pub muted: bool,
    pub auto_start_break: bool,
    pub auto_start_work: bool,
    pub strict_mode: bool,
    pub mute_notifications_during_focus: bool,
    pub focus_music: String,
    pub break_music: String,
    pub music_volume: f32,
    pub ambient: String,
    pub ambient_volume: f32,
    pub block_list: Vec<String>,
    pub music_folder: String,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            focus_min: 25, short_min: 5, long_min: 15, long_break_after: 4, session_goal: 4,
            pet: "cat".into(), theme: "lcd".into(), volume: 0.7, muted: false,
            auto_start_break: true, auto_start_work: false, strict_mode: false,
            mute_notifications_during_focus: false,
            focus_music: "lofi1".into(), break_music: "lofi3".into(), music_volume: 0.5,
            ambient: "none".into(), ambient_volume: 0.5, block_list: vec![], music_folder: String::new(),
        }
    }
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub title: String,
    pub tag: String,
    pub minutes: u32,
    pub est_pomodoros: u32,
    pub done_pomodoros: u32,
    pub completed: bool,
    pub order: i32,
}

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Stats {
    pub history: std::collections::HashMap<String, u32>,
    pub minutes: std::collections::HashMap<String, u32>,
    pub by_tag: std::collections::HashMap<String, u32>,
    pub streak: u32,
    pub total_focus: u32,
}

/// The live snapshot broadcast to every window on each tick (= the TS `TimerState`).
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimerState {
    pub phase: Phase,
    pub status: Status,
    pub remaining_ms: u64,
    pub total_ms: u64,
    pub session_index: u32,
    pub completed_today: u32,
    pub settings: Settings,
    pub active_task_id: Option<String>,
}
