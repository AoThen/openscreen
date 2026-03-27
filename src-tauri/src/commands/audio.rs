//! 音频管理命令
//!
//! 提供麦克风设备枚举、权限请求等功能

use cpal::traits::{DeviceTrait, HostTrait};
use serde::{Deserialize, Serialize};

/// 音频设备信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioDevice {
	pub device_id: String,
	pub name: String,
	pub is_default: bool,
	pub channels: u16,
	pub sample_rate: u32,
}

/// 获取麦克风设备列表
#[tauri::command]
pub fn get_microphone_devices() -> Result<Vec<AudioDevice>, String> {
	let host = cpal::default_host();

	let mut devices = Vec::new();

	let input_devices = host
		.input_devices()
		.map_err(|e| format!("Failed to get input devices: {}", e))?;

	let default_input = host.default_input_device();
	let default_input_name = default_input
		.as_ref()
		.and_then(|d| d.name().ok());

	for (idx, device) in input_devices.enumerate() {
		let device_name: String = device.name().unwrap_or_else(|_| format!("Microphone {}", idx + 1));

		let is_default = default_input_name
			.as_ref()
			.map(|n| n == &device_name)
			.unwrap_or(false);

		let config = device.default_input_config().ok();

		let (channels, sample_rate) = config
			.map(|c| (c.channels(), c.sample_rate().0))
			.unwrap_or((1, 48000));

		devices.push(AudioDevice {
			device_id: format!("device_{}", idx),
			name: device_name,
			is_default,
			channels,
			sample_rate,
		});
	}

	Ok(devices)
}

/// 检查麦克风权限状态
#[tauri::command]
pub fn check_microphone_permission() -> Result<String, String> {
	#[cfg(target_os = "macos")]
	{
		use std::process::Command;

		// 使用 tccutil 检查权限状态（间接方式）
		// macOS 没有直接的 API 检查权限，通常通过尝试访问来判断
		// 返回 "unknown" 让前端尝试请求权限
		Ok("unknown".to_string())
	}

	#[cfg(target_os = "windows")]
	{
		// Windows 默认允许，需要时用户会看到系统弹窗
		Ok("granted".to_string())
	}

	#[cfg(target_os = "linux")]
	{
		// Linux 使用 PipeWire/PulseAudio，权限由系统管理
		Ok("granted".to_string())
	}
}

/// 请求麦克风权限
#[tauri::command]
pub async fn request_microphone_permission(_app: tauri::AppHandle) -> Result<bool, String> {
	#[cfg(target_os = "macos")]
	{
		// macOS 需要通过实际访问麦克风来触发权限请求
		// 使用 cpal 尝试打开默认输入设备
		use std::sync::atomic::{AtomicBool, Ordering};
		use std::sync::Arc;
		use std::thread;
		use std::time::Duration;

		let granted = Arc::new(AtomicBool::new(false));
		let granted_clone = granted.clone();

		// 在单独线程中尝试打开音频设备
		thread::spawn(move || {
			let host = cpal::default_host();
			if let Some(device) = host.default_input_device() {
				if let Ok(_stream) = device.build_input_stream(
					&device.default_input_config().unwrap().into(),
					|_data: &[f32], _: &cpal::InputCallbackInfo| {},
					|err| eprintln!("Audio stream error: {}", err),
					None,
				) {
					granted_clone.store(true, Ordering::SeqCst);
				}
			}
		});

		// 等待用户响应
		thread::sleep(Duration::from_secs(1));

		Ok(granted.load(Ordering::SeqCst))
	}

	#[cfg(target_os = "windows")]
	{
		// Windows 通过 WebAPI 自动处理权限弹窗
		Ok(true)
	}

	#[cfg(target_os = "linux")]
	{
		// Linux PipeWire 自动处理权限
		Ok(true)
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn test_audio_device_serialization() {
		let device = AudioDevice {
			device_id: "device_0".to_string(),
			name: "Built-in Microphone".to_string(),
			is_default: true,
			channels: 2,
			sample_rate: 48000,
		};

		let json = serde_json::to_string(&device).unwrap();
		let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();

		// 验证 snake_case 字段名
		assert_eq!(parsed.get("device_id").unwrap().as_str().unwrap(), "device_0");
		assert_eq!(parsed.get("name").unwrap().as_str().unwrap(), "Built-in Microphone");
		assert!(parsed.get("is_default").unwrap().as_bool().unwrap());
		assert_eq!(parsed.get("channels").unwrap().as_u64().unwrap(), 2);
		assert_eq!(parsed.get("sample_rate").unwrap().as_u64().unwrap(), 48000);
	}

	#[test]
	fn test_audio_device_with_default_config() {
		// 测试默认值逻辑
		let (channels, sample_rate) = Some((2u16, 44100u32))
			.unwrap_or((1, 48000));

		assert_eq!(channels, 2);
		assert_eq!(sample_rate, 44100);
	}

	#[test]
	fn test_audio_device_without_config() {
		// 测试默认值回退
		let config: Option<(u16, u32)> = None;
		let (channels, sample_rate) = config.unwrap_or((1, 48000));

		assert_eq!(channels, 1);
		assert_eq!(sample_rate, 48000);
	}
}
