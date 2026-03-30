import path from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserWindow, screen } from "electron";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const APP_ROOT = path.join(__dirname, "..");
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const RENDERER_DIST = path.join(APP_ROOT, "dist");
const HEADLESS = process.env["HEADLESS"] === "true";

export function createHudOverlayWindow(): BrowserWindow {
	// Use try-catch for screen operations in case they fail in headless environments
	let workArea = { x: 0, y: 0, width: 1920, height: 1080 };
	try {
		const primaryDisplay = screen.getPrimaryDisplay();
		if (primaryDisplay?.workArea) {
			workArea = primaryDisplay.workArea;
		}
	} catch (error) {
		console.error("Failed to get primary display, using defaults:", error);
	}

	const windowWidth = 500;
	const windowHeight = 155;

	const x = Math.floor(workArea.x + (workArea.width - windowWidth) / 2);
	const y = Math.floor(workArea.y + workArea.height - windowHeight - 5);

	const win = new BrowserWindow({
		width: windowWidth,
		height: windowHeight,
		minWidth: 500,
		maxWidth: 500,
		minHeight: 155,
		maxHeight: 155,
		x: x,
		y: y,
		frame: false,
		// Transparent windows may not work in headless/CI environments
		transparent: !HEADLESS,
		resizable: false,
		alwaysOnTop: true,
		skipTaskbar: true,
		hasShadow: false,
		show: !HEADLESS,
		// Set a background color for headless mode
		backgroundColor: HEADLESS ? "#1a1a1c" : undefined,
		webPreferences: {
			preload: path.join(__dirname, "preload.mjs"),
			nodeIntegration: false,
			contextIsolation: true,
			backgroundThrottling: false,
			spellcheck: false,
		},
	});

	win.webContents.on("did-finish-load", () => {
		if (win?.isDestroyed()) return;
		try {
			win?.webContents.send("main-process-message", new Date().toLocaleString());
		} catch (error) {
			// Window may have been destroyed during load
			console.warn("Failed to send main-process-message:", error);
		}
	});

	if (VITE_DEV_SERVER_URL) {
		win.loadURL(VITE_DEV_SERVER_URL + "?windowType=hud-overlay");
	} else {
		win.loadFile(path.join(RENDERER_DIST, "index.html"), {
			query: { windowType: "hud-overlay" },
		});
	}

	return win;
}

export function createEditorWindow(): BrowserWindow {
	const isMac = process.platform === "darwin";

	const win = new BrowserWindow({
		width: 1200,
		height: 800,
		minWidth: 800,
		minHeight: 600,
		...(isMac && {
			titleBarStyle: "hiddenInset",
			trafficLightPosition: { x: 12, y: 12 },
		}),
		transparent: false,
		resizable: true,
		alwaysOnTop: false,
		skipTaskbar: false,
		title: "OpenScreen",
		backgroundColor: "#000000",
		show: !HEADLESS,
		webPreferences: {
			preload: path.join(__dirname, "preload.mjs"),
			nodeIntegration: false,
			contextIsolation: true,
			webSecurity: false,
			backgroundThrottling: false,
			spellcheck: false,
		},
	});

	// Maximize the window by default (skip in headless mode to avoid potential issues)
	if (!HEADLESS) {
		win.maximize();
	}

	win.webContents.on("did-finish-load", () => {
		if (win?.isDestroyed()) return;
		try {
			win?.webContents.send("main-process-message", new Date().toLocaleString());
		} catch (error) {
			// Window may have been destroyed during load
			console.warn("Failed to send main-process-message:", error);
		}
	});

	if (VITE_DEV_SERVER_URL) {
		win.loadURL(VITE_DEV_SERVER_URL + "?windowType=editor");
	} else {
		win.loadFile(path.join(RENDERER_DIST, "index.html"), {
			query: { windowType: "editor" },
		});
	}

	return win;
}

export function createSourceSelectorWindow(): BrowserWindow {
	// Use try-catch for screen operations in case they fail in headless environments
	let workAreaSize = { width: 1920, height: 1080 };
	try {
		const primaryDisplay = screen.getPrimaryDisplay();
		if (primaryDisplay?.workAreaSize) {
			workAreaSize = primaryDisplay.workAreaSize;
		}
	} catch (error) {
		console.error("Failed to get primary display, using defaults:", error);
	}
	const { width, height } = workAreaSize;

	const win = new BrowserWindow({
		width: 620,
		height: 420,
		minHeight: 350,
		maxHeight: 500,
		x: Math.round((width - 620) / 2),
		y: Math.round((height - 420) / 2),
		frame: false,
		resizable: false,
		alwaysOnTop: true,
		// Transparent windows may not work in headless/CI environments
		transparent: !HEADLESS,
		// Set a background color for headless mode
		backgroundColor: HEADLESS ? "#1a1a1c" : "#00000000",
		show: !HEADLESS,
		webPreferences: {
			preload: path.join(__dirname, "preload.mjs"),
			nodeIntegration: false,
			contextIsolation: true,
			spellcheck: false,
		},
	});

	if (VITE_DEV_SERVER_URL) {
		win.loadURL(VITE_DEV_SERVER_URL + "?windowType=source-selector");
	} else {
		win.loadFile(path.join(RENDERER_DIST, "index.html"), {
			query: { windowType: "source-selector" },
		});
	}

	return win;
}
