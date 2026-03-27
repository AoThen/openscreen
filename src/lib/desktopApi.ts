/**
 * 桌面 API 适配层
 * 在 Electron 和 Tauri 之间提供统一的 API 接口
 */

import type { RecordingSession, StoreRecordedSessionInput } from "./recordingSession";

// 类型定义
export interface ProcessedDesktopSource {
	id: string;
	name: string;
	display_id: string;
	thumbnail: string | null;
	appIcon: string | null;
}

export interface CursorTelemetryPoint {
	timeMs: number;
	cx: number;
	cy: number;
}

export interface SourcesOptions {
	types?: string[];
	thumbnailSize?: { width: number; height: number };
}

export interface DesktopApi {
	readBinaryFile: (filePath: string) => Promise<{
		success: boolean;
		data?: Uint8Array;
		path?: string;
		message?: string;
		error?: string;
	}>;
	getSources: (opts: SourcesOptions) => Promise<ProcessedDesktopSource[]>;
	switchToEditor: () => Promise<void>;
	openSourceSelector: () => Promise<void>;
	selectSource: (source: ProcessedDesktopSource) => Promise<ProcessedDesktopSource | null>;
	getSelectedSource: () => Promise<ProcessedDesktopSource | null>;
	requestCameraAccess: () => Promise<{
		success: boolean;
		granted: boolean;
		status: string;
		error?: string;
	}>;
	storeRecordedVideo: (
		videoData: ArrayBuffer,
		fileName: string,
	) => Promise<{
		success: boolean;
		path?: string;
		session?: RecordingSession;
		message?: string;
		error?: string;
	}>;
	storeRecordedSession: (payload: StoreRecordedSessionInput) => Promise<{
		success: boolean;
		path?: string;
		session?: RecordingSession;
		message?: string;
		error?: string;
	}>;
	getRecordedVideoPath: () => Promise<{
		success: boolean;
		path?: string;
		message?: string;
		error?: string;
	}>;
	getAssetBasePath: () => Promise<string | null>;
	setRecordingState: (recording: boolean) => Promise<void>;
	setCursorDisplayBounds: (x: number, y: number, width: number, height: number) => Promise<void>;
	getCursorTelemetry: (videoPath?: string) => Promise<{
		success: boolean;
		samples: CursorTelemetryPoint[];
		message?: string;
		error?: string;
	}>;
	onStopRecordingFromTray: (callback: () => void) => () => void;
	openExternalUrl: (url: string) => Promise<{ success: boolean; error?: string }>;
	saveExportedVideo: (
		videoData: ArrayBuffer,
		fileName: string,
	) => Promise<{
		success: boolean;
		path?: string;
		message?: string;
		canceled?: boolean;
	}>;
	openVideoFilePicker: () => Promise<{ success: boolean; path?: string; canceled?: boolean }>;
	setCurrentVideoPath: (path: string) => Promise<{ success: boolean }>;
	setCurrentRecordingSession: (session: RecordingSession | null) => Promise<{
		success: boolean;
		session?: RecordingSession;
	}>;
	getCurrentVideoPath: () => Promise<{ success: boolean; path?: string }>;
	getCurrentRecordingSession: () => Promise<{
		success: boolean;
		session?: RecordingSession;
	}>;
	clearCurrentVideoPath: () => Promise<{ success: boolean }>;
	saveProjectFile: (
		projectData: unknown,
		suggestedName?: string,
		existingProjectPath?: string,
	) => Promise<{
		success: boolean;
		path?: string;
		message?: string;
		canceled?: boolean;
		error?: string;
	}>;
	loadProjectFile: () => Promise<{
		success: boolean;
		path?: string;
		project?: unknown;
		message?: string;
		canceled?: boolean;
		error?: string;
	}>;
	loadCurrentProjectFile: () => Promise<{
		success: boolean;
		path?: string;
		project?: unknown;
		message?: string;
		canceled?: boolean;
		error?: string;
	}>;
	onMenuLoadProject: (callback: () => void) => () => void;
	onMenuSaveProject: (callback: () => void) => () => void;
	onMenuSaveProjectAs: (callback: () => void) => () => void;
	setMicrophoneExpanded: (expanded: boolean) => void;
	setHasUnsavedChanges: (hasChanges: boolean) => void;
	onRequestSaveBeforeClose: (callback: () => Promise<boolean> | boolean) => () => void;
	setLocale: (locale: string) => Promise<void>;
	getSystemFonts: () => Promise<{
		success: boolean;
		fonts: string[];
		error?: string;
	}>;
	revealInFolder: (filePath: string) => Promise<{ success: boolean; message?: string; error?: string }>;
	getPlatform: () => Promise<string>;
	getShortcuts: () => Promise<Record<string, unknown> | null>;
	saveShortcuts: (shortcuts: Record<string, unknown>) => Promise<void>;
	hudOverlayHide: () => void;
	hudOverlayClose: () => void;
	showHudWindow: () => Promise<void>;
	closeSourceSelector: () => Promise<void>;
	updateTray: (isRecording: boolean, sourceName: string) => Promise<void>;
	// 音频相关
	getMicrophoneDevices: () => Promise<{
		success: boolean;
		devices: Array<{
			deviceId: string;
			name: string;
			isDefault: boolean;
			channels: number;
			sampleRate: number;
		}>;
		error?: string;
	}>;
	checkMicrophonePermission: () => Promise<string>;
	requestMicrophonePermission: () => Promise<boolean>;
}

