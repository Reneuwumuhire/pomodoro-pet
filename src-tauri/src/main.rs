// Hide the extra console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod focus_guard;
mod model;
mod store;
mod timer;
mod windows;

use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use timer::{broadcast, spawn_tick_loop, AppState, TimerEngine};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            // load persisted state, seed the engine, register shared state
            let h = app.handle();
            let settings = store::load_settings(h);
            let mut engine = TimerEngine::new(settings, store::completed_today(h));
            engine.active_task_id = store::load_active_task(h);
            app.manage(AppState { engine: Mutex::new(engine) });

            // menu-bar tray: live countdown title + context menu mirroring the Electron app
            let toggle = MenuItem::with_id(app, "toggle", "Start / Pause", true, None::<&str>)?;
            let reset = MenuItem::with_id(app, "reset", "Reset", true, None::<&str>)?;
            let skip = MenuItem::with_id(app, "skip", "Skip", true, None::<&str>)?;
            let open = MenuItem::with_id(app, "show", "Open Petomato", true, None::<&str>)?;
            let mini = MenuItem::with_id(app, "mini", "Toggle Mini Widget", true, Some("Cmd+Shift+M"))?;
            let about = MenuItem::with_id(app, "about", "About Petomato", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let sep1 = PredefinedMenuItem::separator(app)?;
            let sep2 = PredefinedMenuItem::separator(app)?;
            let menu = Menu::with_items(app, &[&toggle, &reset, &skip, &sep1, &open, &mini, &about, &sep2, &quit])?;
            // Proper monochrome menu-bar template icon (not the colored app icon,
            // which renders as a black blob when used as a template).
            let tray_icon = tauri::image::Image::from_bytes(include_bytes!("../icons/trayTemplate.png"))?;
            let _tray = TrayIconBuilder::with_id("tray")
                .icon(tray_icon)
                .icon_as_template(true)
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, e| match e.id.as_ref() {
                    "toggle" => { app.state::<AppState>().engine.lock().unwrap().toggle(); broadcast(app); }
                    "reset" => { app.state::<AppState>().engine.lock().unwrap().reset(); broadcast(app); }
                    "skip" => { app.state::<AppState>().engine.lock().unwrap().advance(false); broadcast(app); }
                    "show" => windows::show_main(app),
                    "mini" => windows::toggle_mini(app),
                    "about" => windows::show_about(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        windows::toggle_main(tray.app_handle()); // opens top-right
                    }
                })
                .build(app)?;

            // Global shortcut ⌘⇧M → toggle the mini widget (matches the Electron build).
            let mini_sc = Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyM);
            app.global_shortcut().on_shortcut(mini_sc, |app, _sc, ev| {
                if ev.state() == ShortcutState::Pressed { windows::toggle_mini(app); }
            })?;

            // Menu-bar popover: no Dock icon, floats over all Spaces, hides on blur.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.set_visible_on_all_workspaces(true);
                let _ = w.show();
                windows::place_top_right(app.handle(), &w); // open top-right every time
                let _ = w.set_focus();
                let wc = w.clone();
                w.on_window_event(move |ev| {
                    if let tauri::WindowEvent::Focused(false) = ev {
                        // Hide-on-blur only for a genuine click-away — never when our
                        // own fullscreen overlay (strict break / blocker) stole focus,
                        // or the popover would vanish for good once the overlay closes.
                        if !windows::is_pinned() && !windows::overlay_active(wc.app_handle()) {
                            let _ = wc.hide();
                        }
                    }
                });
            }

            spawn_tick_loop(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::start,
            commands::pause,
            commands::reset,
            commands::skip,
            commands::focus_now,
            commands::get_state,
            commands::update_settings,
            commands::get_stats,
            commands::tasks_get,
            commands::tasks_add,
            commands::tasks_update,
            commands::tasks_delete,
            commands::tasks_reorder,
            commands::tasks_set_active,
            commands::win_show_main,
            commands::win_show_mini,
            commands::win_toggle_mini,
            commands::win_hide,
            commands::win_set_pinned,
            commands::audio_slots,
            commands::audio_library,
            commands::audio_folder_info,
            commands::audio_open_folder,
            commands::audio_set_folder,
            commands::blocker_snooze,
            commands::blocker_test,
            commands::app_meta,
            commands::open_external,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Petomato")
        .run(|_app, event| {
            // Menu-bar app: hiding the last window must not quit the process. Tauri
            // would otherwise exit when no windows remain. A window-close ExitRequest
            // carries `code: None`; an explicit `app.exit(n)` (tray "Quit") carries
            // `Some(n)` — only block the former so Quit still works.
            if let tauri::RunEvent::ExitRequested { code, api, .. } = event {
                if code.is_none() {
                    api.prevent_exit();
                }
            }
        });
}
