//! 设置和快捷键命令

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

/// 快捷键配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutsConfig {
    #[serde(flatten)]
    pub shortcuts: std::collections::HashMap<String, String>,
}

/// 获取快捷键配置
#[tauri::command]
pub async fn get_shortcuts(app: tauri::AppHandle) -> Result<Option<ShortcutsConfig>, String> {
    let shortcuts_path = get_shortcuts_path(&app);

    if !shortcuts_path.exists() {
        return Ok(None);
    }

    match fs::read_to_string(&shortcuts_path) {
        Ok(content) => {
            let config: ShortcutsConfig =
                serde_json::from_str(&content).map_err(|e| e.to_string())?;
            Ok(Some(config))
        }
        Err(e) => Err(e.to_string()),
    }
}

/// 保存快捷键配置
#[tauri::command]
pub async fn save_shortcuts(
    app: tauri::AppHandle,
    shortcuts: ShortcutsConfig,
) -> Result<(), String> {
    let shortcuts_path = get_shortcuts_path(&app);

    // 确保目录存在
    if let Some(parent) = shortcuts_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let content = serde_json::to_string_pretty(&shortcuts).map_err(|e| e.to_string())?;
    fs::write(&shortcuts_path, content).map_err(|e| e.to_string())?;

    Ok(())
}

/// 获取系统字体列表
#[tauri::command]
pub async fn get_system_fonts() -> Result<GetSystemFontsResult, String> {
    // Windows 使用 dwrote
    #[cfg(target_os = "windows")]
    {
        match dwrote::FontCollection::system() {
            Ok(collection) => {
                let mut font_names: Vec<String> = Vec::new();
                for family in collection.families() {
                    font_names.push(family.name().to_string());
                }

                // 去重并排序
                font_names.sort();
                font_names.dedup();

                Ok(GetSystemFontsResult {
                    success: true,
                    fonts: font_names,
                    error: None,
                })
            }
            Err(e) => Ok(GetSystemFontsResult {
                success: false,
                fonts: vec![],
                error: Some(e.to_string()),
            }),
        }
    }

    // macOS 和 Linux 使用 font_kit
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        match font_kit::source::SystemSource::new().all_fonts() {
            Ok(fonts) => {
                let font_names: Vec<String> = fonts
                    .into_iter()
                    .filter_map(|handle| {
                        font_kit::loaders::default::Font::from_handle(&handle).ok()
                    })
                    .map(|font| font.family_name())
                    .collect();

                // 去重并排序
                let mut unique_names: Vec<String> = font_names.into_iter().collect();
                unique_names.sort();
                unique_names.dedup();

                Ok(GetSystemFontsResult {
                    success: true,
                    fonts: unique_names,
                    error: None,
                })
            }
            Err(e) => Ok(GetSystemFontsResult {
                success: false,
                fonts: vec![],
                error: Some(e.to_string()),
            }),
        }
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        Ok(GetSystemFontsResult {
            success: false,
            fonts: vec![],
            error: Some("Platform not supported".to_string()),
        })
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GetSystemFontsResult {
    pub success: bool,
    pub fonts: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// 获取快捷键文件路径
fn get_shortcuts_path(app: &tauri::AppHandle) -> PathBuf {
    app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."))
        .join("shortcuts.json")
}

/// 设置应用语言
#[tauri::command]
pub async fn set_locale(app: tauri::AppHandle, locale: String) -> Result<(), String> {
    let locale_path = get_locale_path(&app);

    // 确保目录存在
    if let Some(parent) = locale_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let content = serde_json::json!({ "locale": locale });
    let content_str = serde_json::to_string(&content).map_err(|e| e.to_string())?;
    fs::write(&locale_path, content_str).map_err(|e| e.to_string())?;

    Ok(())
}

/// 获取语言设置文件路径
fn get_locale_path(app: &tauri::AppHandle) -> PathBuf {
    app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."))
        .join("locale.json")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_shortcuts_config_serialization() {
        let mut shortcuts = std::collections::HashMap::new();
        shortcuts.insert("startRecording".to_string(), "Ctrl+Shift+R".to_string());
        shortcuts.insert("stopRecording".to_string(), "Ctrl+Shift+S".to_string());

        let config = ShortcutsConfig { shortcuts };

        let json = serde_json::to_string(&config).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed.get("startRecording").unwrap().as_str().unwrap(), "Ctrl+Shift+R");
        assert_eq!(parsed.get("stopRecording").unwrap().as_str().unwrap(), "Ctrl+Shift+S");
    }

    #[test]
    fn test_get_system_fonts_result() {
        let result = GetSystemFontsResult {
            success: true,
            fonts: vec!["Arial".to_string(), "Helvetica".to_string()],
            error: None,
        };

        let json = serde_json::to_string(&result).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();

        assert!(parsed.get("success").unwrap().as_bool().unwrap());
        assert_eq!(parsed.get("fonts").unwrap().as_array().unwrap().len(), 2);
    }
}
