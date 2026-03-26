//! 托盘管理命令

use crate::tray::update_tray_state;
use tauri::AppHandle;

/// 更新托盘状态
#[tauri::command]
pub fn update_tray(
    app: AppHandle,
    is_recording: bool,
    source_name: String,
) -> Result<(), String> {
    update_tray_state(&app, is_recording, &source_name)
}
