//! 文件系统命令

use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

/// 项目文件扩展名
const PROJECT_FILE_EXTENSION: &str = "openscreen";

/// 项目状态 - 跟踪当前项目路径
pub struct ProjectState {
    pub current_project_path: Mutex<Option<String>>,
}

impl Default for ProjectState {
    fn default() -> Self {
        Self {
            current_project_path: Mutex::new(None),
        }
    }
}

/// 读取二进制文件
#[tauri::command]
pub async fn read_binary_file(file_path: String) -> Result<ReadBinaryFileResult, String> {
    let path = PathBuf::from(&file_path);

    if !path.exists() {
        return Ok(ReadBinaryFileResult {
            success: false,
            data: None,
            path: None,
            message: Some("File not found".to_string()),
        });
    }

    match fs::read(&path) {
        Ok(data) => Ok(ReadBinaryFileResult {
            success: true,
            data: Some(data),
            path: Some(file_path),
            message: None,
        }),
        Err(e) => Ok(ReadBinaryFileResult {
            success: false,
            data: None,
            path: None,
            message: Some(e.to_string()),
        }),
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadBinaryFileResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Vec<u8>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

/// 保存项目文件
#[tauri::command]
pub async fn save_project_file(
    app: AppHandle,
    project_data: serde_json::Value,
    suggested_name: Option<String>,
    existing_project_path: Option<String>,
) -> Result<SaveProjectFileResult, String> {
    let state = app.state::<ProjectState>();
    
    // 如果有现有项目路径，直接保存
    if let Some(path) = existing_project_path {
        let path_buf = PathBuf::from(&path);
        let content = serde_json::to_string_pretty(&project_data).map_err(|e| e.to_string())?;
        fs::write(&path_buf, content).map_err(|e| e.to_string())?;

        // 更新当前项目路径
        if let Ok(mut current_path) = state.current_project_path.lock() {
            *current_path = Some(path.clone());
        }

        return Ok(SaveProjectFileResult {
            success: true,
            path: Some(path),
            message: Some("Project saved successfully".to_string()),
            canceled: None,
        });
    }

    // 使用对话框保存
    let default_name = suggested_name.unwrap_or_else(|| format!("project-{}", chrono::Utc::now().timestamp()));
    let default_name = format!("{}.{}", 
        default_name.replace(|c: char| !c.is_alphanumeric() && c != '-' && c != '_', "_"),
        PROJECT_FILE_EXTENSION
    );

    let recordings_dir = get_recordings_dir(&app);

    let file_path = app
        .dialog()
        .file()
        .set_title("Save Project")
        .set_directory(recordings_dir)
        .set_file_name(&default_name)
        .add_filter("OpenScreen Project", &[PROJECT_FILE_EXTENSION, "json"])
        .blocking_save_file();

    match file_path {
        Some(fp) => {
            let path = fp.into_path().map_err(|e| e.to_string())?;
            let content = serde_json::to_string_pretty(&project_data).map_err(|e| e.to_string())?;
            fs::write(&path, content).map_err(|e| e.to_string())?;

            let path_str = path.to_string_lossy().to_string();
            
            // 更新当前项目路径
            if let Ok(mut current_path) = state.current_project_path.lock() {
                *current_path = Some(path_str.clone());
            }

            Ok(SaveProjectFileResult {
                success: true,
                path: Some(path_str),
                message: Some("Project saved successfully".to_string()),
                canceled: None,
            })
        }
        None => Ok(SaveProjectFileResult {
            success: false,
            path: None,
            message: Some("Save project canceled".to_string()),
            canceled: Some(true),
        }),
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveProjectFileResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub canceled: Option<bool>,
}

/// 加载项目文件
#[tauri::command]
pub async fn load_project_file(app: AppHandle) -> Result<LoadProjectFileResult, String> {
    let state = app.state::<ProjectState>();
    let recordings_dir = get_recordings_dir(&app);

    let file_path = app
        .dialog()
        .file()
        .set_title("Open Project")
        .set_directory(recordings_dir)
        .add_filter("OpenScreen Project", &[PROJECT_FILE_EXTENSION, "json"])
        .blocking_pick_file();

    match file_path {
        Some(fp) => {
            let path = fp.into_path().map_err(|e| e.to_string())?;
            let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
            let project: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;

            let path_str = path.to_string_lossy().to_string();
            
            // 更新当前项目路径
            if let Ok(mut current_path) = state.current_project_path.lock() {
                *current_path = Some(path_str.clone());
            }

            Ok(LoadProjectFileResult {
                success: true,
                path: Some(path_str),
                project: Some(project),
                message: None,
                canceled: None,
            })
        }
        None => Ok(LoadProjectFileResult {
            success: false,
            path: None,
            project: None,
            message: Some("Open project canceled".to_string()),
            canceled: Some(true),
        }),
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadProjectFileResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub canceled: Option<bool>,
}

/// 打开视频文件选择器
#[tauri::command]
pub async fn open_video_file_picker(app: AppHandle) -> Result<OpenVideoFilePickerResult, String> {
    let recordings_dir = get_recordings_dir(&app);

    let file_path = app
        .dialog()
        .file()
        .set_title("Select Video")
        .set_directory(recordings_dir)
        .add_filter("Video Files", &["webm", "mp4", "mov", "avi", "mkv"])
        .blocking_pick_file();

    match file_path {
        Some(fp) => {
            let path = fp.into_path().map_err(|e| e.to_string())?;
            Ok(OpenVideoFilePickerResult {
                success: true,
                path: Some(path.to_string_lossy().to_string()),
                canceled: None,
            })
        }
        None => Ok(OpenVideoFilePickerResult {
            success: false,
            path: None,
            canceled: Some(true),
        }),
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenVideoFilePickerResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub canceled: Option<bool>,
}

/// 保存导出视频
#[tauri::command]
pub async fn save_exported_video(
    app: AppHandle,
    video_data: Vec<u8>,
    file_name: String,
) -> Result<SaveExportedVideoResult, String> {
    let downloads_dir = app.path().download_dir().unwrap_or_else(|_| PathBuf::from("."));

    let is_gif = file_name.to_lowercase().ends_with(".gif");
    let filter_name = if is_gif { "GIF Image" } else { "MP4 Video" };
    let filter_ext = if is_gif { "gif" } else { "mp4" };

    let file_path = app
        .dialog()
        .file()
        .set_title(if is_gif { "Save GIF" } else { "Save Video" })
        .set_directory(downloads_dir)
        .set_file_name(&file_name)
        .add_filter(filter_name, &[filter_ext])
        .blocking_save_file();

    match file_path {
        Some(fp) => {
            let path = fp.into_path().map_err(|e| e.to_string())?;
            fs::write(&path, video_data).map_err(|e| e.to_string())?;

            Ok(SaveExportedVideoResult {
                success: true,
                path: Some(path.to_string_lossy().to_string()),
                message: Some("Video exported successfully".to_string()),
                canceled: None,
            })
        }
        None => Ok(SaveExportedVideoResult {
            success: false,
            path: None,
            message: Some("Export canceled".to_string()),
            canceled: Some(true),
        }),
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveExportedVideoResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub canceled: Option<bool>,
}

/// 在文件夹中显示文件
#[tauri::command]
pub async fn reveal_in_folder(file_path: String, app: AppHandle) -> Result<RevealInFolderResult, String> {
    let path = PathBuf::from(&file_path);

    if !path.exists() {
        // 尝试打开父目录
        if let Some(parent) = path.parent() {
            if parent.exists() {
                app.opener()
                    .open_path(parent.to_string_lossy().to_string(), None::<&str>)
                    .map_err(|e| e.to_string())?;
                return Ok(RevealInFolderResult {
                    success: true,
                    message: Some("Could not reveal item, but opened directory.".to_string()),
                });
            }
        }
        return Ok(RevealInFolderResult {
            success: false,
            message: Some("File or directory not found".to_string()),
        });
    }

    // 使用 opener 打开文件所在目录
    app.opener()
        .open_path(path.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| e.to_string())?;

    Ok(RevealInFolderResult {
        success: true,
        message: None,
    })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RevealInFolderResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

/// 打开外部 URL
#[tauri::command]
pub async fn open_external_url(url: String, app: AppHandle) -> Result<(), String> {
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// 获取资源基础路径
#[tauri::command]
pub fn get_asset_base_path(app: AppHandle) -> Option<String> {
    let resource_path = app.path().resource_dir().ok()?;
    let asset_path = resource_path.join("assets");

    // 返回 file:// URL
    Some(format!("file://{}/", asset_path.display()))
}

/// 获取录制目录
fn get_recordings_dir(app: &AppHandle) -> PathBuf {
    app.path().app_data_dir()
        .map(|p| p.join("recordings"))
        .unwrap_or_else(|_| PathBuf::from("./recordings"))
}

/// 加载当前项目文件
/// 从上次保存的项目路径加载项目数据
#[tauri::command]
pub async fn load_current_project_file(app: AppHandle) -> Result<LoadProjectFileResult, String> {
    let state = app.state::<ProjectState>();
    
    // 获取当前项目路径
    let project_path = {
        if let Ok(path) = state.current_project_path.lock() {
            path.clone()
        } else {
            None
        }
    };

    match project_path {
        Some(path) => {
            let path_buf = PathBuf::from(&path);
            
            if !path_buf.exists() {
                return Ok(LoadProjectFileResult {
                    success: false,
                    path: None,
                    project: None,
                    message: Some("Project file not found".to_string()),
                    canceled: None,
                });
            }

            match fs::read_to_string(&path_buf) {
                Ok(content) => {
                    match serde_json::from_str(&content) {
                        Ok(project) => Ok(LoadProjectFileResult {
                            success: true,
                            path: Some(path),
                            project: Some(project),
                            message: None,
                            canceled: None,
                        }),
                        Err(e) => Ok(LoadProjectFileResult {
                            success: false,
                            path: None,
                            project: None,
                            message: Some(format!("Failed to parse project: {}", e)),
                            canceled: None,
                        }),
                    }
                }
                Err(e) => Ok(LoadProjectFileResult {
                    success: false,
                    path: None,
                    project: None,
                    message: Some(format!("Failed to read project file: {}", e)),
                    canceled: None,
                }),
            }
        }
        None => Ok(LoadProjectFileResult {
            success: false,
            path: None,
            project: None,
            message: Some("No active project".to_string()),
            canceled: None,
        }),
    }
}