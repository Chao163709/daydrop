use tauri_plugin_sql::{Migration, MigrationKind};
mod desktop;
mod reminders;
mod backup;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![Migration {
        version: 1,
        description: "initial_schema",
        sql: include_str!("../migrations/001_initial.sql"),
        kind: MigrationKind::Up,
    }, Migration {
        version: 2,
        description: "task_completion_and_recurrence",
        sql: include_str!("../migrations/002_task_history.sql"),
        kind: MigrationKind::Up,
    }];
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| desktop::show_window(app, false)))
        .manage(desktop::HotkeyState::default())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().with_handler(|app, _, event| {
            if event.state() == tauri_plugin_global_shortcut::ShortcutState::Pressed { desktop::show_window(app, false); }
        }).build())
        .plugin(tauri_plugin_sql::Builder::default().add_migrations("sqlite:daydrop.db", migrations).build())
        .invoke_handler(tauri::generate_handler![desktop::hide_to_tray, desktop::quit_application, desktop::configure_hotkey, desktop::test_notification, reminders::sync_reminders, backup::import_backup])
        .setup(|app| { desktop::setup_tray(app)?; reminders::setup(app)?; Ok(()) })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event { api.prevent_close(); let _ = window.hide(); }
        })
        .run(tauri::generate_context!())
        .expect("failed to run Daydrop");
}
