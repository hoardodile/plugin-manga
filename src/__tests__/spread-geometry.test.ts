// @vitest-environment node

import { describe, expect, it } from "vitest"
import {
	buildScreens,
	isNativeSpread,
	NATIVE_SPREAD_RATIO,
	nextScreenIndex,
	prevScreenIndex,
	type SpreadScreen,
	screenOf,
	screenPageCount,
} from "../render/spread-geometry"

function page(width?: number, height?: number) {
	return width === undefined || height === undefined ? {} : { width, height }
}

const portrait = () => page(240, 340)
const wide = () => page(600, 340)

describe("isNativeSpread", () => {
	it("treats a landscape-wide page as a native spread", () => {
		expect(isNativeSpread(wide())).toBe(true)
	})

	it("treats a portrait page as a normal page", () => {
		expect(isNativeSpread(portrait())).toBe(false)
	})

	it("returns false for unknown or unusable dimensions", () => {
		expect(isNativeSpread(undefined)).toBe(false)
		expect(isNativeSpread({})).toBe(false)
		expect(isNativeSpread(page(0, 100))).toBe(false)
	})

	it("matches the documented ratio", () => {
		expect(NATIVE_SPREAD_RATIO).toBe(1.5)
		expect(isNativeSpread(page(300, 200))).toBe(true) // exactly 1.5
		expect(isNativeSpread(page(299, 200))).toBe(false)
	})
})

describe("buildScreens", () => {
	it("pairs consecutive portrait pages", () => {
		const { screens, screenCount } = buildScreens([
			portrait(),
			portrait(),
			portrait(),
		])
		expect(screenCount).toBe(2)
		expect(screens).toEqual([
			{ first: 0, last: 1 },
			{ first: 2, last: 2 },
		])
	})

	it("gives a native-width page a screen alone", () => {
		const { screens } = buildScreens([wide(), portrait(), portrait()])
		expect(screens).toEqual([
			{ first: 0, last: 0 },
			{ first: 1, last: 2 },
		])
	})

	it("keeps a trailing orphan as a single-page screen", () => {
		const { screens, screenCount } = buildScreens([
			portrait(),
			portrait(),
			portrait(),
			portrait(),
			portrait(),
		])
		expect(screenCount).toBe(3)
		expect(screens[screens.length - 1]).toEqual({ first: 4, last: 4 })
	})

	it("handles an empty list", () => {
		const { screens, screenCount } = buildScreens([])
		expect(screenCount).toBe(0)
		expect(screens).toEqual([])
	})
})

describe("screenOf", () => {
	const screens: readonly SpreadScreen[] = [
		{ first: 0, last: 1 },
		{ first: 2, last: 2 },
		{ first: 3, last: 4 },
	]

	it("maps a page index to its screen", () => {
		expect(screenOf(screens, 0)).toBe(0)
		expect(screenOf(screens, 1)).toBe(0)
		expect(screenOf(screens, 2)).toBe(1)
		expect(screenOf(screens, 3)).toBe(2)
		expect(screenOf(screens, 4)).toBe(2)
	})

	it("clamps out-of-range to the book's ends", () => {
		expect(screenOf(screens, -1)).toBe(0)
		expect(screenOf(screens, 99)).toBe(2)
	})

	it("returns 0 with no screens", () => {
		expect(screenOf([], 0)).toBe(0)
	})
})

describe("screenPageCount", () => {
	it("counts the pages a screen holds", () => {
		expect(screenPageCount({ first: 1, last: 2 })).toBe(2)
		expect(screenPageCount({ first: 4, last: 4 })).toBe(1)
	})
})

describe("prevScreenIndex / nextScreenIndex", () => {
	const screens: readonly SpreadScreen[] = [
		{ first: 0, last: 1 },
		{ first: 2, last: 2 },
		{ first: 3, last: 4 },
	]

	it("returns undefined at the first / last screen", () => {
		expect(prevScreenIndex(screens, 0)).toBeUndefined()
		expect(nextScreenIndex(screens, screens.length - 1)).toBeUndefined()
	})

	it("returns the neighbour screen index in the middle", () => {
		expect(prevScreenIndex(screens, 1)).toBe(0)
		expect(nextScreenIndex(screens, 1)).toBe(2)
		expect(nextScreenIndex(screens, 0)).toBe(1)
		expect(prevScreenIndex(screens, 2)).toBe(1)
	})

	it("handles empty screens safely", () => {
		expect(prevScreenIndex([], 0)).toBeUndefined()
		expect(nextScreenIndex([], 0)).toBeUndefined()
	})
})

describe("buildScreens edge cases", () => {
	it("splits a mid-page wide page so it owns its screen", () => {
		const { screens } = buildScreens([portrait(), wide(), portrait()])
		expect(screens).toEqual([
			{ first: 0, last: 0 },
			{ first: 1, last: 1 },
			{ first: 2, last: 2 },
		])
	})

	it("pairs an even run into two-page screens", () => {
		const { screens, screenCount } = buildScreens([
			portrait(),
			portrait(),
			portrait(),
			portrait(),
		])
		expect(screenCount).toBe(2)
		expect(screens).toEqual([
			{ first: 0, last: 1 },
			{ first: 2, last: 3 },
		])
	})

	it("does not pair a wide page with its portrait neighbour", () => {
		const { screens } = buildScreens([wide(), portrait()])
		expect(screens).toEqual([
			{ first: 0, last: 0 },
			{ first: 1, last: 1 },
		])
	})
})
