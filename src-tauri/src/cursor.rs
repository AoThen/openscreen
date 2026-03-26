//! 光标追踪模块
//!
//! 跨平台光标位置追踪，用于录制期间记录光标移动轨迹

use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;

/// 默认采样间隔（毫秒）
const SAMPLE_INTERVAL_MS: u64 = 100; // 10Hz

/// 最大样本数量（1小时 @ 10Hz）
const MAX_SAMPLES: usize = 36000;

/// 光标位置样本
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CursorPoint {
    pub time_ms: u64,
    pub cx: f64, // 归一化坐标 0-1
    pub cy: f64,
}

/// 显示器边界信息，用于坐标归一化
#[derive(Clone, Default)]
pub struct DisplayBounds {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

/// 光标追踪器
pub struct CursorTracker {
    samples: Arc<RwLock<Vec<CursorPoint>>>,
    is_tracking: Arc<RwLock<bool>>,
    start_time: Arc<RwLock<Option<Instant>>>,
    display_bounds: Arc<RwLock<DisplayBounds>>,
}

impl CursorTracker {
    pub fn new() -> Self {
        Self {
            samples: Arc::new(RwLock::new(Vec::new())),
            is_tracking: Arc::new(RwLock::new(false)),
            start_time: Arc::new(RwLock::new(None)),
            display_bounds: Arc::new(RwLock::new(DisplayBounds::default())),
        }
    }

    /// 设置录制目标显示器的边界（用于坐标归一化）
    pub async fn set_display_bounds(&self, x: i32, y: i32, width: i32, height: i32) {
        let mut bounds = self.display_bounds.write().await;
        *bounds = DisplayBounds { x, y, width, height };
    }

    /// 开始追踪光标
    pub async fn start_tracking(&self) {
        // 重置状态
        {
            let mut is_tracking = self.is_tracking.write().await;
            *is_tracking = true;
        }
        {
            let mut start_time = self.start_time.write().await;
            *start_time = Some(Instant::now());
        }
        {
            let mut samples = self.samples.write().await;
            samples.clear();
        }

        // 启动后台采样任务
        let samples_clone = self.samples.clone();
        let is_tracking_clone = self.is_tracking.clone();
        let start_time_clone = self.start_time.clone();
        let display_bounds_clone = self.display_bounds.clone();

        tokio::spawn(async move {
            let interval = Duration::from_millis(SAMPLE_INTERVAL_MS);

            loop {
                let tracking = *is_tracking_clone.read().await;
                if !tracking {
                    break;
                }

                if let Some(start) = *start_time_clone.read().await {
                    let bounds = display_bounds_clone.read().await.clone();

                    if let Ok((cx, cy)) = get_cursor_position_normalized(&bounds) {
                        let mut s = samples_clone.write().await;
                        s.push(CursorPoint {
                            time_ms: start.elapsed().as_millis() as u64,
                            cx,
                            cy,
                        });
                        // 限制最大样本数
                        if s.len() > MAX_SAMPLES {
                            s.remove(0);
                        }
                    }
                }

                tokio::time::sleep(interval).await;
            }
        });
    }

    /// 停止追踪并返回样本数据
    pub async fn stop_tracking(&self) -> Vec<CursorPoint> {
        {
            let mut is_tracking = self.is_tracking.write().await;
            *is_tracking = false;
        }
        self.samples.read().await.clone()
    }

    /// 获取当前样本数据（不停止追踪）
    pub async fn get_samples(&self) -> Vec<CursorPoint> {
        self.samples.read().await.clone()
    }

    /// 获取当前追踪状态
    pub async fn is_tracking(&self) -> bool {
        *self.is_tracking.read().await
    }

    /// 将光标遥测数据保存到文件
    pub async fn save_to_file(&self, video_path: &str) -> Result<(), String> {
        use std::fs;

        let samples = self.samples.read().await;
        let telemetry = serde_json::json!({
            "version": 1,
            "samples": samples.clone()
        });

        let telemetry_path = format!("{}.cursor.json", video_path);
        let content =
            serde_json::to_string_pretty(&telemetry).map_err(|e| e.to_string())?;

        fs::write(&telemetry_path, content)
            .map_err(|e| format!("Failed to write telemetry file: {}", e))
    }
}

impl Default for CursorTracker {
    fn default() -> Self {
        Self::new()
    }
}

/// 获取归一化的光标位置
fn get_cursor_position_normalized(bounds: &DisplayBounds) -> Result<(f64, f64), String> {
    let (x, y) = get_cursor_position()?;

    // 归一化到录制目标的显示器边界
    let width = bounds.width.max(1);
    let height = bounds.height.max(1);

    let cx = (x - bounds.x) as f64 / width as f64;
    let cy = (y - bounds.y) as f64 / height as f64;

    // 限制在 0-1 范围内
    let cx = cx.clamp(0.0, 1.0);
    let cy = cy.clamp(0.0, 1.0);

    Ok((cx, cy))
}

/// 获取光标位置（平台特定实现）
#[cfg(target_os = "windows")]
fn get_cursor_position() -> Result<(i32, i32), String> {
    use winapi::um::winuser::GetCursorPos;
    use winapi::shared::windef::POINT;

    unsafe {
        let mut point: POINT = POINT { x: 0, y: 0 };
        let result = GetCursorPos(&mut point);

        if result == 0 {
            return Err("GetCursorPos failed".to_string());
        }

        Ok((point.x, point.y))
    }
}

#[cfg(target_os = "macos")]
fn get_cursor_position() -> Result<(i32, i32), String> {
    use cocoa::base::{class, msg_send, sel, sel_impl};
    use cocoa::foundation::NSPoint;

    unsafe {
        let point: NSPoint = msg_send![class!(NSEvent), mouseLocation];

        // macOS 坐标系 Y 轴是从底部向上的
        // 需要在使用时进行转换
        Ok((point.x as i32, point.y as i32))
    }
}

#[cfg(target_os = "linux")]
fn get_cursor_position() -> Result<(i32, i32), String> {
    use x11::xlib::{XOpenDisplay, XQueryPointer, XRootWindow, XDefaultScreen, XCloseDisplay};

    unsafe {
        let display = XOpenDisplay(std::ptr::null());
        if display.is_null() {
            return Err("Failed to open X display".to_string());
        }

        let screen = XDefaultScreen(display);
        let root = XRootWindow(display, screen);

        let mut root_return = 0;
        let mut child_return = 0;
        let mut root_x = 0;
        let mut root_y = 0;
        let mut win_x = 0;
        let mut win_y = 0;
        let mut mask = 0;

        let result = XQueryPointer(
            display,
            root,
            &mut root_return,
            &mut child_return,
            &mut root_x,
            &mut root_y,
            &mut win_x,
            &mut win_y,
            &mut mask,
        );

        XCloseDisplay(display);

        if result == 0 {
            return Err("XQueryPointer failed".to_string());
        }

        Ok((win_x, win_y))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cursor_tracker_new() {
        let tracker = CursorTracker::new();
        assert!(!tokio_test::block_on(tracker.is_tracking()));
    }
}
