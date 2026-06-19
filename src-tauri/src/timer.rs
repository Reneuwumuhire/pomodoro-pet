//! The countdown + focus/break cycle — the source of truth, exactly like the Electron
//! `TimerEngine`. It lives behind a `Mutex` in Tauri-managed state; a 1 Hz `tokio` task
//! ticks it and emits `timer-state` to every window.
use crate::model::{Phase, Settings, Status, TimerState};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

pub struct TimerEngine {
    pub phase: Phase,
    pub status: Status,
    pub remaining_ms: u64,
    pub session_index: u32,
    pub completed_today: u32,
    pub settings: Settings,
    pub active_task_id: Option<String>,
}

impl TimerEngine {
    pub fn new(settings: Settings) -> Self {
        let remaining_ms = settings.focus_min as u64 * 60_000;
        TimerEngine {
            phase: Phase::Focus,
            status: Status::Idle,
            remaining_ms,
            session_index: 1,
            completed_today: 0,
            settings,
            active_task_id: None,
        }
    }

    fn phase_total_ms(&self) -> u64 {
        let m = match self.phase {
            Phase::Focus => self.settings.focus_min,
            Phase::Short => self.settings.short_min,
            Phase::Long => self.settings.long_min,
        };
        m as u64 * 60_000
    }

    pub fn snapshot(&self) -> TimerState {
        TimerState {
            phase: self.phase,
            status: self.status,
            remaining_ms: self.remaining_ms,
            total_ms: self.phase_total_ms(),
            session_index: self.session_index,
            completed_today: self.completed_today,
            settings: self.settings.clone(),
            active_task_id: self.active_task_id.clone(),
        }
    }

    pub fn start(&mut self) { self.status = Status::Running; }
    pub fn pause(&mut self) { self.status = Status::Paused; }

    pub fn reset(&mut self) {
        self.status = Status::Idle;
        self.remaining_ms = self.phase_total_ms();
    }

    /// Advance one phase (called on hit-zero or on `skip`). Returns the phase that just
    /// finished and the next phase, so the caller can fire notifications/chimes.
    pub fn advance(&mut self) -> (Phase, Phase) {
        let finished = self.phase;
        if matches!(finished, Phase::Focus) {
            self.completed_today += 1;
            self.session_index += 1;
            self.phase = if self.completed_today % self.settings.long_break_after == 0 {
                Phase::Long
            } else {
                Phase::Short
            };
        } else {
            self.phase = Phase::Focus;
        }
        self.remaining_ms = self.phase_total_ms();
        let auto = match self.phase {
            Phase::Focus => self.settings.auto_start_work,
            _ => self.settings.auto_start_break,
        };
        self.status = if auto { Status::Running } else { Status::Idle };
        (finished, self.phase)
    }
}

/// Holds the shared engine. Registered via `app.manage(AppState::new(...))`.
pub struct AppState {
    pub engine: Mutex<TimerEngine>,
}

/// Push the current snapshot to every window (≈ Electron's `broadcast('timer:state')`).
pub fn broadcast(app: &AppHandle) {
    let state = app.state::<AppState>();
    let snap = state.engine.lock().unwrap().snapshot();
    let _ = app.emit("timer-state", snap);
}

/// The 1 Hz tick loop — spawn once from `setup()`.
pub fn spawn_tick_loop(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut iv = tokio::time::interval(std::time::Duration::from_secs(1));
        loop {
            iv.tick().await;
            let mut transition: Option<(Phase, Phase)> = None;
            {
                let state = app.state::<AppState>();
                let mut eng = state.engine.lock().unwrap();
                if matches!(eng.status, Status::Running) {
                    if eng.remaining_ms > 1000 {
                        eng.remaining_ms -= 1000;
                    } else {
                        eng.remaining_ms = 0;
                        transition = Some(eng.advance());
                    }
                }
            }
            if let Some((_finished, next)) = transition {
                let muted = {
                    let s = app.state::<AppState>();
                    let e = s.engine.lock().unwrap();
                    (e.settings.muted, e.settings.mute_notifications_during_focus)
                };
                if !(muted.1 && matches!(next, Phase::Focus)) {
                    crate::commands::notify_phase(&app, next);
                }
                if !muted.0 {
                    let _ = app.emit("chime", serde_json::json!({ "volume": 0.7 }));
                }
            }
            broadcast(&app);
            crate::focus_guard::maybe_sync(&app);
        }
    });
}
