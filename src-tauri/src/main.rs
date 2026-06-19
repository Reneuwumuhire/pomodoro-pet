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
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager,
};
use timer::{spawn_tick_loop, AppState, TimerEngine};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .setup(|app| {
            // load persisted settings, seed the engine, register shared state
            let settings = store::load_settings(app.handle());
            app.manage(AppState { engine: Mutex::new(TimerEngine::new(settings)) });

            // menu-bar tray with the live countdown as its title (macOS) / tooltip (Windows)
            let show = MenuItem::with_id(app, "show", "Open Petomato", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;
            let _tray = TrayIconBuilder::with_id("tray")
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, e| match e.id.as_ref() {
                    "quit" => app.exit(0),
                    "show" => windows::show_main(app),
                    _ => {}
                })
                .on_tray_icon_event(|tray, _event| windows::toggle_main(tray.app_handle()))
                .build(app)?;

            // NOTE: temporarily Regular (Dock icon, activates on launch) for testing so the
            // window reliably comes to the front. Restore Accessory for the menu-bar popover.
            // #[cfg(target_os = "macos")]
            // app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            // Popover behaviour: float over other apps incl. fullscreen Spaces, like the
            // Electron build's menu-bar popover.
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.center();
                let _ = w.show();
                let _ = w.set_focus();
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
            commands::audio_slots,
            commands::audio_library,
            commands::audio_folder_info,
            commands::audio_open_folder,
            commands::audio_set_folder,
            commands::blocker_snooze,
            commands::blocker_test,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Petomato");
}
