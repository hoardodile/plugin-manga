// @vitest-environment node

import { describe, expect, it } from "vitest"
import { tapZoneFor, turnForZone } from "../render/paged-geometry"

describe("tapZoneFor", () => {
	it("maps the left and right thirds to their wings", () => {
		expect(tapZoneFor(900, 100)).toBe("left")
		expect(tapZoneFor(900, 800)).toBe("right")
	})

	it("reserves the middle third as the centre strip", () => {
		expect(tapZoneFor(900, 300)).toBe("center")
		expect(tapZoneFor(900, 450)).toBe("center")
		expect(tapZoneFor(900, 599)).toBe("center")
	})

	it("treats the exact strip edges as centre", () => {
		// centre strip = 300..600 for a 900px viewport
		expect(tapZoneFor(900, 300)).toBe("center")
		expect(tapZoneFor(900, 600)).toBe("center")
	})

	it("clamps offsets outside the viewport", () => {
		expect(tapZoneFor(900, -50)).toBe("left")
		expect(tapZoneFor(900, 950)).toBe("right")
	})
})

describe("turnForZone", () => {
	it("advances on the right wing in LTR and the left wing in RTL", () => {
		expect(turnForZone("ltr", "right")).toBe("next")
		expect(turnForZone("ltr", "left")).toBe("prev")
		expect(turnForZone("rtl", "left")).toBe("next")
		expect(turnForZone("rtl", "right")).toBe("prev")
	})

	it("never turns from the centre strip", () => {
		expect(turnForZone("ltr", "center")).toBeUndefined()
		expect(turnForZone("rtl", "center")).toBeUndefined()
	})
})
