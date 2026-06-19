//! The countdown + focus/break cycle — source of truth, matching the Electron
//! `TimerEngine` exactly (sessionIndex cycle, auto-start, wall-clock tick). Stats
//! accrual / notifications / chime are side effects performed by the tick loop,
//! which holds the `AppHandle`.
use crate::model::{Phase, Settings, Status, TimerState};
use crate::store;
use std::sync::Mutex;
use std::time::Instant;
use tauri::{AppHandle, Emitter, Manager};

pub struct TimerEngine {
    pub phase: Phase,
    pub status: Status,
    pub remaining_ms: u64,
    pub total_ms: u64,
    pub session_index: u32,
    pub completed_today: u32,
    pub settings: Settings,
    pub active_task_id: Option<String>,
    last_tick: Option<Instant>,
}

/// Result of a phase transition, so the caller can run side effects.
pub struct Transition {
    pub finished: Phase,
    pub next: Phase,
    pub completed_focus: bool,
}

impl TimerEngine {
    pub fn new(settings: Settings, completed_today: u32) -> Self {
        let total = dur(&settings, Phase::Focus);
        TimerEngine {
            phase: Phase::Focus, status: Status::Idle,
            remaining_ms: total, total_ms: total,
            session_index: 1, completed_today, settings,
            active_task_id: None, last_tick: None,
        }
    }

    pub fn snapshot(&self) -> TimerState {
        TimerState {
            phase: self.phase, status: self.status,
            remaining_ms: self.remaining_ms, total_ms: self.total_ms,
            session_index: self.session_index, completed_today: self.completed_today,
            settings: self.settings.clone(), active_task_id: self.active_task_id.clone(),
        }
    }

    pub fn start(&mut self) {
        if matches!(self.status, Status::Running) { return; }
        self.status = Status::Running;
        self.last_tick = Some(Instant::now());
    }
    pub fn pause(&mut self) {
        if !matches!(self.status, Status::Running) { return; }
        self.status = Status::Paused;
        self.last_tick = None;
    }
    pub fn toggle(&mut self) {
        if matches!(self.status, Status::Running) { self.pause(); } else { self.start(); }
    }
    pub fn reset(&mut self) {
        self.status = Status::Idle;
        self.last_tick = None;
        self.total_ms = dur(&self.settings, self.phase);
        self.remaining_ms = self.total_ms;
    }
    pub fn focus_now(&mut self) {
        self.phase = Phase::Focus;
        self.total_ms = dur(&self.settings, Phase::Focus);
        self.remaining_ms = self.total_ms;
        self.status = Status::Idle;
        self.start();
    }

    /// Re-apply settings (recompute durations when not running) — like applySettings().
    pub fn apply_settings(&mut self, s: Settings) {
        self.settings = s;
        if !matches!(self.status, Status::Running) {
            self.total_ms = dur(&self.settings, self.phase);
            if matches!(self.status, Status::Idle) {
                self.remaining_ms = self.total_ms;
            } else {
                self.remaining_ms = self.remaining_ms.min(self.total_ms);
            }
        }
    }

    /// Wall-clock decrement; returns a transition when the phase hits zero.
    pub fn tick_clock(&mut self) -> Option<Transition> {
        if !matches!(self.status, Status::Running) { return None; }
        let now = Instant::now();
        let elapsed = self.last_tick.map(|t| now.duration_since(t).as_millis() as u64).unwrap_or(0);
        self.last_tick = Some(now);
        self.remaining_ms = self.remaining_ms.saturating_sub(elapsed);
        if self.remaining_ms == 0 { Some(self.advance(true)) } else { None }
    }

