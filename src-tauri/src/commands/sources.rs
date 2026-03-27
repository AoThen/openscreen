//! 屏幕捕获源命令
//!
//! 使用 scap 获取可捕获目标，使用 xcap 生成缩略图

use serde::{Deserialize, Serialize};
use std::io::Cursor;
use tauri::{AppHandle, Manager};

use super::recording::SelectedSource;

/// 默认缩略图尺寸
const DEFAULT_THUMBNAIL_WIDTH: u32 = 320;
const DEFAULT_THUMBNAIL_HEIGHT: u32 = 180;

/// 要排除的窗口标题关键词（过滤自身窗口）
const EXCLUDED_WINDOW_TITLES: &[&str] = &["OpenScreen", "OpenScreen HUD", "Select Source"];

/// 获取可用的屏幕捕获源
#[tauri::command]
pub async fn get_sources(opts: GetSourcesOptions) -> Result<GetSourcesResult, String> {
    // 检查平台支持
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    {
        if !scap::is_supported() {
            return Err("Platform not supported for screen capture".to_string());
        }

        // 检查权限
        if !scap::has_permission() {
            // 尝试请求权限
            if !scap::request_permission() {
                return Err("Screen capture permission denied".to_string());
            }
        }

        get_sources_scap(opts).await
    }

    #[cfg(target_os = "linux")]
    {
        get_sources_xcap(opts).await
    }
}

/// 获取源选项
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetSourcesOptions {
    #[serde(default = "default_types")]
    pub types: Vec<String>,
    #[serde(default)]
    pub thumbnail_size: Option<ThumbnailSize>,
}

