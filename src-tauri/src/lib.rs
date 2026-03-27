// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod cursor;
mod menu;
mod tray;

use commands::filesystem::ProjectState;
use commands::recording::AppState;
use commands::window::{GlobalWindowState, create_hud_overlay_window};
use cursor::CursorTracker;
use std::sync::Arc;
use tokio::sync::RwLock;
use tray::create_tray;

/// 全局光标追踪器状态
pub struct CursorTrackerState(pub Arc<RwLock<CursorTracker>>);

impl Default for CursorTrackerState {
    fn default() -> Self {
        Self(Arc::new(RwLock::new(CursorTracker::new())))
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::default())
        .manage(CursorTrackerState::default())
        .manage(GlobalWindowState::default())
        .manage(ProjectState::default())
        .invoke_handler(tauri::generate_handler![
            // 窗口命令
            commands::window::switch_to_editor,
            commands::window::open_source_selector,
            commands::window::hud_overlay_hide,
            commands::window::hud_overlay_close,
            commands::window::show_hud_window,
            commands::window::close_source_selector,
            commands::window::set_has_unsaved_changes,
            commands::window::get_platform,
            commands::window::save_before_close_done,
            // 文件系统命令
            commands::filesystem::read_binary_file,
            commands::filesystem::save_project_file,
            commands::filesystem::load_project_file,
            commands::filesystem::load_current_project_file,
            commands::filesystem::open_video_file_picker,
            commands::filesystem::save_exported_video,
            commands::filesystem::reveal_in_folder,
            commands::filesystem::open_external_url,
            commands::filesystem::get_asset_base_path,
            // 录制命令
            commands::recording::store_recorded_session,
            commands::recording::store_recorded_video,
            commands::recording::get_recorded_video_path,
            commands::recording::set_recording_state,
            commands::recording::get_cursor_telemetry,
            commands::recording::set_current_recording_session,
            commands::recording::get_current_recording_session,
            commands::recording::set_current_video_path,
            commands::recording::get_current_video_path,
            commands::recording::clear_current_video_path,
            commands::recording::set_cursor_display_bounds,
            // 源选择命令
            commands::sources::get_sources,
            commands::sources::select_source,
            commands::sources::get_selected_source,
            commands::sources::request_camera_access,
            // 设置命令
            commands::settings::get_shortcuts,
            commands::settings::save_shortcuts,
            commands::settings::set_locale,
            commands::settings::get_system_fonts,
            // 托盘命令
            commands::tray::update_tray,
            // 音频命令
            commands::audio::get_microphone_devices,
            commands::audio::check_microphone_permission,
            commands::audio::request_microphone_permission,
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            
            // 创建应用菜单
            let app_menu = menu::create_app_menu(app.handle())?;
            app.set_menu(app_menu)?;
            
            // 创建系统托盘
            create_tray(app.handle())?;
            
            // 创建初始 HUD 窗口
            create_hud_overlay_window(app.handle())?;
            
            Ok(())
        })
        .on_menu_event(|app, event| {
            let menu_id = event.id.as_ref();
            let _ = menu::handle_menu_event(app, menu_id);
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