// 环境检测
function isTauri(): boolean {
	return typeof window !== "undefined" && "__TAURI__" in window;
}

function isElectron(): boolean {
	return typeof window !== "undefined" && "electronAPI" in window;
}

// Tauri API 实现
async function createTauriApi(): Promise<DesktopApi> {
	const { invoke } = await import("@tauri-apps/api/core");
	const { listen } = await import("@tauri-apps/api/event");

	return {
		async readBinaryFile(filePath: string) {
			const result = await invoke<{
				success: boolean;
				data?: number[];
				path?: string;
				message?: string;
				error?: string;
			}>("read_binary_file", { filePath });
			// 将数组转换为 Uint8Array
			if (result.data) {
				return {
					...result,
					data: new Uint8Array(result.data),
				};
			}
			return result as {
				success: boolean;
				data?: Uint8Array;
				path?: string;
				message?: string;
				error?: string;
			};
		},

		async getSources(opts: SourcesOptions) {
			const result = await invoke<{ sources: ProcessedDesktopSource[] }>("get_sources", { opts });
			return result.sources;
		},

		async switchToEditor() {
			await invoke("switch_to_editor");
		},

		async openSourceSelector() {
			await invoke("open_source_selector");
		},

		async selectSource(source: ProcessedDesktopSource) {
			return await invoke<ProcessedDesktopSource | null>("select_source", { source });
		},

		async getSelectedSource() {
			return await invoke<ProcessedDesktopSource | null>("get_selected_source");
		},

		async requestCameraAccess() {
			return await invoke<{ success: boolean; granted: boolean; status: string; error?: string }>(
				"request_camera_access",
			);
		},

		async storeRecordedVideo(videoData: ArrayBuffer, fileName: string) {
			const uint8Array = new Uint8Array(videoData);
			return await invoke<{
				success: boolean;
				path?: string;
				session?: RecordingSession;
				message?: string;
				error?: string;
			}>("store_recorded_video", { videoData: Array.from(uint8Array), fileName });
		},

		async storeRecordedSession(payload: StoreRecordedSessionInput) {
			return await invoke<{
				success: boolean;
				path?: string;
				session?: RecordingSession;
				message?: string;
				error?: string;
			}>("store_recorded_session", { payload });
		},

		async getRecordedVideoPath() {
			return await invoke<{
				success: boolean;
				path?: string;
				message?: string;
				error?: string;
			}>("get_recorded_video_path");
		},

		async getAssetBasePath() {
			return await invoke<string | null>("get_asset_base_path");
		},

		async setRecordingState(recording: boolean) {
			await invoke("set_recording_state", { recording });
		},

		async setCursorDisplayBounds(x: number, y: number, width: number, height: number) {
			await invoke("set_cursor_display_bounds", { x, y, width, height });
		},

		async getCursorTelemetry(videoPath?: string) {
			return await invoke<{
				success: boolean;
				samples: CursorTelemetryPoint[];
				message?: string;
				error?: string;
			}>("get_cursor_telemetry", { videoPath });
		},

		onStopRecordingFromTray(callback: () => void) {
			let unlisten: (() => void) | null = null;
			listen("stop-recording-from-tray", () => callback()).then((fn) => {
				unlisten = fn;
			});
			return () => {
				if (unlisten) unlisten();
			};
		},

		async openExternalUrl(url: string) {
			const { openUrl } = await import("@tauri-apps/plugin-opener");
			try {
				await openUrl(url);
				return { success: true };
			} catch (error) {
				return { success: false, error: String(error) };
			}
		},

		async saveExportedVideo(videoData: ArrayBuffer, fileName: string) {
			const uint8Array = new Uint8Array(videoData);
			return await invoke<{
				success: boolean;
				path?: string;
				message?: string;
				canceled?: boolean;
			}>("save_exported_video", { videoData: Array.from(uint8Array), fileName });
		},

		async openVideoFilePicker() {
			return await invoke<{ success: boolean; path?: string; canceled?: boolean }>(
				"open_video_file_picker",
			);
		},

		async setCurrentVideoPath(path: string) {
			return await invoke<{ success: boolean }>("set_current_video_path", { path });
		},

		async setCurrentRecordingSession(session: RecordingSession | null) {
			return await invoke<{ success: boolean; session?: RecordingSession }>(
				"set_current_recording_session",
				{ session },
			);
		},

		async getCurrentVideoPath() {
			return await invoke<{ success: boolean; path?: string }>("get_current_video_path");
		},

		async getCurrentRecordingSession() {
			return await invoke<{ success: boolean; session?: RecordingSession }>(
				"get_current_recording_session",
			);
		},

		async clearCurrentVideoPath() {
			return await invoke<{ success: boolean }>("clear_current_video_path");
		},

		async saveProjectFile(projectData: unknown, suggestedName?: string, existingProjectPath?: string) {
			return await invoke<{
				success: boolean;
				path?: string;
				message?: string;
				canceled?: boolean;
				error?: string;
			}>("save_project_file", { projectData, suggestedName, existingProjectPath });
		},

		async loadProjectFile() {
			return await invoke<{
				success: boolean;
				path?: string;
				project?: unknown;
				message?: string;
				canceled?: boolean;
				error?: string;
			}>("load_project_file");
		},

		async loadCurrentProjectFile() {
			return await invoke<{
				success: boolean;
				path?: string;
				project?: unknown;
				message?: string;
				canceled?: boolean;
				error?: string;
			}>("load_current_project_file");
		},

		onMenuLoadProject(callback: () => void) {
			let unlisten: (() => void) | null = null;
			listen("menu-load-project", () => callback()).then((fn) => {
				unlisten = fn;
			});
			return () => {
				if (unlisten) unlisten();
			};
		},

		onMenuSaveProject(callback: () => void) {
			let unlisten: (() => void) | null = null;
			listen("menu-save-project", () => callback()).then((fn) => {
				unlisten = fn;
			});
			return () => {
				if (unlisten) unlisten();
			};
		},

		onMenuSaveProjectAs(callback: () => void) {
			let unlisten: (() => void) | null = null;
			listen("menu-save-project-as", () => callback()).then((fn) => {
				unlisten = fn;
			});
			return () => {
				if (unlisten) unlisten();
			};
		},

		setMicrophoneExpanded(_expanded: boolean) {
			// TODO: 实现 HUD 相关功能
			console.warn("setMicrophoneExpanded not implemented in Tauri");
		},

		setHasUnsavedChanges(hasChanges: boolean) {
			invoke("set_has_unsaved_changes", { hasChanges });
		},

		onRequestSaveBeforeClose(callback: () => Promise<boolean> | boolean) {
			let unlisten: (() => void) | null = null;
			listen("request-save-before-close", async () => {
				try {
					const shouldClose = await callback();
					await invoke("save_before_close_done", { shouldClose });
				} catch {
					await invoke("save_before_close_done", { shouldClose: false });
				}
			}).then((fn) => {
				unlisten = fn;
			});
			return () => {
				if (unlisten) unlisten();
			};
		},

		async setLocale(locale: string) {
			await invoke("set_locale", { locale });
		},

		async getSystemFonts() {
			return await invoke<{ success: boolean; fonts: string[]; error?: string }>("get_system_fonts");
		},

		async revealInFolder(filePath: string) {
			return await invoke<{ success: boolean; error?: string }>("reveal_in_folder", { filePath });
		},

		async getPlatform() {
			return await invoke<string>("get_platform");
		},

		async getShortcuts() {
			const result = await invoke<{ shortcuts: Record<string, unknown> } | null>("get_shortcuts");
			return result?.shortcuts ?? null;
		},

		async saveShortcuts(shortcuts: Record<string, unknown>) {
			await invoke("save_shortcuts", { shortcuts: { shortcuts } });
		},

		hudOverlayHide() {
			invoke("hud_overlay_hide");
		},

		hudOverlayClose() {
			invoke("hud_overlay_close");
		},

		async showHudWindow() {
			await invoke("show_hud_window");
		},

		async closeSourceSelector() {
			await invoke("close_source_selector");
		},

		async updateTray(isRecording: boolean, sourceName: string) {
			await invoke("update_tray", { isRecording, sourceName });
		},

		async getMicrophoneDevices() {
			try {
				const devices = await invoke<
					Array<{
						device_id: string;
						name: string;
						is_default: boolean;
						channels: number;
						sample_rate: number;
					}>
				>("get_microphone_devices");
				return {
					success: true,
					devices: devices.map((d) => ({
						deviceId: d.device_id,
						name: d.name,
						isDefault: d.is_default,
						channels: d.channels,
						sampleRate: d.sample_rate,
					})),
				};
			} catch (error) {
				return {
					success: false,
					devices: [],
					error: String(error),
				};
			}
		},

		async checkMicrophonePermission() {
			return await invoke<string>("check_microphone_permission");
		},

		async requestMicrophonePermission() {
			return await invoke<boolean>("request_microphone_permission");
		},
	};
}

