use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri_plugin_global_shortcut::GlobalShortcutExt;
use tauri_plugin_notification::NotificationExt;

#[derive(Default)]
pub struct HotkeyState(pub Mutex<Option<String>>);

pub fn show_window(app: &AppHandle, today: bool) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        let _ = app.emit("daydrop-open", serde_json::json!({ "tab": if today { Some("today") } else { None } }));
    }
}

#[tauri::command]
pub fn hide_to_tray(app: AppHandle) -> Result<(), String> {
    app.get_webview_window("main").ok_or("主窗口不存在")?.hide().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn quit_application(app: AppHandle) { app.exit(0); }

#[tauri::command]
pub fn test_notification(app: AppHandle) -> Result<(), String> {
    app.notification().builder().title("日点 · 提醒已就绪")
        .body("任务和日程到达提醒时间时，会在这里通知你。")
        .show().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn configure_hotkey(app: AppHandle, state: State<'_, HotkeyState>, hotkey: String) -> Result<(), String> {
    let mut current = state.0.lock().map_err(|e| e.to_string())?;
    if current.as_deref() == Some(hotkey.as_str()) { return Ok(()); }
    // Register the replacement first: a conflict must leave the working key intact.
    app.global_shortcut().register(hotkey.as_str())
        .map_err(|e| format!("快捷键 {} 无法注册，可能已被占用：{}", hotkey, e))?;
    if let Some(previous) = current.as_deref() {
        if let Err(error) = app.global_shortcut().unregister(previous) {
            let _ = app.global_shortcut().unregister(hotkey.as_str());
            return Err(format!("旧快捷键无法释放：{}", error));
        }
    }
    *current = Some(hotkey);
    Ok(())
}

pub fn setup_tray(app: &mut tauri::App) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "显示浮窗", true, None::<&str>)?;
    let hide = MenuItem::with_id(app, "hide", "隐藏到托盘", true, None::<&str>)?;
    let today = MenuItem::with_id(app, "today", "今日任务", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "退出日点", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &hide, &today, &separator, &quit])?;
    let mut tray = TrayIconBuilder::with_id("daydrop-tray").menu(&menu)
        .tooltip("日点 · 待办与日历").show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_window(app, false),
            "today" => show_window(app, true),
            "hide" => { if let Some(window) = app.get_webview_window("main") { let _ = window.hide(); } },
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if matches!(event, TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. }) {
                show_window(tray.app_handle(), false);
            }
        });
    if let Some(icon) = app.default_window_icon() { tray = tray.icon(icon.clone()); }
    tray.build(app)?;
    Ok(())
}
