//! 窗口管理命令

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use std::sync::Mutex;

/// 窗口标签常量
pub const WINDOW_HUD: &str = "hud-overlay";
pub const WINDOW_EDITOR: &str = "editor";
pub const WINDOW_SOURCE_SELECTOR: &str = "source-selector";

/// 窗口状态
pub struct WindowState {
    pub editor_has_unsaved_changes: bool,
    pub is_force_closing: bool,
}

impl Default for WindowState {
    fn default() -> Self {
        Self {
            editor_has_unsaved_changes: false,
            is_force_closing: false,
        }
    }
}

/// 全局窗口状态
pub struct GlobalWindowState(pub Mutex<WindowState>);

impl Default for GlobalWindowState {
    fn default() -> Self {
        Self(Mutex::new(WindowState::default()))
    }
}

/// 获取开发服务器 URL 或前端构建路径
fn get_window_url(window_type: &str) -> WebviewUrl {
    // 在开发模式下使用 Vite 开发服务器
    #[cfg(debug_assertions)]
    {
        WebviewUrl::External(format!("http://localhost:5173?windowType={}", window_type).parse().unwrap())
    }
    // 在生产模式下使用构建的前端文件
    #[cfg(not(debug_assertions))]
    {
        WebviewUrl::App(format!("index.html?windowType={}", window_type).into())
    }
}

/// 创建 HUD Overlay 窗口 (macOS 悬浮控制栏)
pub fn create_hud_overlay_window(app: &AppHandle) -> Result<tauri::WebviewWindow, String> {
    // 如果窗口已存在，显示并聚焦
    if let Some(window) = app.get_webview_window(WINDOW_HUD) {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(window);
    }

    // 窗口尺寸
    let window_width = 500.0;
    let window_height = 155.0;

    // 获取主显示器工作区域（简化实现，使用默认值）
    // TODO: 使用 tauri-plugin-positioner 或 monitor API 获取实际工作区域
    let work_area_width = 1920.0;
    let work_area_height = 1080.0;

    let x = (work_area_width - window_width) / 2.0;
    let y = work_area_height - window_height - 10.0;

    let window = WebviewWindowBuilder::new(app, WINDOW_HUD, get_window_url("hud-overlay"))
        .title("OpenScreen HUD")
        .inner_size(window_width, window_height)
        .min_inner_size(window_width, window_height)
        .max_inner_size(window_width, window_height)
        .position(x, y)
        .decorations(false)
        .transparent(true)
        .resizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(true)
        .build()
        .map_err(|e| e.to_string())?;

    Ok(window)
}

/// 创建编辑器主窗口
pub fn create_editor_window(app: &AppHandle) -> Result<tauri::WebviewWindow, String> {
    // 如果窗口已存在，显示并聚焦
    if let Some(window) = app.get_webview_window(WINDOW_EDITOR) {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(window);
    }

    #[cfg(target_os = "macos")]
    let builder = WebviewWindowBuilder::new(app, WINDOW_EDITOR, get_window_url("editor"))
        .title("OpenScreen")
        .inner_size(1200.0, 800.0)
        .min_inner_size(800.0, 600.0)
        .decorations(true)
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .traffic_light_position(tauri::Position::Logical(tauri::LogicalPosition { x: 12.0, y: 12.0 }))
        .transparent(false)
        .resizable(true)
        .always_on_top(false)
        .skip_taskbar(false)
        .visible(true);

    #[cfg(not(target_os = "macos"))]
    let builder = WebviewWindowBuilder::new(app, WINDOW_EDITOR, get_window_url("editor"))
        .title("OpenScreen")
        .inner_size(1200.0, 800.0)
        .min_inner_size(800.0, 600.0)
        .decorations(true)
        .transparent(false)
        .resizable(true)
        .always_on_top(false)
        .skip_taskbar(false)
        .visible(true);

    let window = builder.build().map_err(|e| e.to_string())?;

    // 最大化窗口
    window.maximize().map_err(|e| e.to_string())?;

    Ok(window)
}

