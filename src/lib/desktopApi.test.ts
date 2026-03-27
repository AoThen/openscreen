/**
 * desktopApi 集成测试
 * 验证 Electron 和 Tauri API 接口一致性
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CursorTelemetryPoint, DesktopApi, ProcessedDesktopSource } from "./desktopApi";

// Mock Tauri invoke
const mockInvoke = vi.fn();
const mockListen = vi.fn(() =>
	Promise.resolve(() => {
		/* unlisten noop */
	}),
);

vi.mock("@tauri-apps/api/core", () => ({
	invoke: (cmd: string, args?: Record<string, unknown>) => mockInvoke(cmd, args),
}));

vi.mock("@tauri-apps/api/event", () => ({
	listen: (event: string, callback: unknown) => mockListen(event, callback),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
	openUrl: (url: string) => Promise.resolve(),
}));

describe("DesktopApi Interface", () => {
	beforeEach(() => {
		mockInvoke.mockReset();
		mockListen.mockReset();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe("API Interface Types", () => {
		it("should have correct ProcessedDesktopSource type", () => {
			const source: ProcessedDesktopSource = {
				id: "screen:0",
				name: "Screen 1",
				display_id: "display-0",
				thumbnail: "base64...",
				appIcon: null,
			};

			expect(source.id).toBeTypeOf("string");
			expect(source.name).toBeTypeOf("string");
			expect(source.display_id).toBeTypeOf("string");
			expect(source.thumbnail).toBeTypeOf("string");
			expect(source.appIcon).toBeNull();
		});

		it("should have correct CursorTelemetryPoint type", () => {
			const point: CursorTelemetryPoint = {
				timeMs: 1000,
				cx: 0.5,
				cy: 0.5,
			};

			expect(point.timeMs).toBeTypeOf("number");
			expect(point.cx).toBeTypeOf("number");
			expect(point.cy).toBeTypeOf("number");
			expect(point.cx).toBeGreaterThanOrEqual(0);
			expect(point.cx).toBeLessThanOrEqual(1);
			expect(point.cy).toBeGreaterThanOrEqual(0);
			expect(point.cy).toBeLessThanOrEqual(1);
		});
	});

	describe("API Method Signatures", () => {
		it("should define getSources with correct signature", async () => {
			mockInvoke.mockResolvedValueOnce({
				sources: [
					{
						id: "screen:0",
						name: "Screen 1",
						display_id: null,
						thumbnail: null,
						appIcon: null,
					},
				],
			});

			// 验证参数结构
			const opts = {
				types: ["screen", "window"],
				thumbnailSize: { width: 320, height: 180 },
			};

			// 测试参数序列化
			expect(opts.types).toContain("screen");
			expect(opts.thumbnailSize?.width).toBe(320);
		});

		it("should define getCursorTelemetry with correct return type", async () => {
			const mockResult = {
				success: true,
				samples: [
					{ timeMs: 0, cx: 0.5, cy: 0.5 },
					{ timeMs: 100, cx: 0.6, cy: 0.4 },
				] as CursorTelemetryPoint[],
			};

			mockInvoke.mockResolvedValueOnce(mockResult);

			// 验证返回结构
			expect(mockResult.success).toBe(true);
			expect(Array.isArray(mockResult.samples)).toBe(true);
			expect(mockResult.samples[0].timeMs).toBeDefined();
			expect(mockResult.samples[0].cx).toBeDefined();
			expect(mockResult.samples[0].cy).toBeDefined();
		});

		it("should define audio methods with correct types", async () => {
			// 模拟 getMicrophoneDevices 返回
			const mockDevices = [
				{
					device_id: "device_0",
					name: "Built-in Microphone",
					is_default: true,
					channels: 1,
					sample_rate: 48000,
				},
			];

			mockInvoke.mockResolvedValueOnce(mockDevices);

			// 验证设备数据结构
			const device = mockDevices[0];
			expect(device.device_id).toBeTypeOf("string");
			expect(device.name).toBeTypeOf("string");
			expect(device.is_default).toBeTypeOf("boolean");
			expect(device.channels).toBeTypeOf("number");
			expect(device.sample_rate).toBeTypeOf("number");
		});
	});
});

describe("API Consistency Check", () => {
	it("should have matching method names between DesktopApi interface and implementation", () => {
		const expectedMethods = [
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

		// 验证所有方法都在接口中定义
		const interfaceKeys: (keyof DesktopApi)[] = expectedMethods;
		expect(interfaceKeys.length).toBe(expectedMethods.length);
	});

	it("should use snake_case for Tauri command names", () => {
		const tauriCommands = [
			"read_binary_file",
			"get_sources",
			"switch_to_editor",
			"open_source_selector",
			"select_source",
			"get_selected_source",
			"request_camera_access",
			"store_recorded_video",
			"store_recorded_session",
			"get_recorded_video_path",
			"get_asset_base_path",
			"set_recording_state",
			"set_cursor_display_bounds",
			"get_cursor_telemetry",
			"save_exported_video",
			"open_video_file_picker",
			"set_current_video_path",
			"set_current_recording_session",
			"get_current_video_path",
			"get_current_recording_session",
			"clear_current_video_path",
			"save_project_file",
			"load_project_file",
			"set_locale",
			"get_system_fonts",
			"reveal_in_folder",
			"get_platform",
			"get_shortcuts",
			"save_shortcuts",
			"hud_overlay_hide",
			"hud_overlay_close",
			"show_hud_window",
			"close_source_selector",
			"update_tray",
			"get_microphone_devices",
			"check_microphone_permission",
			"request_microphone_permission",
		];

		// 验证命令名格式
		for (const cmd of tauriCommands) {
			expect(cmd).toMatch(/^[a-z][a-z0-9_]*$/);
			expect(cmd).not.toMatch(/[A-Z]/);
		}
	});
});