    /// Move to the next phase. `completed` = reached zero (vs a manual skip).
    pub fn advance(&mut self, completed: bool) -> Transition {
        let finished = self.phase;
        let mut completed_focus = false;
        if matches!(finished, Phase::Focus) {
            completed_focus = completed;
            let n = self.settings.long_break_after.max(1);
            self.phase = if self.session_index % n == 0 { Phase::Long } else { Phase::Short };
        } else {
            self.phase = Phase::Focus;
            if matches!(finished, Phase::Long) { self.session_index = 1; } else { self.session_index += 1; }
        }
        self.total_ms = dur(&self.settings, self.phase);
        self.remaining_ms = self.total_ms;

        let auto = completed && match self.phase {
            Phase::Focus => self.settings.auto_start_work,
            _ => self.settings.auto_start_break,
        };
        if auto { self.status = Status::Running; self.last_tick = Some(Instant::now()); }
        else { self.status = Status::Idle; self.last_tick = None; }

        Transition { finished, next: self.phase, completed_focus }
    }
}

fn dur(s: &Settings, phase: Phase) -> u64 {
    let m = match phase { Phase::Focus => s.focus_min, Phase::Short => s.short_min, Phase::Long => s.long_min };
    m as u64 * 60_000
}

/// Shared engine, registered via `app.manage(AppState{..})`.
pub struct AppState {
    pub engine: Mutex<TimerEngine>,
}

pub fn broadcast(app: &AppHandle) {
    let snap = app.state::<AppState>().engine.lock().unwrap().snapshot();
    update_tray_title(app, &snap);
    // Keep the strict-break overlay in sync on EVERY state change (incl. skip),
    // so skipping the break actually closes it.
    crate::windows::sync_strict(app);
    let _ = app.emit("timer-state", snap);
}

/// Live tray title (macOS) / tooltip — the countdown.
pub fn update_tray_title(app: &AppHandle, snap: &TimerState) {
    use tauri::tray::TrayIcon;
    if let Some(tray) = app.tray_by_id("tray") {
        let title = if matches!(snap.status, Status::Idle) {
            String::new()
        } else {
            let s = snap.remaining_ms / 1000;
            format!(" {:02}:{:02}", s / 60, s % 60)
        };
        let _: &TrayIcon = &tray;
        let _ = tray.set_title(Some(&title));
        let _ = tray.set_tooltip(Some(if title.is_empty() { "Petomato" } else { title.trim() }));
    }
}

/// 1-second-ish tick loop (250 ms for smoothness) — spawn once from setup().
pub fn spawn_tick_loop(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut iv = tokio::time::interval(std::time::Duration::from_millis(250));
        loop {
            iv.tick().await;
            let (transition, running) = {
                let st = app.state::<AppState>();
                let mut e = st.engine.lock().unwrap();
                let running = matches!(e.status, Status::Running);
                (e.tick_clock(), running)
            };
            if let Some(t) = transition {
                handle_completion(&app, &t);
            }
            // Broadcast each loop while running (keeps remaining_ms live); the
            // pre-tick `running` is true on the loop that transitions to idle too.
            if running {
                broadcast(&app);
            }
            crate::focus_guard::maybe_sync(&app);
        }
    });
}

/// Side effects when a phase completes: stats, task credit, notification, chime.
fn handle_completion(app: &AppHandle, t: &crate::timer::Transition) {
    let (focus_min, goal, tag, active, muted, mute_focus) = {
        let st = app.state::<AppState>();
        let e = st.engine.lock().unwrap();
        (
            e.settings.focus_min, e.settings.session_goal,
            store::active_task_tag(app, &e.active_task_id),
            e.active_task_id.clone(), e.settings.muted, e.settings.mute_notifications_during_focus,
        )
    };
    if t.completed_focus {
        let count = store::record_completed_focus(app, focus_min, tag, goal);
        store::credit_active_task(app, &active);
        app.state::<AppState>().engine.lock().unwrap().completed_today = count;
    }
    // notification (suppressed during focus if asked), + chime
    if !(mute_focus && matches!(t.next, Phase::Focus)) {
        crate::commands::notify_phase(app, t.next);
    }
    if !muted {
        let _ = app.emit("chime", serde_json::json!({ "volume": 0.7 }));
    }
    crate::windows::sync_strict(app);
}