fn default_types() -> Vec<String> {
    vec!["screen".to_string(), "window".to_string()]
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThumbnailSize {
    pub width: u32,
    pub height: u32,
}

/// 获取源结果
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GetSourcesResult {
    pub sources: Vec<DesktopSource>,
}

/// 桌面源
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopSource {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thumbnail: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub app_icon: Option<String>,
}

/// 选择录制源
#[tauri::command]
pub fn select_source(source: SelectedSource, app: AppHandle) -> Result<(), String> {
    let state = app.state::<super::recording::AppState>();

    if let Ok(mut selected) = state.selected_source.lock() {
        *selected = Some(source);
    }

    Ok(())
}

/// 获取已选择的源
#[tauri::command]
pub fn get_selected_source(app: AppHandle) -> Result<Option<SelectedSource>, String> {
    let state = app.state::<super::recording::AppState>();

    let result = {
        if let Ok(selected) = state.selected_source.lock() {
            selected.clone()
        } else {
            None
        }
    };

    Ok(result)
}

/// 请求摄像头访问权限
#[tauri::command]
pub async fn request_camera_access() -> Result<RequestCameraAccessResult, String> {
    #[cfg(target_os = "macos")]
    {
        // macOS 需要请求权限
        // TODO: 使用 AVFoundation 检查权限状态
        Ok(RequestCameraAccessResult {
            success: true,
            granted: true,
            status: "granted".to_string(),
        })
    }

    #[cfg(not(target_os = "macos"))]
    {
        // 其他平台默认已授权
        Ok(RequestCameraAccessResult {
            success: true,
            granted: true,
            status: "granted".to_string(),
        })
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestCameraAccessResult {
    pub success: bool,
    pub granted: bool,
    pub status: String,
}

// ============ macOS/Windows 实现 (使用 scap + xcap) ============

#[cfg(any(target_os = "macos", target_os = "windows"))]
async fn get_sources_scap(opts: GetSourcesOptions) -> Result<GetSourcesResult, String> {
    let want_screens = opts.types.contains(&"screen".to_string());
    let want_windows = opts.types.contains(&"window".to_string());

    let (thumb_w, thumb_h) = opts
        .thumbnail_size
        .map(|s| (s.width, s.height))
        .unwrap_or((DEFAULT_THUMBNAIL_WIDTH, DEFAULT_THUMBNAIL_HEIGHT));

    // 获取 scap 目标列表
    let targets = scap::get_all_targets().map_err(|e| e.to_string())?;

    // 获取 xcap 的显示器和窗口列表（用于生成缩略图）
    let monitors = xcap::Monitor::all().ok().unwrap_or_default();
    let windows = xcap::Window::all().ok().unwrap_or_default();

    let mut sources = Vec::new();

    for target in &targets {
        match target {
            scap::Target::Display(display) => {
                if !want_screens {
                    continue;
                }

                // 过滤自身窗口（通过标题匹配）
                if EXCLUDED_WINDOW_TITLES
                    .iter()
                    .any(|&excluded| display.title.contains(excluded))
                {
                    continue;
                }

                // 生成源 ID
                let id = format!("screen:{}", display.id);

                // 获取名称
                let name = if display.title.is_empty() {
                    "Screen".to_string()
                } else {
                    display.title.clone()
                };

                // 生成缩略图
                let thumbnail = generate_display_thumbnail(&monitors, &display.title, thumb_w, thumb_h);

                sources.push(DesktopSource {
                    id,
                    name,
                    display_id: None,
                    thumbnail,
                    app_icon: None,
                });
            }
            scap::Target::Window(window) => {
                if !want_windows {
                    continue;
                }

                // 过滤自身窗口（通过标题匹配）
                if EXCLUDED_WINDOW_TITLES
                    .iter()
                    .any(|&excluded| window.title.contains(excluded))
                {
                    continue;
                }

                // 生成源 ID
                let id = format!("window:{}", window.id);

                // 获取名称
                let name = if window.title.is_empty() {
                    "Window".to_string()
                } else {
                    window.title.clone()
                };

                // 生成缩略图
                let thumbnail = generate_window_thumbnail(&windows, &window.title, thumb_w, thumb_h);

                sources.push(DesktopSource {
                    id,
                    name,
                    display_id: None,
                    thumbnail,
                    app_icon: None,
                });
            }
        }
    }

    Ok(GetSourcesResult { sources })
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn generate_display_thumbnail(
    monitors: &[xcap::Monitor],
    display_title: &str,
    width: u32,
    height: u32,
) -> Option<String> {
    // 尝试通过名称匹配显示器
    for monitor in monitors {
        let name = monitor.name();
        if name.contains(display_title) || display_title.contains(name) {
            let image = monitor.capture_image().ok()?;
            return encode_thumbnail_xcap(&image, width, height);
        }
    }

    // 回退：使用第一个显示器
    let monitor = monitors.first()?;
    let image = monitor.capture_image().ok()?;
    encode_thumbnail_xcap(&image, width, height)
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn generate_window_thumbnail(
    windows: &[xcap::Window],
    window_title: &str,
    width: u32,
    height: u32,
) -> Option<String> {
    // 尝试通过标题匹配窗口
    for window in windows {
        // 跳过最小化的窗口
        if window.is_minimized() {
            continue;
        }

        let title = window.title();
        if title == window_title {
            let image = window.capture_image().ok()?;
            return encode_thumbnail_xcap(&image, width, height);
        }
    }

    None
}

/// 编码 xcap 图像为 base64（跨平台）
fn encode_thumbnail_xcap(
    image: &xcap::image::ImageBuffer<xcap::image::Rgba<u8>, Vec<u8>>,
    width: u32,
    height: u32,
) -> Option<String> {
    use xcap::image::{DynamicImage, ImageFormat};

    // 转换为 DynamicImage
    let dynamic_img = DynamicImage::ImageRgba8(image.clone());

    // 缩放到目标尺寸
    let resized = dynamic_img.resize(width, height, xcap::image::imageops::FilterType::Lanczos3);

    // 编码为 PNG
    let mut buffer = Vec::new();
    resized
        .write_to(&mut Cursor::new(&mut buffer), ImageFormat::Png)
        .ok()?;

    // 转换为 base64
    Some(base64::Engine::encode(
        &base64::engine::general_purpose::STANDARD,
        &buffer,
    ))
}

// ============ Linux 实现 (使用 xcap) ============

#[cfg(target_os = "linux")]
async fn get_sources_xcap(opts: GetSourcesOptions) -> Result<GetSourcesResult, String> {
    let want_screens = opts.types.contains(&"screen".to_string());
    let want_windows = opts.types.contains(&"window".to_string());

    let (thumb_w, thumb_h) = opts
        .thumbnail_size
        .map(|s| (s.width, s.height))
        .unwrap_or((DEFAULT_THUMBNAIL_WIDTH, DEFAULT_THUMBNAIL_HEIGHT));

    let mut sources = Vec::new();

    // 获取显示器
    if want_screens {
        if let Ok(monitors) = xcap::Monitor::all() {
            for (idx, monitor) in monitors.into_iter().enumerate() {
                // xcap::Monitor::name() 返回 &str
                let name = monitor.name().to_string();
                let name = if name.is_empty() {
                    format!("Screen {}", idx + 1)
                } else {
                    name
                };

                // 过滤自身窗口
                if EXCLUDED_WINDOW_TITLES
                    .iter()
                    .any(|&excluded| name.contains(excluded))
                {
                    continue;
                }

                let thumbnail = match monitor.capture_image() {
                    Ok(img) => encode_thumbnail_xcap(&img, thumb_w, thumb_h),
                    Err(_) => None,
                };

                sources.push(DesktopSource {
                    id: format!("screen:{}", idx),
                    name,
                    display_id: None,
                    thumbnail,
                    app_icon: None,
                });
            }
        }
    }

    // 获取窗口
    if want_windows {
        if let Ok(windows) = xcap::Window::all() {
            for (idx, window) in windows.into_iter().enumerate() {
                // 跳过最小化的窗口
                // xcap::Window::is_minimized() 返回 bool
                if window.is_minimized() {
                    continue;
                }

                // xcap::Window::title() 返回 &str
                let name = window.title().to_string();
                let name = if name.is_empty() {
                    format!("Window {}", idx)
                } else {
                    name
                };

                // 过滤自身窗口
                if EXCLUDED_WINDOW_TITLES
                    .iter()
                    .any(|&excluded| name.contains(excluded))
                {
                    continue;
                }

                let thumbnail = match window.capture_image() {
                    Ok(img) => encode_thumbnail_xcap(&img, thumb_w, thumb_h),
                    Err(_) => None,
                };

                sources.push(DesktopSource {
                    id: format!("window:{}", idx),
                    name,
                    display_id: None,
                    thumbnail,
                    app_icon: None,
                });
                        }
                    }
                }
            
                Ok(GetSourcesResult { sources })
            }
            
            #[cfg(test)]
            mod tests {
                use super::*;
            
                #[test]
                fn test_desktop_source_serialization() {
                    let source = DesktopSource {
                        id: "screen:0".to_string(),
                        name: "Screen 1".to_string(),
                        display_id: Some("display-0".to_string()),
                        thumbnail: Some("base64data".to_string()),
                        app_icon: None,
                    };
            
                    let json = serde_json::to_string(&source).unwrap();
                    assert!(json.contains("screen:0"));
                    assert!(json.contains("Screen 1"));
            
                    // 验证 camelCase 序列化
                    let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
                    assert!(parsed.get("displayId").is_some());
                    assert!(parsed.get("appIcon").is_some());
                }
            
                #[test]
                fn test_get_sources_options_default() {
                    let json = r#"{}"#;
                    let opts: GetSourcesOptions = serde_json::from_str(json).unwrap();
                    assert_eq!(opts.types, vec!["screen", "window"]);
                    assert!(opts.thumbnail_size.is_none());
                }
            
                #[test]
                fn test_get_sources_options_with_thumbnail() {
                    let json = r#"{"types": ["screen"], "thumbnailSize": {"width": 640, "height": 360}}"#;
                    let opts: GetSourcesOptions = serde_json::from_str(json).unwrap();
                    assert_eq!(opts.types, vec!["screen"]);
                    assert_eq!(opts.thumbnail_size.as_ref().unwrap().width, 640);
                    assert_eq!(opts.thumbnail_size.as_ref().unwrap().height, 360);
                }
            
                #[test]
                fn test_excluded_window_titles() {
                    let test_titles = ["OpenScreen", "OpenScreen HUD", "Select Source", "My App"];
            
                    for title in &test_titles {
                        let excluded = EXCLUDED_WINDOW_TITLES
                            .iter()
                            .any(|&excluded| title.contains(excluded));
            
                        if *title == "My App" {
                            assert!(!excluded);
                        } else {
                            assert!(excluded);
                        }
                    }
                }
            
                #[test]
                fn test_request_camera_access_result() {
                    let result = RequestCameraAccessResult {
                        success: true,
                        granted: true,
                        status: "granted".to_string(),
                    };
            
                    let json = serde_json::to_string(&result).unwrap();
                    let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
                    assert!(parsed.get("success").unwrap().as_bool().unwrap());
                    assert!(parsed.get("granted").unwrap().as_bool().unwrap());
                }
            }
            