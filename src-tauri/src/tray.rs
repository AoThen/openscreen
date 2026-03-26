//! 系统托盘模块

use tauri::{
    AppHandle, Manager, Emitter,
    tray::{TrayIcon, TrayIconBuilder},
    menu::{Menu, MenuItem},
    image::Image,
};

/// 托盘状态
pub struct TrayState {
    pub is_recording: bool,
    pub source_name: String,
}

impl Default for TrayState {
    fn default() -> Self {
        Self {
            is_recording: false,
            source_name: String::new(),
        }
    }
}

/// 创建系统托盘
pub fn create_tray(app: &AppHandle) -> Result<TrayIcon, String> {
    // 创建菜单项
    let open_item = MenuItem::with_id(app, "open", "Open", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    let _stop_recording_item = MenuItem::with_id(app, "stop_recording", "Stop Recording", true, None::<&str>)
        .map_err(|e| e.to_string())?;

    // 构建菜单
    let menu = Menu::with_items(app, &[&open_item, &quit_item])
        .map_err(|e| e.to_string())?;

    // 创建托盘图标
    let tray = TrayIconBuilder::new()
        .icon(get_default_icon()?)
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| {
            match event.id.as_ref() {
                "open" => {
                    // 显示 HUD 窗口
                    if let Some(window) = app.get_webview_window("hud-overlay") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                "quit" => {
                    app.exit(0);
                }
                "stop_recording" => {
                    // 发送停止录制事件
                    let _ = app.emit("stop-recording-from-tray", ());
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            // 双击显示窗口
            if let tauri::tray::TrayIconEvent::Click {
                button: tauri::tray::MouseButton::Left,
                button_state: tauri::tray::MouseButtonState::Up,
                ..
            } = event {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("hud-overlay") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)
        .map_err(|e| e.to_string())?;

    Ok(tray)
}

/// 获取默认托盘图标
fn get_default_icon() -> Result<Image<'static>, String> {
    // 尝试加载图标文件
    let icon_bytes = include_bytes!("../icons/icon.png");
    
    // 使用 image crate 解码 PNG
    let img = image::load_from_memory(icon_bytes)
        .map_err(|e| format!("Failed to load icon: {}", e))?;
    
    let rgba = img.to_rgba8();
    let (width, height) = rgba.dimensions();
    
    Ok(Image::new_owned(rgba.into_raw(), width, height))
}

/// 更新托盘状态（录制中/空闲）
pub fn update_tray_state(
    app: &AppHandle,
    is_recording: bool,
    source_name: &str,
) -> Result<(), String> {
    // 获取托盘 - Tauri v2 使用 id "main" 作为默认托盘 ID
    let tray = app.tray_by_id("main").ok_or("Tray not found")?;

    // 更新提示文本
    let tooltip = if is_recording {
        format!("Recording: {}", source_name)
    } else {
        "OpenScreen".to_string()
    };
    tray.set_tooltip(Some(&tooltip)).map_err(|e| e.to_string())?;

    // 更新菜单
    let open_item = MenuItem::with_id(app, "open", "Open", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    let stop_recording_item = MenuItem::with_id(app, "stop_recording", "Stop Recording", true, None::<&str>)
        .map_err(|e| e.to_string())?;

    let menu = if is_recording {
        Menu::with_items(app, &[&stop_recording_item])
            .map_err(|e| e.to_string())?
    } else {
        Menu::with_items(app, &[&open_item, &quit_item])
            .map_err(|e| e.to_string())?
    };

    tray.set_menu(Some(menu)).map_err(|e| e.to_string())?;

    Ok(())
}