// Electron API 实现
function createElectronApi(): DesktopApi {
	const api = (window as { electronAPI: DesktopApi }).electronAPI;
	return api;
}

// 导出 API
let _api: DesktopApi | null = null;

export async function getDesktopApi(): Promise<DesktopApi> {
	if (_api) return _api;

	if (isTauri()) {
		_api = await createTauriApi();
	} else if (isElectron()) {
		_api = createElectronApi();
	} else {
		throw new Error("Neither Tauri nor Electron environment detected");
	}

	return _api;
}

// 同步获取 API（用于已初始化的场景）
export function getDesktopApiSync(): DesktopApi | null {
	if (_api) return _api;

	if (isElectron()) {
		_api = createElectronApi();
		return _api;
	}

	return null;
}

// 直接导出 window.electronAPI 兼容访问
export const desktopApi = new Proxy({} as DesktopApi, {
	get(_target, prop: string) {
		if (isElectron()) {
			return (window as { electronAPI: Record<string, unknown> }).electronAPI[prop];
		}
		// Tauri 需要异步初始化，返回占位函数
		return async (...args: unknown[]) => {
			const api = await getDesktopApi();
			const method = (api as unknown as Record<string, unknown>)[prop];
			if (typeof method === "function") {
				return (method as (...args: unknown[]) => unknown)(...args);
			}
			return method;
		};
	},
});
