// @vitest-environment node

import type { FileType } from "@hoardodile/sdk-server"
import { describe, expect, it } from "vitest"
import {
	buildBook,
	chapterOf,
	isChapterEnd,
	linearIndexOf,
	nextPageIndex,
	prevPageIndex,
} from "../core/book.ts"
import {
	buildChapterIndex,
	chapterTitleOf,
	parentDir,
} from "../core/chapters.ts"
import { classifySource, isArchiveType } from "../core/format.ts"
import {
	clampPosition,
	decodeMangaPosition,
	encodeMangaPosition,
	type MangaPosition,
	recordChapterProgress,
} from "../core/position.ts"
import {
	assignChapters,
	buildSourceMeta,
	pagesFromExtraction,
	pagesFromListing,
	sortPagePaths,
} from "../core/records.ts"

function typeOf(ext: string): FileType | undefined {
	return (
		{
			".jpg": {
				mime: "image/jpeg",
				ext: ".jpg",
				kind: "image",
				source: "magic",
			},
			".cbz": {
				mime: "application/vnd.comicbook+zip",
				ext: ".cbz",
				kind: "other",
				source: "magic",
			},
			".zip": {
				mime: "application/zip",
				ext: ".zip",
				kind: "other",
				source: "magic",
			},
			".tar": {
				mime: "application/x-tar",
				ext: ".tar",
				kind: "other",
				source: "magic",
			},
			".cbt": {
				mime: "application/x-tar",
				ext: ".cbt",
				kind: "other",
				source: "magic",
			},
			".cbr": {
				mime: "application/vnd.comicbook-rar",
				ext: ".cbr",
				kind: "other",
				source: "magic",
			},
			".rar": {
				mime: "application/vnd.rar",
				ext: ".rar",
				kind: "other",
				source: "magic",
			},
			".7z": {
				mime: "application/x-7z-compressed",
				ext: ".7z",
				kind: "other",
				source: "magic",
			},
			".cb7": {
				mime: "application/x-7z-compressed",
				ext: ".cb7",
				kind: "other",
				source: "magic",
			},
			".txt": {
				mime: "text/plain",
				ext: ".txt",
				kind: "other",
				source: "magic",
			},
		} as Record<string, FileType>
	)[ext]
}

describe("classifySource", () => {
	it("classifies a single archive entry", async () => {
		for (const name of [
			"book.cbz",
			"book.zip",
			"book.tar",
			"book.cbt",
			"book.cbr",
			"book.rar",
			"book.7z",
			"book.cb7",
		]) {
			expect(
				await classifySource([name], (f) =>
					typeOf(f.slice(f.lastIndexOf("."))),
				),
			).toEqual({ kind: "archive", filename: name })
		}
	})

	it("classifies a folder of images", async () => {
		expect(
			await classifySource(["Ch1/01.jpg", "Ch1/02.jpg"], (f) =>
				typeOf(f.slice(f.lastIndexOf("."))),
			),
		).toEqual({ kind: "pages" })
	})

	it("rejects single files, non-images and mixed content", async () => {
		expect(
			await classifySource(["01.jpg"], (f) =>
				typeOf(f.slice(f.lastIndexOf("."))),
			),
		).toBeUndefined()
		expect(
			await classifySource(["notes.txt"], (f) =>
				typeOf(f.slice(f.lastIndexOf("."))),
			),
		).toBeUndefined()
		expect(
			await classifySource(["01.jpg", "notes.txt"], (f) =>
				typeOf(f.slice(f.lastIndexOf("."))),
			),
		).toBeUndefined()
		expect(
			await classifySource([], (f) => typeOf(f.slice(f.lastIndexOf(".")))),
		).toBeUndefined()
	})

	it("recognises archive types", () => {
		for (const ext of [
			".cbz",
			".zip",
			".tar",
			".cbt",
			".cbr",
			".rar",
			".7z",
			".cb7",
		]) {
			expect(isArchiveType(typeOf(ext))).toBe(true)
		}
		expect(isArchiveType(typeOf(".jpg"))).toBe(false)
		expect(isArchiveType(undefined)).toBe(false)
	})
})

