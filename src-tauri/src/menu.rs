//! 应用菜单模块
//!
//! 提供 macOS 应用菜单和跨平台菜单支持

use tauri::{
    AppHandle, Emitter,
    menu::{Menu, MenuItemBuilder, SubmenuBuilder},
};

/// 创建应用菜单
pub fn create_app_menu(app: &AppHandle) -> Result<Menu<tauri::Wry>, String> {
    // 文件菜单
    let load_project_item = MenuItemBuilder::with_id("load_project", "Load Project...")
        .accelerator("CmdOrCtrl+O")
        .build(app)
        .map_err(|e| e.to_string())?;
    
    let save_project_item = MenuItemBuilder::with_id("save_project", "Save Project")
        .accelerator("CmdOrCtrl+S")
        .build(app)
        .map_err(|e| e.to_string())?;

    let save_project_as_item = MenuItemBuilder::with_id("save_project_as", "Save Project As...")
        .accelerator("CmdOrCtrl+Shift+S")
        .build(app)
        .map_err(|e| e.to_string())?;

    let file_menu = SubmenuBuilder::new(app, "File")
        .item(&load_project_item)
        .item(&save_project_item)
        .item(&save_project_as_item)
        .build()
        .map_err(|e| e.to_string())?;

    // 编辑菜单
    let undo_item = MenuItemBuilder::with_id("undo", "Undo")
        .accelerator("CmdOrCtrl+Z")
        .build(app)
        .map_err(|e| e.to_string())?;
    
    let redo_item = MenuItemBuilder::with_id("redo", "Redo")
        .accelerator("CmdOrCtrl+Shift+Z")
        .build(app)
        .map_err(|e| e.to_string())?;

    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .item(&undo_item)
        .item(&redo_item)
        .build()
        .map_err(|e| e.to_string())?;

    // 主菜单
    let menu = Menu::with_items(app, &[&file_menu, &edit_menu])
        .map_err(|e| e.to_string())?;

    Ok(menu)
}

/// 处理菜单事件
pub fn handle_menu_event(app: &AppHandle, menu_id: &str) -> Result<(), String> {
    match menu_id {
        "load_project" => {
            app.emit("menu-load-project", ())
                .map_err(|e| e.to_string())?;
        }
        "save_project" => {
            app.emit("menu-save-project", ())
                .map_err(|e| e.to_string())?;
        }
        "save_project_as" => {
            app.emit("menu-save-project-as", ())
                .map_err(|e| e.to_string())?;
        }
        "undo" => {
            app.emit("menu-undo", ())
                .map_err(|e| e.to_string())?;
        }
        "redo" => {
            app.emit("menu-redo", ())
                .map_err(|e| e.to_string())?;
        }
        _ => {}
    }
    Ok(())
}