// @vitest-environment node

import type { Message } from "@hoardodile/sdk-web"
import { describe, expect, it } from "vitest"
import {
	buildPerPageComments,
	clampZoom,
	estimatePageHeight,
	pageImageUrl,
	pageSrcOf,
	readMangaPreviews,
	resolveActiveIndex,
	resolveRenderWidth,
} from "../render/helpers"
import type { MangaPage } from "../shared"

function page(filename: string, overrides: Partial<MangaPage> = {}): MangaPage {
	return {
		filename,
		type: "image",
		preview: true,
		chapterIndex: 0,
		chapterTitle: undefined,
		source: "file",
		...overrides,
	}
}

describe("readMangaPreviews", () => {
	it("parses new-format MangaPage[] from sourceMeta", () => {
		const meta = {
			width: 800,
			height: 1200,
			previews: [
				page("a.jpg", { width: 800, height: 1200, preview: true }),
				page("b.jpg", { width: 600, height: 900, preview: false }),
			],
		}
		const result = readMangaPreviews(meta)
		expect(result).toEqual([
			{
				filename: "a.jpg",
				type: "image",
				width: 800,
				height: 1200,
				preview: true,
				chapterIndex: 0,
				chapterTitle: undefined,
				source: "file",
			},
			{
				filename: "b.jpg",
				type: "image",
				width: 600,
				height: 900,
				preview: false,
				chapterIndex: 0,
				chapterTitle: undefined,
				source: "file",
			},
		])
	})

	it("returns undefined when meta is undefined", () => {
		expect(readMangaPreviews(undefined)).toBeUndefined()
	})

	it("returns an empty array when previews is an empty array", () => {
		expect(readMangaPreviews({ previews: [] })).toEqual([])
	})
})

describe("pageSrcOf", () => {
	it("resolves every page through the file URL preserving outer!inner", () => {
		// A source "cache" page no longer routes to an extraction URL — the
		// single `resolveFileUrl` handles materialized non-zip entries too,
		// and the `!` separator stays intact (no `!` -> `/` conversion).
		const src = pageSrcOf(
			(filename) => `url:${filename}`,
			page("book.cbz!Ch1/001.jpg", { source: "cache", preview: false }),
			false,
		)
		expect(src).toBe("url:book.cbz!Ch1/001.jpg")
	})

	it("applies the preview/original decision", () => {
		expect(
			pageSrcOf(
				(_filename, size) => size ?? "original",
				page("a.jpg", { preview: true }),
				false,
			),
		).toBe("preview")
		expect(
			pageSrcOf(
				(_filename, size) => size ?? "original",
				page("a.jpg", { preview: true }),
				true,
			),
		).toBe("original")
	})
})

describe("resolveRenderWidth", () => {
	it("caps the column so pages never stretch across a wide viewport", () => {
		expect(
			resolveRenderWidth({ containerWidth: 1600, zoom: 1, maxWidth: 900 }),
		).toBe(900)
	})

	it("scales the cap with zoom but never past the container", () => {
		expect(
			resolveRenderWidth({ containerWidth: 1600, zoom: 1.5, maxWidth: 900 }),
		).toBe(1350)
		expect(
			resolveRenderWidth({ containerWidth: 1000, zoom: 4, maxWidth: 900 }),
		).toBe(1000)
	})

	it("reports zero before the first layout", () => {
		expect(
			resolveRenderWidth({ containerWidth: 0, zoom: 2, maxWidth: 900 }),
		).toBe(0)
	})
})

describe("clampZoom", () => {
	it("keeps zoom inside the allowed range", () => {
		expect(clampZoom(0.2, 1, 4)).toBe(1)
		expect(clampZoom(9, 1, 4)).toBe(4)
		expect(clampZoom(2.5, 1, 4)).toBe(2.5)
	})
})

describe("buildPerPageComments", () => {
	function message(id: string, anchorData?: unknown): Message {
		return {
			id,
			body: `body-${id}`,
			createdAt: 0,
			charIds: [],
			resIds: ["r-1"],
			likeCount: 0,
			dislikeCount: 0,
			replyCount: 0,
			anchor:
				anchorData === undefined
					? undefined
					: { resId: "r-1", data: anchorData },
		}
	}

	it("groups comments by the page they anchor to", () => {
		const grouped = buildPerPageComments([
			message("a", { filename: "1.png", chapter: 0, page: 0 }),
			message("b", { filename: "2.png", chapter: 1, page: 0 }),
			message("c", { filename: "1.png", chapter: 0, page: 1 }),
		])
		expect(grouped.get("1.png")?.map((m) => m.id)).toEqual(["a", "c"])
		expect(grouped.get("2.png")?.map((m) => m.id)).toEqual(["b"])
	})

	it("drops comments without a decodable page anchor", () => {
		const grouped = buildPerPageComments([
			message("a", { nonsense: true }),
			message("b"),
		])
		expect(grouped.size).toBe(0)
	})
})

describe("pageImageUrl", () => {
	function resolve(filename: string, size: "preview" | "original"): string {
		return `${size}:${filename}`
	}

	it("requests the preview variant when the page is preview-worthy", () => {
		expect(pageImageUrl(resolve, page("a.jpg", { preview: true }), false)).toBe(
			"preview:a.jpg",
		)
	})

	it("serves the original when the user asked for originals", () => {
		expect(pageImageUrl(resolve, page("a.jpg", { preview: true }), true)).toBe(
			"original:a.jpg",
		)
	})

	it("serves the original when the page has no preview variant", () => {
		expect(
			pageImageUrl(resolve, page("a.jpg", { preview: false }), false),
		).toBe("original:a.jpg")
	})
})

describe("estimatePageHeight", () => {
	it("derives the height from the page dimensions", () => {
		expect(
			estimatePageHeight(page("a.jpg", { width: 100, height: 200 }), 300),
		).toBe(600)
	})

	it("falls back to the generic portrait aspect without dimensions", () => {
		expect(estimatePageHeight(page("a.jpg"), 100)).toBe(140)
	})

	it("uses the same fallback for a placeholder slot", () => {
		expect(estimatePageHeight(undefined, 100)).toBe(140)
	})

	it("reports zero before the first layout", () => {
		expect(estimatePageHeight(undefined, 0)).toBe(0)
	})
})

describe("resolveActiveIndex", () => {
	const items = [
		{ index: 0, end: 100 },
		{ index: 1, end: 250 },
		{ index: 2, end: 400 },
	]

	it("picks the page whose bottom edge is below the scroll position", () => {
		expect(resolveActiveIndex(0, items)).toBe(0)
		expect(resolveActiveIndex(99, items)).toBe(0)
		expect(resolveActiveIndex(100, items)).toBe(1)
		expect(resolveActiveIndex(249, items)).toBe(1)
		expect(resolveActiveIndex(250, items)).toBe(2)
	})

	it("stays on the last page past the end", () => {
		expect(resolveActiveIndex(500, items)).toBe(2)
	})

	it("returns 0 without items", () => {
		expect(resolveActiveIndex(100, [])).toBe(0)
	})
})