/// 创建源选择窗口
pub fn create_source_selector_window(app: &AppHandle) -> Result<tauri::WebviewWindow, String> {
    // 如果窗口已存在，显示并聚焦
    if let Some(window) = app.get_webview_window(WINDOW_SOURCE_SELECTOR) {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(window);
    }

    let window_width = 620.0;
    let window_height = 420.0;

    // 居中显示
    let work_area_width = 1920.0;
    let work_area_height = 1080.0;
    let x = (work_area_width - window_width) / 2.0;
    let y = (work_area_height - window_height) / 2.0;

    let window = WebviewWindowBuilder::new(app, WINDOW_SOURCE_SELECTOR, get_window_url("source-selector"))
        .title("Select Source")
        .inner_size(window_width, window_height)
        .min_inner_size(window_width, 350.0)
        .max_inner_size(window_width, 500.0)
        .position(x, y)
        .decorations(false)
        .transparent(true)
        .resizable(false)
        .always_on_top(true)
        .skip_taskbar(false)
        .visible(true)
        .build()
        .map_err(|e| e.to_string())?;

    Ok(window)
}

/// 切换到编辑器窗口
#[tauri::command]
pub async fn switch_to_editor(app: AppHandle) -> Result<(), String> {
    // 关闭 HUD 窗口（如果存在）
    if let Some(hud_window) = app.get_webview_window(WINDOW_HUD) {
        hud_window.close().map_err(|e| e.to_string())?;
    }

    // 创建或显示编辑器窗口
    create_editor_window(&app)?;

    Ok(())
}

/// 打开源选择窗口
#[tauri::command]
pub async fn open_source_selector(app: AppHandle) -> Result<(), String> {
    create_source_selector_window(&app)?;
    Ok(())
}

/// HUD 浮层隐藏
#[tauri::command]
pub fn hud_overlay_hide(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(WINDOW_HUD) {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// HUD 浮层关闭（退出应用）
#[tauri::command]
pub fn hud_overlay_close(app: AppHandle) -> Result<(), String> {
    app.exit(0);
    Ok(())
}

/// 显示 HUD 窗口
#[tauri::command]
pub fn show_hud_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(WINDOW_HUD) {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
    } else {
        create_hud_overlay_window(&app)?;
    }
    Ok(())
}

/// 关闭源选择窗口
#[tauri::command]
pub fn close_source_selector(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(WINDOW_SOURCE_SELECTOR) {
        window.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 设置编辑器未保存状态
#[tauri::command]
pub fn set_has_unsaved_changes(app: AppHandle, has_changes: bool) -> Result<(), String> {
    let state = app.state::<GlobalWindowState>();
    if let Ok(mut window_state) = state.0.lock() {
        window_state.editor_has_unsaved_changes = has_changes;
    }
    Ok(())
}

/// 获取当前平台
#[tauri::command]
pub fn get_platform() -> String {
    #[cfg(target_os = "macos")]
    {
        "darwin".to_string()
    }
    #[cfg(target_os = "windows")]
    {
        "win32".to_string()
    }
    #[cfg(target_os = "linux")]
    {
        "linux".to_string()
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        "unknown".to_string()
    }
}

/// 保存完成确认，用于窗口关闭流程
/// 当前端完成保存操作后调用此命令，通知后端可以关闭窗口
#[tauri::command]
pub fn save_before_close_done(app: AppHandle, should_close: bool) -> Result<(), String> {
    let state = app.state::<GlobalWindowState>();
    
    if should_close {
        // 设置强制关闭标志
        if let Ok(mut window_state) = state.0.lock() {
            window_state.is_force_closing = true;
        }
        
        // 关闭编辑器窗口
        if let Some(window) = app.get_webview_window(WINDOW_EDITOR) {
            window.close().map_err(|e| e.to_string())?;
        }
    }
    
    Ok(())
}
