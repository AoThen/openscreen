import { describe, expect, it } from "vitest";
import {
	normalizeProjectMedia,
	normalizeRecordingSession,
	type ProjectMedia,
	type RecordingSession,
} from "./recordingSession";

describe("normalizeProjectMedia", () => {
	it("returns null for null input", () => {
		expect(normalizeProjectMedia(null)).toBeNull();
	});

	it("returns null for undefined input", () => {
		expect(normalizeProjectMedia(undefined)).toBeNull();
	});

	it("returns null for non-object input", () => {
		expect(normalizeProjectMedia("string")).toBeNull();
		expect(normalizeProjectMedia(123)).toBeNull();
	});

	it("returns null for empty object", () => {
		expect(normalizeProjectMedia({})).toBeNull();
	});

	it("returns null when screenVideoPath is missing", () => {
		expect(normalizeProjectMedia({ webcamVideoPath: "/path/to/webcam.webm" })).toBeNull();
	});

	it("returns null when screenVideoPath is empty string", () => {
		expect(normalizeProjectMedia({ screenVideoPath: "" })).toBeNull();
	});

	it("returns null when screenVideoPath is whitespace only", () => {
		expect(normalizeProjectMedia({ screenVideoPath: "   " })).toBeNull();
	});

	it("returns valid ProjectMedia with only screenVideoPath", () => {
		const result = normalizeProjectMedia({ screenVideoPath: "/path/to/screen.webm" });
		expect(result).toEqual({ screenVideoPath: "/path/to/screen.webm" });
	});

	it("returns valid ProjectMedia with both paths", () => {
		const result = normalizeProjectMedia({
			screenVideoPath: "/path/to/screen.webm",
			webcamVideoPath: "/path/to/webcam.webm",
		});
		expect(result).toEqual({
			screenVideoPath: "/path/to/screen.webm",
			webcamVideoPath: "/path/to/webcam.webm",
		});
	});

	it("trims whitespace from paths", () => {
		const result = normalizeProjectMedia({
			screenVideoPath: "  /path/to/screen.webm  ",
			webcamVideoPath: "  /path/to/webcam.webm  ",
		});
		expect(result).toEqual({
			screenVideoPath: "/path/to/screen.webm",
			webcamVideoPath: "/path/to/webcam.webm",
		});
	});

	it("ignores webcamVideoPath if empty", () => {
		const result = normalizeProjectMedia({
			screenVideoPath: "/path/to/screen.webm",
			webcamVideoPath: "",
		});
		expect(result).toEqual({ screenVideoPath: "/path/to/screen.webm" });
	});
});

describe("normalizeRecordingSession", () => {
	it("returns null for null input", () => {
		expect(normalizeRecordingSession(null)).toBeNull();
	});

	it("returns null for undefined input", () => {
		expect(normalizeRecordingSession(undefined)).toBeNull();
	});

	it("returns null when screenVideoPath is missing", () => {
		expect(normalizeRecordingSession({ createdAt: Date.now() })).toBeNull();
	});

	it("returns valid RecordingSession with default createdAt", () => {
		const before = Date.now();
		const result = normalizeRecordingSession({ screenVideoPath: "/path/to/screen.webm" });
		const after = Date.now();

		expect(result).not.toBeNull();
		expect(result?.screenVideoPath).toBe("/path/to/screen.webm");
		expect(result?.createdAt).toBeGreaterThanOrEqual(before);
		expect(result?.createdAt).toBeLessThanOrEqual(after);
	});

	it("preserves valid createdAt timestamp", () => {
		const timestamp = 1700000000000;
		const result = normalizeRecordingSession({
			screenVideoPath: "/path/to/screen.webm",
			createdAt: timestamp,
		});

		expect(result).toEqual({
			screenVideoPath: "/path/to/screen.webm",
			createdAt: timestamp,
		});
	});

	it("uses default createdAt for invalid values", () => {
		const before = Date.now();
		const result = normalizeRecordingSession({
			screenVideoPath: "/path/to/screen.webm",
			createdAt: "invalid",
		} as unknown as RecordingSession);
		const after = Date.now();

		expect(result?.createdAt).toBeGreaterThanOrEqual(before);
		expect(result?.createdAt).toBeLessThanOrEqual(after);
	});

	it("uses default createdAt for NaN", () => {
		const before = Date.now();
		const result = normalizeRecordingSession({
			screenVideoPath: "/path/to/screen.webm",
			createdAt: NaN,
		});
		const after = Date.now();

		expect(result?.createdAt).toBeGreaterThanOrEqual(before);
		expect(result?.createdAt).toBeLessThanOrEqual(after);
	});

	it("uses default createdAt for Infinity", () => {
		const before = Date.now();
		const result = normalizeRecordingSession({
			screenVideoPath: "/path/to/screen.webm",
			createdAt: Infinity,
		});
		const after = Date.now();

		expect(result?.createdAt).toBeGreaterThanOrEqual(before);
		expect(result?.createdAt).toBeLessThanOrEqual(after);
	});

	it("includes webcamVideoPath when present", () => {
		const result = normalizeRecordingSession({
			screenVideoPath: "/path/to/screen.webm",
			webcamVideoPath: "/path/to/webcam.webm",
			createdAt: 1700000000000,
		});

		expect(result).toEqual({
			screenVideoPath: "/path/to/screen.webm",
			webcamVideoPath: "/path/to/webcam.webm",
			createdAt: 1700000000000,
		});
	});
});
