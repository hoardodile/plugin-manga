// @vitest-environment node

import { describe, expect, it } from "vitest"
import {
	decodeMangaSettings,
	encodeMangaSettings,
	MANGA_SETTINGS_DEFAULT,
	type MangaSettings,
} from "../prefs"

const full: MangaSettings = {
	v: 2,
	defaultMode: "paged",
	pageDirection: "rtl",
	showComments: false,
	spread: true,
	fitMode: "width",
	background: "theme",
}

describe("encodeMangaSettings", () => {
	it("round-trips a full v2 settings object", () => {
		expect(decodeMangaSettings(encodeMangaSettings(full))).toEqual(full)
	})

	it("round-trips the transparent background value", () => {
		const transparent = { ...full, background: "transparent" as const }
		expect(decodeMangaSettings(encodeMangaSettings(transparent))).toEqual(
			transparent,
		)
	})
})

describe("decodeMangaSettings", () => {
	it("merges a legacy v1 object onto the defaults", () => {
		// Pre-spread v1 shape: only the original four fields.
		const v1 = JSON.stringify({
			v: 1,
			defaultMode: "paged",
			pageDirection: "rtl",
			showComments: true,
		})
		expect(decodeMangaSettings(v1)).toEqual({
			v: 2,
			defaultMode: "paged",
			pageDirection: "rtl",
			showComments: true,
			spread: false,
			fitMode: "page",
			background: "black",
		})
	})

	it("falls back per-field on unrecognised values", () => {
		const bad = JSON.stringify({
			v: 2,
			defaultMode: "weird",
			pageDirection: "sideways",
			showComments: 1,
			spread: "yes",
			fitMode: "auto",
			background: "pink",
		})
		expect(decodeMangaSettings(bad)).toEqual(MANGA_SETTINGS_DEFAULT)
	})

	it("returns undefined for malformed input", () => {
		expect(decodeMangaSettings("not json")).toBeUndefined()
		expect(decodeMangaSettings("null")).toBeUndefined()
	})
})