describe("buildChapterIndex", () => {
	it("groups directory pages into chapters in natural order", () => {
		// Input is the reading order (paths pre-sorted by the caller).
		const { chapters, pageToChapter } = buildChapterIndex([
			"Ch1/001.jpg",
			"Ch2/001.jpg",
			"Ch2/002.jpg",
		])
		expect(
			chapters.map((c) => [c.index, c.title, c.firstPage, c.pageCount]),
		).toEqual([
			[0, "Ch1", 0, 1],
			[1, "Ch2", 1, 2],
		])
		expect(pageToChapter).toEqual([0, 1, 1])
	})

	it("keeps root-level pages as an untitled leading chapter", () => {
		const { chapters, pageToChapter } = buildChapterIndex([
			"01.jpg",
			"02.jpg",
			"Ch1/001.jpg",
		])
		expect(chapters.map((c) => [c.title, c.firstPage, c.pageCount])).toEqual([
			[undefined, 0, 2],
			["Ch1", 2, 1],
		])
		expect(pageToChapter).toEqual([0, 0, 1])
	})

	it("treats a flat book as one untitled chapter", () => {
		const { chapters, pageToChapter } = buildChapterIndex([
			"1.jpg",
			"2.jpg",
			"3.jpg",
		])
		expect(chapters).toHaveLength(1)
		expect(chapters[0]).toMatchObject({
			title: undefined,
			firstPage: 0,
			pageCount: 3,
		})
		expect(pageToChapter).toEqual([0, 0, 0])
	})

	it("handles nested directories by their first level", () => {
		const { chapters } = buildChapterIndex([
			"vol1/Ch1/001.jpg",
			"vol1/Ch1/002.jpg",
			"vol1/Ch2/001.jpg",
		])
		expect(chapters.map((c) => c.title)).toEqual(["Ch1", "Ch2"])
	})

	it("exposes parent dirs and titles", () => {
		expect(parentDir("a/b/c.jpg")).toBe("a/b")
		expect(parentDir("a.jpg")).toBeUndefined()
		expect(chapterTitleOf("a/b")).toBe("b")
		expect(chapterTitleOf(undefined)).toBeUndefined()
	})
})

describe("buildBook navigation", () => {
	const book = buildBook([
		"01.jpg",
		"02.jpg",
		"Ch1/001.jpg",
		"Ch1/002.jpg",
		"Ch2/001.jpg",
	])

	it("maps linear positions to chapters and back", () => {
		expect(chapterOf(book, 0)).toEqual({ chapterIndex: 0, pageInChapter: 0 })
		expect(chapterOf(book, 2)).toEqual({ chapterIndex: 1, pageInChapter: 0 })
		expect(chapterOf(book, 4)).toEqual({ chapterIndex: 2, pageInChapter: 0 })
		expect(linearIndexOf(book, 1, 1)).toBe(3)
		// Out-of-range chapters clamp to the book's last chapter.
		expect(linearIndexOf(book, 9, 0)).toBe(4)
		expect(linearIndexOf(book, 0, 99)).toBe(1)
	})

	it("turns pages across chapter boundaries", () => {
		expect(nextPageIndex(book, 1)).toBe(2) // into chapter 1
		expect(prevPageIndex(book, 2)).toBe(1)
		expect(nextPageIndex(book, 4)).toBe(4) // book end
		expect(prevPageIndex(book, 0)).toBe(0)
		expect(isChapterEnd(book, 1)).toBe(true)
		expect(isChapterEnd(book, 2)).toBe(false)
	})
})

