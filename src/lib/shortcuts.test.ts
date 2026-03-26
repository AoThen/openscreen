import { describe, it, expect } from "vitest";
import {
	bindingsEqual,
	findConflict,
	formatBinding,
	matchesShortcut,
	mergeWithDefaults,
	DEFAULT_SHORTCUTS,
	SHORTCUT_ACTIONS,
	type ShortcutsConfig,
	type ShortcutBinding,
} from "./shortcuts";

describe("bindingsEqual", () => {
	it("returns true for identical bindings", () => {
		const a: ShortcutBinding = { key: "z", ctrl: true };
		const b: ShortcutBinding = { key: "z", ctrl: true };
		expect(bindingsEqual(a, b)).toBe(true);
	});

	it("returns true for same key with different case", () => {
		const a: ShortcutBinding = { key: "Z" };
		const b: ShortcutBinding = { key: "z" };
		expect(bindingsEqual(a, b)).toBe(true);
	});

	it("returns false for different keys", () => {
		const a: ShortcutBinding = { key: "z" };
		const b: ShortcutBinding = { key: "x" };
		expect(bindingsEqual(a, b)).toBe(false);
	});

	it("returns false when ctrl differs", () => {
		const a: ShortcutBinding = { key: "z", ctrl: true };
		const b: ShortcutBinding = { key: "z", ctrl: false };
		expect(bindingsEqual(a, b)).toBe(false);
	});

	it("returns false when shift differs", () => {
		const a: ShortcutBinding = { key: "z", shift: true };
		const b: ShortcutBinding = { key: "z", shift: false };
		expect(bindingsEqual(a, b)).toBe(false);
	});

	it("returns false when alt differs", () => {
		const a: ShortcutBinding = { key: "z", alt: true };
		const b: ShortcutBinding = { key: "z", alt: false };
		expect(bindingsEqual(a, b)).toBe(false);
	});

	it("handles undefined modifiers as false", () => {
		const a: ShortcutBinding = { key: "z" };
		const b: ShortcutBinding = { key: "z", ctrl: false, shift: false, alt: false };
		expect(bindingsEqual(a, b)).toBe(true);
	});
});

describe("findConflict", () => {
	it("returns null when no conflict exists", () => {
		const config = { ...DEFAULT_SHORTCUTS };
		// 'x' is not used in default shortcuts
		const binding: ShortcutBinding = { key: "x" };
		const result = findConflict(binding, "addZoom", config);
		expect(result).toBeNull();
	});

	it("detects conflict with fixed shortcut (Ctrl+Z for Undo)", () => {
		const binding: ShortcutBinding = { key: "z", ctrl: true };
		const result = findConflict(binding, "addZoom", DEFAULT_SHORTCUTS);
		expect(result).not.toBeNull();
		expect(result?.type).toBe("fixed");
		if (result?.type === "fixed") {
			expect(result.label).toBe("Undo");
		}
	});

	it("detects conflict with configurable shortcut", () => {
		const config = { ...DEFAULT_SHORTCUTS };
		// addTrim uses 't' by default
		const binding: ShortcutBinding = { key: "t" };
		const result = findConflict(binding, "addZoom", config);
		expect(result).not.toBeNull();
		expect(result?.type).toBe("configurable");
		if (result?.type === "configurable") {
			expect(result.action).toBe("addTrim");
		}
	});

	it("does not detect conflict with same action", () => {
		const binding: ShortcutBinding = { key: "z" }; // addZoom default
		const result = findConflict(binding, "addZoom", DEFAULT_SHORTCUTS);
		// Should not conflict with itself
		expect(result).toBeNull();
	});
});

describe("formatBinding", () => {
	it("formats simple key on Windows", () => {
		const binding: ShortcutBinding = { key: "a" };
		expect(formatBinding(binding, false)).toBe("A");
	});

	it("formats simple key on Mac", () => {
		const binding: ShortcutBinding = { key: "a" };
		expect(formatBinding(binding, true)).toBe("A");
	});

	it("formats Ctrl modifier on Windows", () => {
		const binding: ShortcutBinding = { key: "z", ctrl: true };
		expect(formatBinding(binding, false)).toBe("Ctrl + Z");
	});

	it("formats Cmd modifier on Mac", () => {
		const binding: ShortcutBinding = { key: "z", ctrl: true };
		expect(formatBinding(binding, true)).toBe("⌘ + Z");
	});

	it("formats Shift modifier on Windows", () => {
		const binding: ShortcutBinding = { key: "z", shift: true };
		expect(formatBinding(binding, false)).toBe("Shift + Z");
	});

	it("formats Shift modifier on Mac", () => {
		const binding: ShortcutBinding = { key: "z", shift: true };
		expect(formatBinding(binding, true)).toBe("⇧ + Z");
	});

	it("formats Alt modifier on Windows", () => {
		const binding: ShortcutBinding = { key: "z", alt: true };
		expect(formatBinding(binding, false)).toBe("Alt + Z");
	});

	it("formats Alt modifier on Mac", () => {
		const binding: ShortcutBinding = { key: "z", alt: true };
		expect(formatBinding(binding, true)).toBe("⌥ + Z");
	});

	it("formats complex binding on Windows", () => {
		const binding: ShortcutBinding = { key: "z", ctrl: true, shift: true };
		expect(formatBinding(binding, false)).toBe("Ctrl + Shift + Z");
	});

	it("formats complex binding on Mac", () => {
		const binding: ShortcutBinding = { key: "z", ctrl: true, shift: true };
		expect(formatBinding(binding, true)).toBe("⌘ + ⇧ + Z");
	});

	it("formats special keys", () => {
		expect(formatBinding({ key: " " }, false)).toBe("Space");
		expect(formatBinding({ key: "delete" }, false)).toBe("Del");
		expect(formatBinding({ key: "backspace" }, false)).toBe("⌫");
		expect(formatBinding({ key: "escape" }, false)).toBe("Esc");
		expect(formatBinding({ key: "arrowup" }, false)).toBe("↑");
		expect(formatBinding({ key: "arrowdown" }, false)).toBe("↓");
		expect(formatBinding({ key: "arrowleft" }, false)).toBe("←");
		expect(formatBinding({ key: "arrowright" }, false)).toBe("→");
	});
});

