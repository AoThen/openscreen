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

test("exports a GIF from a loaded video", async () => {
	const outputPath = path.join(os.tmpdir(), `test-gif-export-${Date.now()}.gif`);
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
			// Required in CI sandbox environments (GitHub Actions, Docker, etc.)
			"--no-sandbox",
			"--disable-gpu-sandbox",
			"--disable-setuid-sandbox",
			// Disable GPU in CI environments (no real GPU available)
			"--disable-gpu",
			// Use OSMesa for software rendering in headless environments
			"--use-gl=angle",
			"--use-angle=swiftshader",
			// Enable SwiftShader for WebGL support in headless environments
			"--enable-unsafe-swiftshader",
			// Enable more verbose logging
			"--enable-logging",
			"--v=1",
		],
		env: {
			...process.env,
			// Set HEADLESS=false to show windows while debugging.
			HEADLESS: process.env["HEADLESS"] ?? "true",
			// Enable debug logging
			DEBUG: "electron:*",
		},
	});

	// Print all main-process stdout/stderr so failures are diagnosable.
	app.process().stdout?.on("data", (d) => process.stdout.write(`[electron stdout] ${d}`));
	app.process().stderr?.on("data", (d) => process.stderr.write(`[electron stderr] ${d}`));

	// Setup console logging for all windows
	setupConsoleLogging(app, "renderer");

	// Track export state
	let exportError: string | null = null;
	let exportSuccess = false;

	try {
		console.log("[TEST] Step 1: Waiting for HUD window...");
		// ── 1. Wait for the HUD overlay window.
		const hudWindow = await app.firstWindow({ timeout: 60_000 });
		console.log(`[TEST] HUD window URL: ${hudWindow.url()}`);
		await hudWindow.waitForLoadState("domcontentloaded");
		console.log("[TEST] HUD window loaded");

		// Setup console logging for HUD window
		hudWindow.on("console", (msg) => console.log(`[HUD console] ${msg.type()}: ${msg.text()}`));
		hudWindow.on("pageerror", (error) => console.error(`[HUD pageerror] ${error.message}`));

		console.log("[TEST] Step 2: Intercepting save dialog...");
		// ── 2. Intercept the native save dialog in the main process.
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
		// ── 3. Switch to the editor window.
		const editorWindow = await app.waitForEvent("window", {
			predicate: (w) => w.url().includes("windowType=editor"),
			timeout: 15_000,
		});
		console.log(`[TEST] Editor window URL: ${editorWindow.url()}`);

		// Setup console logging for editor window with detailed error tracking
		editorWindow.on("console", (msg) => {
			const text = msg.text();
			console.log(`[Editor console] ${msg.type()}: ${text}`);
			// Track export errors from console - capture more patterns
			if (
				text.includes("export failed") ||
				text.includes("Export failed") ||
				text.includes("error") ||
				text.includes("Error") ||
				text.includes("EBML") ||
				text.includes("Cannot open") ||
				text.includes("GPU stall") ||
				text.includes("WebGL")
			) {
				exportError = text;
			}
		});
		editorWindow.on("pageerror", (error) => {
			console.error(`[Editor pageerror] ${error.message}\n${error.stack}`);
			exportError = error.message;
		});

		console.log("[TEST] Step 5: Reloading editor window for WebCodecs...");
		// WebCodecs may not be registered on first load
		await editorWindow.reload();
		await editorWindow.waitForLoadState("domcontentloaded");

		console.log("[TEST] Step 6: Waiting for video to load...");
		await expect(editorWindow.getByText("Loading video...")).not.toBeVisible({
			timeout: 15_000,
		});
		console.log("[TEST] Video loaded successfully");

		// Wait for video to be fully ready
		await editorWindow.waitForTimeout(2000);

		// Check WebGL support with detailed diagnostics
		const webglInfo = await editorWindow.evaluate(() => {
			const canvas = document.createElement("canvas");
			const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
			if (!gl) return { supported: false, reason: "Could not get WebGL context" };

			const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");

			// Test basic WebGL operations
			let webglWorking = true;
			let webglError: string | null = null;
			try {
				// Try a simple readPixels to test if WebGL is functional
				const pixels = new Uint8Array(4);
				gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
				const err = gl.getError();
				if (err !== gl.NO_ERROR) {
					webglWorking = false;
					webglError = `WebGL error after readPixels: ${err}`;
				}
			} catch (e) {
				webglWorking = false;
				webglError = `WebGL readPixels threw: ${e}`;
			}

			return {
				supported: true,
				renderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : "unknown",
				vendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : "unknown",
				webglWorking,
				webglError,
				maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
				maxRenderbufferSize: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
			};
		});
		console.log(`[TEST] WebGL info: ${JSON.stringify(webglInfo, null, 2)}`);

		// Check if video element exists and is ready
		const videoState = await editorWindow.evaluate(() => {
			const video = document.querySelector("video");
			if (!video) return { exists: false };
			return {
				exists: true,
				readyState: video.readyState,
				duration: video.duration,
				videoWidth: video.videoWidth,
				videoHeight: video.videoHeight,
				error: video.error?.message,
				src: video.src || video.currentSrc,
			};
		});
		console.log(`[TEST] Video state: ${JSON.stringify(videoState)}`);

		if (!videoState.exists || videoState.readyState < 2) {
			throw new Error(`Video not ready: ${JSON.stringify(videoState)}`);
		}

		// Verify the video path is correctly set
		const videoPathCheck = await editorWindow.evaluate(async () => {
			try {
				const result = await window.electronAPI.getCurrentVideoPath();
				return result;
			} catch (e) {
				return { error: String(e) };
			}
		});
		console.log(`[TEST] Current video path: ${JSON.stringify(videoPathCheck)}`);

		console.log("[TEST] Step 7: Selecting GIF format...");
		// ── 5. Select GIF as the export format.
		const gifButton = editorWindow.getByTestId("testId-gif-format-button");
		await gifButton.click();
		console.log("[TEST] GIF format selected");

		await editorWindow.waitForTimeout(500);

		console.log("[TEST] Step 8: Clicking export button...");
		const exportButton = editorWindow.getByTestId("testId-export-button");
		await exportButton.click();
		console.log("[TEST] Export button clicked");

		console.log("[TEST] Step 9: Waiting for export result...");
		// ── 6. Wait for the success toast or error message.
		const startTime = Date.now();
		const timeout = 90_000;
		let lastProgressLog = 0;

		while (Date.now() - startTime < timeout) {
			// Check for success toast
			const successToast = await editorWindow
				.getByText("GIF exported successfully")
				.isVisible()
				.catch(() => false);

			// Check for error toast
			const errorToast = await editorWindow
				.locator("text=/Failed to export|export failed|Error exporting/i")
				.isVisible()
				.catch(() => false);

			// Check for export progress
			const exportProgress = await editorWindow
				.locator("text=/Exporting|Compiling GIF|Processing/i")
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

			// Log progress every 5 seconds with more detail
			const elapsedSec = Math.floor((Date.now() - startTime) / 1000);
			if (elapsedSec > 0 && elapsedSec % 5 === 0 && elapsedSec !== lastProgressLog) {
				lastProgressLog = elapsedSec;
				console.log(`[TEST] Still waiting... (${elapsedSec}s) progress=${exportProgress}`);

				// Check if there are any errors in the page
				const pageErrors = await editorWindow.evaluate(() => {
					const errors: string[] = [];
					// Check for WebGL context loss
					const canvas = document.querySelector("canvas");
					if (canvas) {
						const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
						if (!gl || gl.isContextLost()) {
							errors.push("WebGL context lost");
						}
					}
					return errors;
				});
				if (pageErrors.length > 0) {
					console.error(`[TEST] Page errors detected: ${pageErrors.join(", ")}`);
				}
			}

			await editorWindow.waitForTimeout(500);
		}

		if (!exportSuccess && !exportError) {
			// Timeout - capture page state for debugging
			console.error("[TEST] Export timeout - capturing page state...");
			const pageContent = await editorWindow.evaluate(() => {
				return {
					url: window.location.href,
					bodyText: document.body.innerText.substring(0, 1000),
					toasts: Array.from(document.querySelectorAll("[role='alert'], [data-sonner-toast]"))
						.map((el) => el.textContent)
						.join(", "),
					buttons: Array.from(document.querySelectorAll("button"))
						.map((el) => el.textContent)
						.slice(0, 10)
						.join(", "),
				};
			});
			console.error(`[TEST] Page state: ${JSON.stringify(pageContent, null, 2)}`);

			throw new Error(
				`Export timed out after ${timeout / 1000}s. Last export error: ${exportError || "none"}`,
			);
		}

		if (!exportSuccess) {
			throw new Error(
				`GIF export failed: ${exportError || "Unknown error - check WebGL compatibility"}`,
			);
		}

		console.log("[TEST] Step 10: Retrieving exported data...");
		// ── 7. Write the captured buffer from the main-process global to disk.
		const base64 = await app.evaluate(() => {
			const data = (globalThis as Record<string, unknown>)["__testExportData"];
			console.log(
				`[IPC] Retrieved export data: ${typeof data}, length=${typeof data === "string" ? data.length : "N/A"}`,
			);
			return data as string;
		});

		if (!base64) {
			throw new Error(
				"No export data found in main process - IPC handler may not have been called",
			);
		}

		console.log(`[TEST] Export data size: ${base64.length} chars (base64)`);
		fs.writeFileSync(outputPath, Buffer.from(base64, "base64"));
		console.log(`[TEST] Written to: ${outputPath}`);

		// ── 8. Verify the file on disk is a valid GIF.
		expect(fs.existsSync(outputPath), `GIF not found at ${outputPath}`).toBe(true);

		const header = Buffer.alloc(6);
		const fd = fs.openSync(outputPath, "r");
		fs.readSync(fd, header, 0, 6, 0);
		fs.closeSync(fd);

		// GIF magic bytes are either "GIF87a" or "GIF89a"
		expect(header.toString("ascii")).toMatch(/^GIF8[79]a/);
		console.log(`[TEST] Valid GIF header: ${header.toString("ascii")}`);

		const stats = fs.statSync(outputPath);
		expect(stats.size).toBeGreaterThan(1024); // at least 1 KB
		console.log(`[TEST] GIF size: ${stats.size} bytes`);

		console.log("[TEST] ✅ Test passed!");
	} finally {
		console.log("[TEST] Cleaning up...");
		await app.close();
		if (fs.existsSync(outputPath)) {
			fs.unlinkSync(outputPath);
		}
	}
});
