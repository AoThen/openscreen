import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron, expect, test } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "../..");
const MAIN_JS = path.join(ROOT, "dist-electron-legacy/main.js");
const TEST_VIDEO = path.join(__dirname, "../fixtures/sample.webm");

// Helper to capture console logs from renderer
function setupConsoleLogging(app: Electron.Application, prefix: string) {
	app.on("window", (page) => {
		page.on("console", (msg) => {
			console.log(`[${prefix}] ${msg.type()}: ${msg.text()}`);
		});
		page.on("pageerror", (error) => {
			console.error(`[${prefix}] PAGE ERROR: ${error.message}`);
		});
	});
}

// Helper to cleanly quit the app in E2E tests
async function quitApp(app: Electron.Application) {
	try {
		// Try to use the E2E quit handler first
		const mainWindow = await app.firstWindow({ timeout: 5000 }).catch(() => null);
		if (mainWindow) {
			await mainWindow
				.evaluate(async () => {
					try {
						await (
							window as unknown as { electronAPI: { e2eQuitApp: () => Promise<void> } }
						).electronAPI.e2eQuitApp();
					} catch {
						// Ignore if handler doesn't exist
					}
				})
				.catch(() => {
					// Ignore evaluation errors during quit
				});
		}
	} catch {
		// Ignore errors in quit process
	}
	// Force close after a short delay
	await new Promise((resolve) => setTimeout(resolve, 500));
	await app.close();
}

