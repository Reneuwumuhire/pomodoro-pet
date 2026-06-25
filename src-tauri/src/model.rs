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
// `default` so a newer build that adds a field still loads an older saved file —
// missing fields fall back to Default instead of failing the parse (which would
// reset ALL settings). Keeps user data across updates.
#[serde(rename_all = "camelCase", default)]
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

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
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
#[serde(rename_all = "camelCase", default)]
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

#[cfg(test)]
mod tests {
    use super::*;

    /// Simulates installing a build that added fields (`ambient`, `musicFolder`) over
    /// a settings file saved by an older version that lacked them: existing values must
    /// survive, the new fields fall back to defaults — never a full reset.
    #[test]
    fn old_settings_file_survives_added_fields() {
        let old = r#"{
            "focusMin": 42, "shortMin": 5, "longMin": 15, "longBreakAfter": 4,
            "sessionGoal": 7, "pet": "fox", "theme": "amber", "volume": 0.3,
            "muted": true, "autoStartBreak": false, "autoStartWork": true,
            "strictMode": true, "muteNotificationsDuringFocus": true,
            "focusMusic": "lofi2", "breakMusic": "lofi4", "musicVolume": 0.9,
            "ambientVolume": 0.1, "blockList": ["x.com"]
        }"#;
        let s: Settings = serde_json::from_str(old).expect("old file must still parse");
        // preserved
        assert_eq!(s.focus_min, 42);
        assert_eq!(s.session_goal, 7);
        assert_eq!(s.theme, "amber");
        assert!(s.muted);
        assert_eq!(s.block_list, vec!["x.com".to_string()]);
        // fields absent from the old file → defaults, not a wipe
        assert_eq!(s.ambient, "none");
        assert_eq!(s.music_folder, "");
    }

    /// A task saved before a field existed still loads, keeping its data.
    #[test]
    fn old_task_survives_added_fields() {
        let old = r#"{ "id": "t1", "title": "Write", "tag": "work", "minutes": 25,
            "estPomodoros": 3, "donePomodoros": 1 }"#;
        let t: Task = serde_json::from_str(old).expect("old task must still parse");
        assert_eq!(t.title, "Write");
        assert_eq!(t.done_pomodoros, 1);
        assert!(!t.completed); // missing → default
        assert_eq!(t.order, 0); // missing → default
    }
}