describe("position codec v2", () => {
	const position: MangaPosition = { v: 2, chapterIndex: 1, pageIndex: 3 }

	it("round-trips through JSON", () => {
		expect(decodeMangaPosition(encodeMangaPosition(position))).toEqual(position)
	})

	it("rejects malformed or legacy values", () => {
		expect(decodeMangaPosition(undefined)).toBeUndefined()
		expect(decodeMangaPosition("not json")).toBeUndefined()
		expect(
			decodeMangaPosition(JSON.stringify({ v: 1, pageIndex: 5 })),
		).toBeUndefined()
		expect(decodeMangaPosition(JSON.stringify({ v: 2 }))).toBeUndefined()
		expect(
			decodeMangaPosition(
				JSON.stringify({ v: 2, chapterIndex: "1", pageIndex: 0 }),
			),
		).toBeUndefined()
	})

	it("clamps into the current book", () => {
		const book = buildBook(["01.jpg", "Ch1/001.jpg", "Ch1/002.jpg"])
		expect(clampPosition(position, book)).toEqual({
			linear: 2,
			chapterIndex: 1,
			pageIndex: 1,
		})
		expect(clampPosition(undefined, book)).toEqual({
			linear: 0,
			chapterIndex: 0,
			pageIndex: 0,
		})
	})

	it("records per-chapter progress monotonically", () => {
		const first = recordChapterProgress(undefined, 1, 3)
		expect(first.progress[1]).toBe(3)
		const second = recordChapterProgress(first, 1, 1)
		expect(second.progress[1]).toBe(3)
		const third = recordChapterProgress(second, 2, 1)
		expect(third.progress[2]).toBe(1)
	})
})

describe("records", () => {
	it("sorts paths naturally", () => {
		expect(sortPagePaths(["10.jpg", "2.jpg", "01.jpg"])).toEqual([
			"01.jpg",
			"2.jpg",
			"10.jpg",
		])
	})

	it("builds pages from an extraction manifest", () => {
		const pages = pagesFromExtraction({
			entries: [
				{
					path: "Ch1/002.jpg",
					sizeBytes: 2,
					kind: "image",
					width: 10,
					height: 20,
				},
				{ path: "Ch1/001.jpg", sizeBytes: 3, kind: "image" },
				{ path: "notes.txt", sizeBytes: 1, kind: "other" },
			],
		})
		expect(pages.map((p) => p.filename)).toEqual(["Ch1/001.jpg", "Ch1/002.jpg"])
		expect(pages[1]).toMatchObject({
			width: 10,
			height: 20,
			preview: false,
			source: "cache",
		})
	})

	it("builds pages from a listing without dimensions", () => {
		const pages = pagesFromListing({
			entries: [
				{ path: "Ch1/002.jpg", sizeBytes: 2, kind: "image" },
				{ path: "Ch1/001.jpg", sizeBytes: 3, kind: "image" },
			],
		})
		expect(pages.map((p) => p.filename)).toEqual(["Ch1/001.jpg", "Ch1/002.jpg"])
		expect(pages[0]).toMatchObject({ source: "cache" })
		expect(pages[0]?.width).toBeUndefined()
	})

	it("assigns chapters across page sources", () => {
		const pages = assignChapters([
			{
				filename: "01.jpg",
				type: "image",
				preview: false,
				chapterIndex: 0,
				chapterTitle: undefined,
				source: "file",
			},
			{
				filename: "Ch1/001.jpg",
				type: "image",
				preview: false,
				chapterIndex: 0,
				chapterTitle: undefined,
				source: "file",
			},
		])
		expect(pages.map((p) => [p.chapterIndex, p.chapterTitle])).toEqual([
			[0, undefined],
			[1, "Ch1"],
		])
	})

	it("builds source meta from the first page", () => {
		const meta = buildSourceMeta({
			pages: assignChapters(
				pagesFromExtraction({
					entries: [
						{
							path: "Ch1/001.jpg",
							sizeBytes: 3,
							kind: "image",
							width: 800,
							height: 1200,
						},
						{ path: "Ch1/002.jpg", sizeBytes: 2, kind: "image" },
					],
				}),
			),
		})
		expect(meta).toMatchObject({
			width: 800,
			height: 1200,
			chapterCount: 1,
			pageCount: 2,
		})
	})
})