test("exports an MP4 video from a loaded video", async () => {
	const outputPath = path.join(os.tmpdir(), `test-mp4-export-${Date.now()}.mp4`);
	console.log(`[TEST] Output path: ${outputPath}`);
	console.log(`[TEST] Test video: ${TEST_VIDEO}`);
	console.log(`[TEST] Main JS: ${MAIN_JS}`);

	// Verify test video exists
	if (!fs.existsSync(TEST_VIDEO)) {
		throw new Error(`Test video not found: ${TEST_VIDEO}`);
	}
	console.log(`[TEST] Test video size: ${fs.statSync(TEST_VIDEO).size} bytes`);

	const app = await electron.launch({
		args: [
			MAIN_JS,
			"--no-sandbox",
			"--disable-gpu-sandbox",
			"--disable-setuid-sandbox",
			"--disable-gpu",
			"--use-gl=angle",
			"--use-angle=swiftshader",
			"--enable-unsafe-swiftshader",
			"--enable-logging",
			"--v=1",
		],
		env: {
			...process.env,
			HEADLESS: process.env["HEADLESS"] ?? "true",
			DEBUG: "electron:*",
		},
	});

	app.process().stdout?.on("data", (d) => process.stdout.write(`[electron stdout] ${d}`));
	app.process().stderr?.on("data", (d) => process.stderr.write(`[electron stderr] ${d}`));

	setupConsoleLogging(app, "renderer");

	let exportError: string | null = null;
	let exportSuccess = false;

	try {
		console.log("[TEST] Step 1: Waiting for HUD window...");
		const hudWindow = await app.firstWindow({ timeout: 60_000 });
		console.log(`[TEST] HUD window URL: ${hudWindow.url()}`);
		await hudWindow.waitForLoadState("domcontentloaded");
		console.log("[TEST] HUD window loaded");

		hudWindow.on("console", (msg) => console.log(`[HUD console] ${msg.type()}: ${msg.text()}`));
		hudWindow.on("pageerror", (error) => console.error(`[HUD pageerror] ${error.message}`));

		console.log("[TEST] Step 2: Intercepting save dialog...");
		await app.evaluate(({ ipcMain }) => {
			ipcMain.removeHandler("save-exported-video");
			ipcMain.handle(
				"save-exported-video",
				(_event: Electron.IpcMainInvokeEvent, videoData: ArrayBuffer, _fileName: string) => {
					console.log(`[IPC] save-exported-video called with ${videoData.byteLength} bytes`);
					(globalThis as Record<string, unknown>)["__testExportData"] =
						Buffer.from(videoData).toString("base64");
					return { success: true, path: "pending" };
				},
			);
			console.log("[IPC] save-exported-video handler registered");
		});

		console.log("[TEST] Step 3: Setting video path and switching to editor...");
		await hudWindow.evaluate(async (videoPath: string) => {
			console.log(`[HUD] Setting video path: ${videoPath}`);
			await window.electronAPI.setCurrentVideoPath(videoPath);
			try {
				await window.electronAPI.switchToEditor();
			} catch (e) {
				console.log(`[HUD] switchToEditor threw (expected): ${e}`);
			}
		}, TEST_VIDEO);

		console.log("[TEST] Step 4: Waiting for editor window...");
		const editorWindow = await app.waitForEvent("window", {
			predicate: (w) => w.url().includes("windowType=editor"),
			timeout: 15_000,
		});
		console.log(`[TEST] Editor window URL: ${editorWindow.url()}`);

		editorWindow.on("console", (msg) => {
			const text = msg.text();
			console.log(`[Editor console] ${msg.type()}: ${text}`);
			if (
				text.includes("export failed") ||
				text.includes("Export failed") ||
				text.includes("error") ||
				text.includes("Error")
			) {
				exportError = text;
			}
		});
		editorWindow.on("pageerror", (error) => {
			console.error(`[Editor pageerror] ${error.message}\n${error.stack}`);
			exportError = error.message;
		});

		console.log("[TEST] Step 5: Reloading editor window for WebCodecs...");
		await editorWindow.reload();
		await editorWindow.waitForLoadState("domcontentloaded");

		console.log("[TEST] Step 6: Waiting for video to load...");
		await expect(editorWindow.getByText("Loading video...")).not.toBeVisible({
			timeout: 15_000,
		});
		console.log("[TEST] Video loaded successfully");

		await editorWindow.waitForTimeout(2000);

		// Verify video state
		const videoState = await editorWindow.evaluate(() => {
			const video = document.querySelector("video");
			if (!video) return { exists: false };
			return {
				exists: true,
				readyState: video.readyState,
				duration: video.duration,
				videoWidth: video.videoWidth,
				videoHeight: video.videoHeight,
			};
		});
		console.log(`[TEST] Video state: ${JSON.stringify(videoState)}`);

		if (!videoState.exists || videoState.readyState < 2) {
			throw new Error(`Video not ready: ${JSON.stringify(videoState)}`);
		}

		console.log("[TEST] Step 7: Selecting MP4 format...");
		// MP4 should be the default format, but let's verify by clicking the MP4 button if it exists
		const mp4Button = editorWindow.getByTestId("testId-mp4-format-button");
		const mp4ButtonVisible = await mp4Button.isVisible().catch(() => false);
		if (mp4ButtonVisible) {
			await mp4Button.click();
			console.log("[TEST] MP4 format selected");
		} else {
			console.log("[TEST] MP4 format button not found, assuming default");
		}

		await editorWindow.waitForTimeout(500);

		console.log("[TEST] Step 8: Clicking export button...");
		const exportButton = editorWindow.getByTestId("testId-export-button");
		await exportButton.click();
		console.log("[TEST] Export button clicked");

		console.log("[TEST] Step 9: Waiting for export result...");
		const startTime = Date.now();
		const timeout = 90_000;
		let lastProgressLog = 0;

		while (Date.now() - startTime < timeout) {
			const successToast = await editorWindow
				.getByText(/Video exported successfully|MP4 exported successfully/)
				.isVisible()
				.catch(() => false);

			const errorToast = await editorWindow
				.locator("text=/Failed to export|export failed|Error exporting/i")
				.isVisible()
				.catch(() => false);

			const exportProgress = await editorWindow
				.locator("text=/Exporting|Processing/i")
				.isVisible()
				.catch(() => false);

			if (successToast) {
				console.log("[TEST] Success toast found!");
				exportSuccess = true;
				break;
			}

			if (errorToast) {
				const errorText = await editorWindow
					.locator("text=/Failed to export|export failed|Error exporting/i")
					.textContent()
					.catch(() => "Unknown error");
				console.error(`[TEST] Error toast found: ${errorText}`);
				exportError = errorText;
				break;
			}

			const elapsedSec = Math.floor((Date.now() - startTime) / 1000);
			if (elapsedSec > 0 && elapsedSec % 5 === 0 && elapsedSec !== lastProgressLog) {
				lastProgressLog = elapsedSec;
				console.log(`[TEST] Still waiting... (${elapsedSec}s) progress=${exportProgress}`);
			}

			await editorWindow.waitForTimeout(500);
		}

		if (!exportSuccess && !exportError) {
			throw new Error(
				`Export timed out after ${timeout / 1000}s. Last export error: ${exportError || "none"}`,
			);
		}

		if (!exportSuccess) {
			throw new Error(`MP4 export failed: ${exportError || "Unknown error"}`);
		}

		console.log("[TEST] Step 10: Retrieving exported data...");
		const base64 = await app.evaluate(() => {
			const data = (globalThis as Record<string, unknown>)["__testExportData"];
			console.log(
				`[IPC] Retrieved export data: ${typeof data}, length=${typeof data === "string" ? data.length : "N/A"}`,
			);
			return data as string;
		});

		if (!base64) {
			throw new Error("No export data found in main process");
		}

		console.log(`[TEST] Export data size: ${base64.length} chars (base64)`);
		fs.writeFileSync(outputPath, Buffer.from(base64, "base64"));
		console.log(`[TEST] Written to: ${outputPath}`);

		// Verify the file on disk is a valid MP4
		expect(fs.existsSync(outputPath), `MP4 not found at ${outputPath}`).toBe(true);

		// Check for MP4/MOV magic bytes (ftyp box)
		const header = Buffer.alloc(12);
		const fd = fs.openSync(outputPath, "r");
		fs.readSync(fd, header, 0, 12, 0);
		fs.closeSync(fd);

		// MP4 files start with a size (4 bytes) followed by 'ftyp'
		const ftypOffset = header.indexOf("ftyp", 0, "ascii");
		expect(ftypOffset, "MP4 should contain 'ftyp' box").toBeGreaterThan(-1);
		console.log(`[TEST] Valid MP4 header found at offset ${ftypOffset}`);

		const stats = fs.statSync(outputPath);
		expect(stats.size).toBeGreaterThan(1024); // at least 1 KB
		console.log(`[TEST] MP4 size: ${stats.size} bytes`);

		console.log("[TEST] ✅ Test passed!");
	} finally {
		console.log("[TEST] Cleaning up...");
		await quitApp(app);
		if (fs.existsSync(outputPath)) {
			fs.unlinkSync(outputPath);
		}
	}
});