describe("matchesShortcut", () => {
	const createKeyboardEvent = (overrides: Partial<KeyboardEvent>): KeyboardEvent => {
		return {
			key: overrides.key ?? "a",
			ctrlKey: overrides.ctrlKey ?? false,
			shiftKey: overrides.shiftKey ?? false,
			altKey: overrides.altKey ?? false,
			metaKey: overrides.metaKey ?? false,
		} as KeyboardEvent;
	};

	it("matches simple key", () => {
		const e = createKeyboardEvent({ key: "a" });
		const binding: ShortcutBinding = { key: "a" };
		expect(matchesShortcut(e, binding, false)).toBe(true);
	});

	it("matches key with different case", () => {
		const e = createKeyboardEvent({ key: "A" });
		const binding: ShortcutBinding = { key: "a" };
		expect(matchesShortcut(e, binding, false)).toBe(true);
	});

	it("does not match different key", () => {
		const e = createKeyboardEvent({ key: "b" });
		const binding: ShortcutBinding = { key: "a" };
		expect(matchesShortcut(e, binding, false)).toBe(false);
	});

	it("matches Ctrl on Windows", () => {
		const e = createKeyboardEvent({ key: "z", ctrlKey: true });
		const binding: ShortcutBinding = { key: "z", ctrl: true };
		expect(matchesShortcut(e, binding, false)).toBe(true);
	});

	it("matches Meta (Cmd) on Mac", () => {
		const e = createKeyboardEvent({ key: "z", metaKey: true });
		const binding: ShortcutBinding = { key: "z", ctrl: true };
		expect(matchesShortcut(e, binding, true)).toBe(true);
	});

	it("does not match Ctrl on Mac when binding expects Ctrl", () => {
		const e = createKeyboardEvent({ key: "z", ctrlKey: true });
		const binding: ShortcutBinding = { key: "z", ctrl: true };
		// On Mac, ctrlKey is NOT the primary modifier (metaKey is)
		expect(matchesShortcut(e, binding, true)).toBe(false);
	});

	it("matches Shift modifier", () => {
		const e = createKeyboardEvent({ key: "z", shiftKey: true });
		const binding: ShortcutBinding = { key: "z", shift: true };
		expect(matchesShortcut(e, binding, false)).toBe(true);
	});

	it("matches Alt modifier", () => {
		const e = createKeyboardEvent({ key: "z", altKey: true });
		const binding: ShortcutBinding = { key: "z", alt: true };
		expect(matchesShortcut(e, binding, false)).toBe(true);
	});

	it("requires all modifiers to match", () => {
		const e = createKeyboardEvent({ key: "z", ctrlKey: true, shiftKey: true });
		const binding: ShortcutBinding = { key: "z", ctrl: true, shift: true };
		expect(matchesShortcut(e, binding, false)).toBe(true);
	});

	it("fails if extra modifier pressed", () => {
		const e = createKeyboardEvent({ key: "z", ctrlKey: true, shiftKey: true });
		const binding: ShortcutBinding = { key: "z", ctrl: true };
		expect(matchesShortcut(e, binding, false)).toBe(false);
	});
});

describe("mergeWithDefaults", () => {
	it("returns defaults for empty partial", () => {
		const result = mergeWithDefaults({});
		expect(result).toEqual(DEFAULT_SHORTCUTS);
	});

	it("merges provided values", () => {
		const partial: Partial<ShortcutsConfig> = {
			addZoom: { key: "x", ctrl: true },
		};
		const result = mergeWithDefaults(partial);
		expect(result.addZoom).toEqual({ key: "x", ctrl: true });
		expect(result.addTrim).toEqual(DEFAULT_SHORTCUTS.addTrim);
	});

	it("ignores invalid action keys", () => {
		const result = mergeWithDefaults({ invalid: { key: "x" } } as unknown as Partial<ShortcutsConfig>);
		expect(result).toEqual(DEFAULT_SHORTCUTS);
	});
});

describe("SHORTCUT_ACTIONS", () => {
	it("contains all expected actions", () => {
		expect(SHORTCUT_ACTIONS).toContain("addZoom");
		expect(SHORTCUT_ACTIONS).toContain("addTrim");
		expect(SHORTCUT_ACTIONS).toContain("addSpeed");
		expect(SHORTCUT_ACTIONS).toContain("addAnnotation");
		expect(SHORTCUT_ACTIONS).toContain("addHighlight");
		expect(SHORTCUT_ACTIONS).toContain("addKeyframe");
		expect(SHORTCUT_ACTIONS).toContain("deleteSelected");
		expect(SHORTCUT_ACTIONS).toContain("playPause");
	});

	it("has 8 actions", () => {
		expect(SHORTCUT_ACTIONS).toHaveLength(8);
	});
});

describe("DEFAULT_SHORTCUTS", () => {
	it("has entry for each action", () => {
		for (const action of SHORTCUT_ACTIONS) {
			expect(DEFAULT_SHORTCUTS[action]).toBeDefined();
		}
	});
});
