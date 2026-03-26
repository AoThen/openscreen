//! 录制相关命令

use crate::CursorTrackerState;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

/// 录制会话
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingSession {
    pub screen_video_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub webcam_video_path: Option<String>,
    pub created_at: i64,
}

/// 光标遥测数据点
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CursorTelemetryPoint {
    pub time_ms: i64,
    pub cx: f64,
    pub cy: f64,
}

/// 存储录制会话输入
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoreRecordedSessionInput {
    pub screen: VideoDataInput,
    pub webcam: Option<VideoDataInput>,
    pub created_at: Option<i64>,
}

/// 视频数据输入
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoDataInput {
    pub video_data: Vec<u8>,
    pub file_name: String,
}

/// 应用状态
pub struct AppState {
    pub current_session: Mutex<Option<RecordingSession>>,
    pub selected_source: Mutex<Option<SelectedSource>>,
    pub cursor_samples: Mutex<Vec<CursorTelemetryPoint>>,
    pub is_recording: Mutex<bool>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            current_session: Mutex::new(None),
            selected_source: Mutex::new(None),
            cursor_samples: Mutex::new(Vec::new()),
            is_recording: Mutex::new(false),
        }
    }
}

/// 选中的录制源
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectedSource {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_id: Option<String>,
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}

