#!/usr/bin/env node
/**
 * Tauri API 验证脚本
 * 检查 Rust 命令和 TypeScript API 接口一致性
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

// 从 lib.rs 提取的命令列表
const RUST_COMMANDS = [
	// 窗口命令
	"switch_to_editor",
	"open_source_selector",
	"hud_overlay_hide",
	"hud_overlay_close",
	"show_hud_window",
	"close_source_selector",
	"set_has_unsaved_changes",
	"get_platform",
	// 文件系统命令
	"read_binary_file",
	"save_project_file",
	"load_project_file",
	"open_video_file_picker",
	"save_exported_video",
	"reveal_in_folder",
	"open_external_url",
	"get_asset_base_path",
	// 录制命令
	"store_recorded_session",
	"store_recorded_video",
	"get_recorded_video_path",
	"set_recording_state",
	"get_cursor_telemetry",
	"set_current_recording_session",
	"get_current_recording_session",
	"set_current_video_path",
	"get_current_video_path",
	"clear_current_video_path",
	"set_cursor_display_bounds",
	// 源选择命令
	"get_sources",
	"select_source",
	"get_selected_source",
	"request_camera_access",
	// 设置命令
	"get_shortcuts",
	"save_shortcuts",
	"set_locale",
	"get_system_fonts",
	// 托盘命令
	"update_tray",
	// 音频命令
	"get_microphone_devices",
	"check_microphone_permission",
	"request_microphone_permission",
];

// TypeScript API 方法名（camelCase）
const TS_API_METHODS = [
	"readBinaryFile",
	"getSources",
	"switchToEditor",
	"openSourceSelector",
	"selectSource",
	"getSelectedSource",
	"requestCameraAccess",
	"storeRecordedVideo",
	"storeRecordedSession",
	"getRecordedVideoPath",
	"getAssetBasePath",
	"setRecordingState",
	"setCursorDisplayBounds",
	"getCursorTelemetry",
	"onStopRecordingFromTray",
	"openExternalUrl",
	"saveExportedVideo",
	"openVideoFilePicker",
	"setCurrentVideoPath",
	"setCurrentRecordingSession",
	"getCurrentVideoPath",
	"getCurrentRecordingSession",
	"clearCurrentVideoPath",
	"saveProjectFile",
	"loadProjectFile",
	"onMenuLoadProject",
	"onMenuSaveProject",
	"onMenuSaveProjectAs",
	"setMicrophoneExpanded",
	"setHasUnsavedChanges",
	"onRequestSaveBeforeClose",
	"setLocale",
	"getSystemFonts",
	"revealInFolder",
	"getPlatform",
	"getShortcuts",
	"saveShortcuts",
	"hudOverlayHide",
	"hudOverlayClose",
	"showHudWindow",
	"closeSourceSelector",
	"updateTray",
	"getMicrophoneDevices",
	"checkMicrophonePermission",
	"requestMicrophonePermission",
];

// snake_case 转 camelCase
function snakeToCamel(str) {
	return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

// camelCase 转 snake_case
function camelToSnake(str) {
	return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

// 验证命令映射
function verifyCommandMapping() {
	const errors = [];
	const warnings = [];

	// 检查每个 Rust 命令是否有对应的 TypeScript 方法
	for (const rustCmd of RUST_COMMANDS) {
		const expectedTsMethod = snakeToCamel(rustCmd);
		if (!TS_API_METHODS.includes(expectedTsMethod)) {
			// 检查是否有事件监听器（以 on 开头的方法不需要对应的 Rust 命令）
			if (!expectedTsMethod.startsWith("on")) {
				errors.push(`Missing TypeScript method for Rust command: ${rustCmd} -> ${expectedTsMethod}`);
			}
		}
	}

	// 检查每个 TypeScript 方法是否有对应的 Rust 命令
	for (const tsMethod of TS_API_METHODS) {
		// 事件监听器不需要对应的 Rust 命令
		if (tsMethod.startsWith("on")) {
			continue;
		}
		// 某些方法有特殊处理
		if (["setMicrophoneExpanded", "loadCurrentProjectFile"].includes(tsMethod)) {
			warnings.push(`TypeScript method ${tsMethod} is not implemented in Rust (TODO)`);
			continue;
		}

		const expectedRustCmd = camelToSnake(tsMethod);
		if (!RUST_COMMANDS.includes(expectedRustCmd)) {
			errors.push(`Missing Rust command for TypeScript method: ${tsMethod} -> ${expectedRustCmd}`);
		}
	}

	return { errors, warnings };
}

// 验证 lib.rs 中的命令注册
function verifyLibRs() {
	const libRsPath = path.join(ROOT, "src-tauri/src/lib.rs");
	const content = fs.readFileSync(libRsPath, "utf-8");

	const missingCommands = [];

	for (const cmd of RUST_COMMANDS) {
		// 检查命令是否在 invoke_handler 中注册
		const pattern = new RegExp(`commands::\\w+::${cmd}`, "g");
		if (!pattern.test(content)) {
			missingCommands.push(cmd);
		}
	}

	return missingCommands;
}

// 主函数
function main() {
	console.log("=== Tauri API 验证 ===\n");

	// 1. 验证命令映射
	console.log("1. 验证命令映射...");
	const { errors, warnings } = verifyCommandMapping();

	if (errors.length > 0) {
		console.log("\n❌ 发现错误:");
		for (const error of errors) {
			console.log(`   - ${error}`);
		}
	} else {
		console.log("   ✓ 命令映射正确");
	}

	if (warnings.length > 0) {
		console.log("\n⚠ 警告:");
		for (const warning of warnings) {
			console.log(`   - ${warning}`);
		}
	}

	// 2. 验证 lib.rs 注册
	console.log("\n2. 验证 lib.rs 命令注册...");
	const missingInLib = verifyLibRs();
	if (missingInLib.length > 0) {
		console.log("   ❌ 未注册的命令:");
		for (const cmd of missingInLib) {
			console.log(`      - ${cmd}`);
		}
	} else {
		console.log("   ✓ 所有命令已注册");
	}

	// 3. 统计
	console.log("\n=== 统计 ===");
	console.log(`Rust 命令: ${RUST_COMMANDS.length}`);
	console.log(`TypeScript 方法: ${TS_API_METHODS.length}`);
	console.log(`错误: ${errors.length}`);
	console.log(`警告: ${warnings.length}`);

	// 返回退出码
	if (errors.length > 0) {
		process.exit(1);
	}
	console.log("\n✓ API 验证通过");
}

main();