/// 存储录制会话
#[tauri::command]
pub async fn store_recorded_session(
    app: AppHandle,
    payload: StoreRecordedSessionInput,
) -> Result<StoreRecordedSessionResult, String> {
    let recordings_dir = get_recordings_dir(&app);

    // 确保目录存在
    fs::create_dir_all(&recordings_dir).map_err(|e| e.to_string())?;

    // 保存屏幕视频
    let screen_video_path = recordings_dir.join(&payload.screen.file_name);
    fs::write(&screen_video_path, payload.screen.video_data).map_err(|e| e.to_string())?;

    // 保存摄像头视频（如果有）
    let webcam_video_path = if let Some(webcam) = &payload.webcam {
        let path = recordings_dir.join(&webcam.file_name);
        fs::write(&path, &webcam.video_data).map_err(|e| e.to_string())?;
        Some(path.to_string_lossy().to_string())
    } else {
        None
    };

    // 创建会话记录
    let session = RecordingSession {
        screen_video_path: screen_video_path.to_string_lossy().to_string(),
        webcam_video_path,
        created_at: payload.created_at.unwrap_or_else(|| Utc::now().timestamp_millis()),
    };

    // 保存会话清单
    let session_manifest_path = recordings_dir.join(format!(
        "{}.session.json",
        PathBuf::from(&payload.screen.file_name)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("recording")
    ));
    let session_content = serde_json::to_string_pretty(&session).map_err(|e| e.to_string())?;
    fs::write(&session_manifest_path, session_content).map_err(|e| e.to_string())?;

    // 更新应用状态
    let state = app.state::<AppState>();
    if let Ok(mut current) = state.current_session.lock() {
        *current = Some(session.clone());
    }

    Ok(StoreRecordedSessionResult {
        success: true,
        path: Some(session.screen_video_path.clone()),
        session: Some(session),
        message: Some("Recording session stored successfully".to_string()),
    })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoreRecordedSessionResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session: Option<RecordingSession>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

/// 存储录制视频（简化版）
#[tauri::command]
pub async fn store_recorded_video(
    app: AppHandle,
    video_data: Vec<u8>,
    file_name: String,
) -> Result<StoreRecordedSessionResult, String> {
    store_recorded_session(
        app,
        StoreRecordedSessionInput {
            screen: VideoDataInput { video_data, file_name },
            webcam: None,
            created_at: None,
        },
    ).await
}

/// 获取录制视频路径
#[tauri::command]
pub async fn get_recorded_video_path(app: AppHandle) -> Result<GetRecordedVideoPathResult, String> {
    let state = app.state::<AppState>();

    // 首先检查当前会话
    if let Ok(current) = state.current_session.lock() {
        if let Some(session) = current.as_ref() {
            return Ok(GetRecordedVideoPathResult {
                success: true,
                path: Some(session.screen_video_path.clone()),
            });
        }
    }

    // 查找最新的录制文件
    let recordings_dir = get_recordings_dir(&app);
    if !recordings_dir.exists() {
        return Ok(GetRecordedVideoPathResult {
            success: false,
            path: None,
        });
    }

    let mut video_files: Vec<String> = Vec::new();
    if let Ok(entries) = fs::read_dir(&recordings_dir) {
        for entry in entries.flatten() {
            if let Some(name) = entry.file_name().to_str() {
                if name.ends_with(".webm") && !name.ends_with("-webcam.webm") {
                    video_files.push(name.to_string());
                }
            }
        }
    }

    if video_files.is_empty() {
        return Ok(GetRecordedVideoPathResult {
            success: false,
            path: None,
        });
    }

    video_files.sort();
    video_files.reverse();

    let latest_video = recordings_dir.join(&video_files[0]);
    Ok(GetRecordedVideoPathResult {
        success: true,
        path: Some(latest_video.to_string_lossy().to_string()),
    })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GetRecordedVideoPathResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
}

/// 设置录制状态
#[tauri::command]
pub async fn set_recording_state(recording: bool, app: AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();

    if let Ok(mut is_recording) = state.is_recording.lock() {
        *is_recording = recording;
    }

    // 使用全局光标追踪器
    let cursor_state = app.state::<CursorTrackerState>();
    let cursor_tracker = cursor_state.0.read().await;

    if recording {
        // 开始录制 - 清空光标样本并开始追踪
        if let Ok(mut samples) = state.cursor_samples.lock() {
            samples.clear();
        }
        cursor_tracker.start_tracking().await;
    } else {
        // 停止录制 - 停止追踪并保存遥测数据
        let samples = cursor_tracker.stop_tracking().await;

        // 保存样本到状态
        if let Ok(mut state_samples) = state.cursor_samples.lock() {
            *state_samples = samples
                .into_iter()
                .map(|p| CursorTelemetryPoint {
                    time_ms: p.time_ms as i64,
                    cx: p.cx,
                    cy: p.cy,
                })
                .collect();
        }

        // 如果有录制会话，获取视频路径（在 await 之前先获取）
        let video_path = {
            if let Ok(current) = state.current_session.lock() {
                current.as_ref().map(|s| s.screen_video_path.clone())
            } else {
                None
            }
        };

        // 保存遥测数据到文件
        if let Some(path) = video_path {
            cursor_tracker.save_to_file(&path).await?;
        }
    }

    Ok(())
}

/// 获取光标遥测数据
#[tauri::command]
pub async fn get_cursor_telemetry(
    video_path: Option<String>,
    app: AppHandle,
) -> Result<GetCursorTelemetryResult, String> {
    let target_path = match video_path {
        Some(path) => path,
        None => {
            let state = app.state::<AppState>();
            let session_path = {
                if let Ok(current) = state.current_session.lock() {
                    current.as_ref().map(|s| s.screen_video_path.clone())
                } else {
                    None
                }
            };
            session_path.unwrap_or_default()
        }
    };

    if target_path.is_empty() {
        return Ok(GetCursorTelemetryResult { success: true, samples: vec![] });
    }

    let telemetry_path = format!("{}.cursor.json", target_path);

    match fs::read_to_string(&telemetry_path) {
        Ok(content) => {
            let parsed: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
            let raw_samples = parsed
                .get("samples")
                .and_then(|s| s.as_array())
                .cloned()
                .unwrap_or_default();

            let samples: Vec<CursorTelemetryPoint> = raw_samples
                .into_iter()
                .filter_map(|s| serde_json::from_value(s).ok())
                .collect();

            Ok(GetCursorTelemetryResult { success: true, samples })
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            Ok(GetCursorTelemetryResult { success: true, samples: vec![] })
        }
        Err(e) => Err(e.to_string()),
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GetCursorTelemetryResult {
    pub success: bool,
    pub samples: Vec<CursorTelemetryPoint>,
}

/// 设置当前录制会话
#[tauri::command]
pub fn set_current_recording_session(
    session: Option<RecordingSession>,
    app: AppHandle,
) -> Result<SetCurrentSessionResult, String> {
    let state = app.state::<AppState>();

    if let Ok(mut current) = state.current_session.lock() {
        *current = session.clone();
    }

    Ok(SetCurrentSessionResult {
        success: true,
        session,
    })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetCurrentSessionResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session: Option<RecordingSession>,
}

/// 获取当前录制会话
#[tauri::command]
pub fn get_current_recording_session(app: AppHandle) -> Result<GetCurrentSessionResult, String> {
    let state = app.state::<AppState>();

    if let Ok(current) = state.current_session.lock() {
        if let Some(session) = current.as_ref() {
            return Ok(GetCurrentSessionResult {
                success: true,
                session: Some(session.clone()),
            });
        }
    }

    Ok(GetCurrentSessionResult { success: false, session: None })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GetCurrentSessionResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session: Option<RecordingSession>,
}

/// 设置当前视频路径
#[tauri::command]
pub async fn set_current_video_path(path: String, app: AppHandle) -> Result<(), String> {
    let recordings_dir = get_recordings_dir(&app);
    let session_manifest = recordings_dir.join(format!(
        "{}.session.json",
        PathBuf::from(&path)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("recording")
    ));

    let session = if session_manifest.exists() {
        let content = fs::read_to_string(&session_manifest).map_err(|e| e.to_string())?;
        Some(serde_json::from_str(&content).map_err(|e| e.to_string())?)
    } else {
        Some(RecordingSession {
            screen_video_path: path,
            webcam_video_path: None,
            created_at: Utc::now().timestamp_millis(),
        })
    };

    let state = app.state::<AppState>();
    if let Ok(mut current) = state.current_session.lock() {
        *current = session;
    }

    Ok(())
}

/// 获取当前视频路径
#[tauri::command]
pub fn get_current_video_path(app: AppHandle) -> Result<GetCurrentVideoPathResult, String> {
    let state = app.state::<AppState>();

    if let Ok(current) = state.current_session.lock() {
        if let Some(session) = current.as_ref() {
            return Ok(GetCurrentVideoPathResult {
                success: true,
                path: Some(session.screen_video_path.clone()),
            });
        }
    }

    Ok(GetCurrentVideoPathResult { success: false, path: None })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GetCurrentVideoPathResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
}

/// 清除当前视频路径
#[tauri::command]
pub fn clear_current_video_path(app: AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();

    if let Ok(mut current) = state.current_session.lock() {
        *current = None;
    }

    Ok(())
}

/// 获取录制目录
fn get_recordings_dir(app: &AppHandle) -> PathBuf {
    app.path().app_data_dir()
        .map(|p| p.join("recordings"))
        .unwrap_or_else(|_| PathBuf::from("./recordings"))
}

/// 设置光标追踪的显示区域边界
#[tauri::command]
pub async fn set_cursor_display_bounds(
    x: i32,
    y: i32,
    width: i32,
    height: i32,
    app: AppHandle,
) -> Result<(), String> {
    let cursor_state = app.state::<CursorTrackerState>();
    let cursor_tracker = cursor_state.0.read().await;
    cursor_tracker.set_display_bounds(x, y, width, height).await;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_recording_session_serialization() {
        let session = RecordingSession {
            screen_video_path: "/path/to/video.webm".to_string(),
            webcam_video_path: Some("/path/to/webcam.webm".to_string()),
            created_at: 1234567890000,
        };

        let json = serde_json::to_string(&session).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();

        // 验证 camelCase
        assert!(parsed.get("screenVideoPath").is_some());
        assert!(parsed.get("webcamVideoPath").is_some());
        assert!(parsed.get("createdAt").is_some());
    }

    #[test]
    fn test_cursor_telemetry_point() {
        let point = CursorTelemetryPoint {
            time_ms: 1000,
            cx: 0.5,
            cy: 0.75,
        };

        let json = serde_json::to_string(&point).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed.get("timeMs").unwrap().as_i64().unwrap(), 1000);
        assert_eq!(parsed.get("cx").unwrap().as_f64().unwrap(), 0.5);
        assert_eq!(parsed.get("cy").unwrap().as_f64().unwrap(), 0.75);
    }

    #[test]
    fn test_selected_source_serialization() {
        let mut extra = HashMap::new();
        extra.insert("custom_field".to_string(), serde_json::json!("value"));

        let source = SelectedSource {
            name: "Screen 1".to_string(),
            display_id: Some("display-0".to_string()),
            extra,
        };

        let json = serde_json::to_string(&source).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed.get("name").unwrap().as_str().unwrap(), "Screen 1");
        assert!(parsed.get("displayId").is_some());
        assert_eq!(parsed.get("custom_field").unwrap().as_str().unwrap(), "value");
    }

    #[test]
    fn test_app_state_default() {
        let state = AppState::default();

        assert!(state.current_session.lock().unwrap().is_none());
        assert!(state.selected_source.lock().unwrap().is_none());
        assert!(state.cursor_samples.lock().unwrap().is_empty());
        assert!(!*state.is_recording.lock().unwrap());
    }

    #[test]
    fn test_store_recorded_session_input_deserialization() {
        let json = r#"{
            "screen": {
                "videoData": [1, 2, 3, 4],
                "fileName": "test.webm"
            },
            "webcam": null,
            "createdAt": 1234567890000
        }"#;

        let input: StoreRecordedSessionInput = serde_json::from_str(json).unwrap();
        assert_eq!(input.screen.video_data, vec![1, 2, 3, 4]);
        assert_eq!(input.screen.file_name, "test.webm");
        assert!(input.webcam.is_none());
        assert_eq!(input.created_at, Some(1234567890000));
    }
}
