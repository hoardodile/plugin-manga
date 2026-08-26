// @vitest-environment node

import type { ProbeResult, ResourceAPI } from "@hoardodile/sdk-server"
import { createResourceAPIFixture } from "@hoardodile/sdk-server"
import { describe, expect, it } from "vitest"
import plugin from "../main.ts"
import type { MangaSchema } from "../shared"

const PAGE_PROBE = {
	kind: "image",
	mime: "image/jpeg",
	width: 800,
	height: 1200,
	animated: false,
} as const

function createApiStub(
	files: readonly string[],
	overrides: Partial<ResourceAPI<MangaSchema>> = {},
): ResourceAPI<MangaSchema> {
	return {
		logInfo() {},
		logWarn() {},
		logError() {},
		context: { detect: undefined },
		listFileNames: async () => files,
		readFile: async () => new Uint8Array(),
		statFile: async () => ({ sizeBytes: 100 }),
		statFiles: async (paths) => paths.map(() => ({ sizeBytes: 100 })),
		sniff: async () => ({
			mime: "image/jpeg",
			ext: ".jpg",
			kind: "image",
			source: "magic",
		}),
		probe: async () => PAGE_PROBE,
		hashBytes: async () => "ab",
		computeImageHashes: async () => undefined,
		listContainer: async () => ({ entries: [] }),
		extractArchive: async () => ({ entries: [] }),
		download: async () => {
			throw new Error("ResourceAPI stub: download not configured")
		},
		statAsset: async () => undefined,
		readAsset: async () => new Uint8Array(),
		deleteAsset: async () => ({ existed: false }),
		...overrides,
	}
}

describe("manga listFiles", () => {
	it("returns natural-sorted pages with probe data, skipping non-images", async () => {
		const fixture = createResourceAPIFixture<MangaSchema>({
			files: ["10.jpg", "2.jpg", "01.jpg", "notes.txt"],
			probes: { "": PAGE_PROBE },
			stats: { "": { sizeBytes: 100 } },
		})
		const result = await plugin.listFiles?.(fixture.api)
		expect(result?.map((f) => f.filename)).toEqual([
			"01.jpg",
			"2.jpg",
			"10.jpg",
		])
		expect(result?.[0]).toMatchObject({ type: "image", width: 800 })
	})

	it("probes pages concurrently but bounded", async () => {
		const files = Array.from(
			{ length: 30 },
			(_, i) => `${String(i + 1).padStart(3, "0")}.jpg`,
		)
		let inFlight = 0
		let maxInFlight = 0
		const api = createApiStub(files, {
			probe: async () => {
				inFlight++
				maxInFlight = Math.max(maxInFlight, inFlight)
				await new Promise((resolve) => setTimeout(resolve, 5))
				inFlight--
				return PAGE_PROBE
			},
		})
		const result = await plugin.listFiles?.(api)
		expect(result).toHaveLength(30)
		expect(maxInFlight).toBeGreaterThan(1)
		expect(maxInFlight).toBeLessThanOrEqual(8)
	})
})

describe("manga searchMeta", () => {
	it("stops scanning after the batch that finds an animation", async () => {
		const files = Array.from(
			{ length: 30 },
			(_, i) => `${String(i + 1).padStart(2, "0")}.jpg`,
		)
		const animated = new Set(["03.jpg"])
		let calls = 0
		const api = createApiStub(files, {
			probe: async (path): Promise<ProbeResult> => {
				calls++
				return { ...PAGE_PROBE, animated: animated.has(path) }
			},
		})
		const result = await plugin.searchMeta?.(api)
		expect(result).toMatchObject({
			facets: { image: true, animation: true },
		})
		// First batch of 8 finds the animation — later pages are never probed.
		expect(calls).toBeLessThanOrEqual(8)
	})

	it("scans everything when nothing is animated", async () => {
		const api = createApiStub(["a.jpg", "b.jpg", "c.jpg"])
		const result = await plugin.searchMeta?.(api)
		expect(result).toMatchObject({
			facets: { image: true, animation: false },
		})
	})
})

// ── Archive (CBZ/CBT) resources ──────────────────────────────────────────────

const CBZ_LISTING = {
	entries: [
		{ path: "Ch2/001.jpg", sizeBytes: 3, kind: "image" },
		{ path: "Ch2/002.jpg", sizeBytes: 4, kind: "image" },
		{ path: "Ch1/001.jpg", sizeBytes: 5, kind: "image" },
		{ path: "notes.txt", sizeBytes: 1, kind: "other" },
	],
} as const

const CBZ_EXTRACTION = {
	entries: [
		{
			path: "Ch2/001.jpg",
			sizeBytes: 3,
			kind: "image",
			width: 100,
			height: 200,
		},
		{ path: "Ch2/002.jpg", sizeBytes: 4, kind: "image" },
		{
			path: "Ch1/001.jpg",
			sizeBytes: 5,
			kind: "image",
			width: 800,
			height: 1200,
		},
		{ path: "notes.txt", sizeBytes: 1, kind: "other" },
	],
} as const

function archiveFixture() {
	return createResourceAPIFixture<MangaSchema>({
		files: ["book.cbz"],
		types: {
			"book.cbz": {
				mime: "application/vnd.comicbook+zip",
				ext: ".cbz",
				kind: "other",
				source: "magic",
			},
		},
		containerListings: { "book.cbz": CBZ_LISTING },
		extractions: { "book.cbz": CBZ_EXTRACTION },
		imageHashes: {
			"": {
				hashes: [
					{ scope: "book.cbz!Ch1/001.jpg", type: "sha256", value: "ab" },
				],
			},
		},
	})
}

describe("manga archive resources", () => {
	it("detects a single cbz with at least two image pages", async () => {
		const fixture = archiveFixture()
		expect(await plugin.detect(fixture.api)).toMatchObject({ ok: true })
	})

	it("rejects a cbz with fewer than two image pages", async () => {
		const fixture = createResourceAPIFixture<MangaSchema>({
			files: ["book.cbz"],
			types: {
				"book.cbz": {
					mime: "application/zip",
					ext: ".zip",
					kind: "other",
					source: "magic",
				},
			},
			containerListings: {
				"book.cbz": {
					entries: [
						{ path: "only.jpg", sizeBytes: 3, kind: "image" },
						{ path: "notes.txt", sizeBytes: 1, kind: "other" },
					],
				},
			},
		})
		expect(await plugin.detect(fixture.api)).toEqual({
			ok: false,
			reasons: ["page-image"],
		})
	})

	it("lists chapter-assigned pages from the extraction manifest", async () => {
		const fixture = archiveFixture()
		const result = await plugin.listFiles?.(fixture.api)
		expect(result?.map((f) => f.filename)).toEqual([
			"Ch1/001.jpg",
			"Ch2/001.jpg",
			"Ch2/002.jpg",
		])
		expect(result?.[0]).toMatchObject({
			source: "cache",
			preview: false,
			chapterIndex: 0,
			chapterTitle: "Ch1",
			width: 800,
			height: 1200,
		})
		expect(result?.[1]).toMatchObject({
			chapterIndex: 1,
			chapterTitle: "Ch2",
		})
	})

	it("builds sourceMeta from a cheap listing without materializing", async () => {
		const fixture = createResourceAPIFixture<MangaSchema>({
			files: ["book.cbz"],
			types: {
				"book.cbz": {
					mime: "application/vnd.comicbook+zip",
					ext: ".cbz",
					kind: "other",
					source: "magic",
				},
			},
			containerListings: { "book.cbz": CBZ_LISTING },
			// No `extractions` configured: sourceMeta must only list, so
			// an extraction would make this test fail.
		})
		const result = await plugin.sourceMeta?.(fixture.api)
		expect(result).toMatchObject({
			chapterCount: 2,
			pageCount: 3,
		})
		// No dimensions until materialization.
		expect(result?.width).toBeUndefined()
	})

	it("resolves the cover as a virtual path to the first page", async () => {
		const fixture = archiveFixture()
		expect(await plugin.coverLocal?.(fixture.api)).toBe("book.cbz!Ch1/001.jpg")
	})

	it("hashes the first page through the virtual path", async () => {
		const fixture = archiveFixture()
		const hashes = (await plugin.imageHashes?.(fixture.api))?.hashes ?? []
		expect(hashes.some((h) => h.scope === "book.cbz!Ch1/001.jpg")).toBe(true)
	})

	it("reports image-only facets without probing", async () => {
		const fixture = archiveFixture()
		const result = await plugin.searchMeta?.(fixture.api)
		expect(result).toMatchObject({
			facets: { image: true, animation: false },
		})
	})
})

// ── Non-zip archives (CBR/CB7/CBT) ──────────────────────────────────────────

const RAR_TYPE = {
	mime: "application/vnd.rar",
	ext: ".cbr",
	kind: "other",
	source: "magic",
} as const

function nonZipArchiveFixture() {
	return createResourceAPIFixture<MangaSchema>({
		files: ["book.cbr"],
		types: { "book.cbr": RAR_TYPE },
		containerListings: { "book.cbr": CBZ_LISTING },
		extractions: { "book.cbr": CBZ_EXTRACTION },
		imageHashes: {
			"": {
				hashes: [
					{ scope: "book.cbr!Ch1/001.jpg", type: "sha256", value: "ab" },
				],
			},
		},
	})
}

describe("manga non-zip archive resources", () => {
	it("detects a cbr with at least two image pages", async () => {
		const fixture = nonZipArchiveFixture()
		expect(await plugin.detect(fixture.api)).toMatchObject({ ok: true })
	})

	it("lists chapter-assigned pages from the extraction manifest", async () => {
		const fixture = nonZipArchiveFixture()
		const result = await plugin.listFiles?.(fixture.api)
		expect(result?.map((f) => f.filename)).toEqual([
			"Ch1/001.jpg",
			"Ch2/001.jpg",
			"Ch2/002.jpg",
		])
	})

	it("builds sourceMeta from a cheap listing without materializing", async () => {
		const fixture = createResourceAPIFixture<MangaSchema>({
			files: ["book.cbr"],
			types: { "book.cbr": RAR_TYPE },
			containerListings: { "book.cbr": CBZ_LISTING },
		})
		const result = await plugin.sourceMeta?.(fixture.api)
		expect(result).toMatchObject({ chapterCount: 2, pageCount: 3 })
	})

	it("materializes before resolving the cover for non-zip containers", async () => {
		const fixture = nonZipArchiveFixture()
		let extracts = 0
		const api = {
			...fixture.api,
			extractArchive: async (filename: string) => {
				extracts++
				return fixture.api.extractArchive(filename)
			},
		}
		expect(await plugin.coverLocal?.(api)).toBe("book.cbr!Ch1/001.jpg")
		expect(extracts).toBe(1)
	})

	it("does not materialize before the cover for zip containers", async () => {
		const fixture = archiveFixture()
		let extracts = 0
		const api = {
			...fixture.api,
			extractArchive: async (filename: string) => {
				extracts++
				return fixture.api.extractArchive(filename)
			},
		}
		expect(await plugin.coverLocal?.(api)).toBe("book.cbz!Ch1/001.jpg")
		expect(extracts).toBe(0)
	})

	it("materializes before hashing non-zip containers", async () => {
		const fixture = nonZipArchiveFixture()
		let extracts = 0
		const api = {
			...fixture.api,
			extractArchive: async (filename: string) => {
				extracts++
				return fixture.api.extractArchive(filename)
			},
		}
		const hashes = (await plugin.imageHashes?.(api))?.hashes ?? []
		expect(hashes.some((h) => h.scope === "book.cbr!Ch1/001.jpg")).toBe(true)
		expect(extracts).toBe(1)
	})
})

// ── EPUB (zip container with a different MIME) ───────────────────────────────

const EPUB_LISTING = {
	entries: [
		{ path: "META-INF/container.xml", sizeBytes: 200, kind: "other" },
		{ path: "OEBPS/Images/002.jpg", sizeBytes: 4, kind: "image" },
		{ path: "OEBPS/Images/001.jpg", sizeBytes: 5, kind: "image" },
		{ path: "OEBPS/text/chapter1.xhtml", sizeBytes: 900, kind: "other" },
	],
} as const

describe("manga epub resources", () => {
	function epubFixture() {
		return createResourceAPIFixture<MangaSchema>({
			files: ["book.epub"],
			types: {
				"book.epub": {
					mime: "application/epub+zip",
					ext: ".epub",
					kind: "other",
					source: "magic",
				},
			},
			containerListings: { "book.epub": EPUB_LISTING },
			extractions: {
				"book.epub": {
					entries: [
						{
							path: "OEBPS/Images/001.jpg",
							sizeBytes: 5,
							kind: "image",
							width: 800,
							height: 1200,
						},
						{ path: "OEBPS/Images/002.jpg", sizeBytes: 4, kind: "image" },
					],
				},
			},
		})
	}

	it("detects an epub as a manga container", async () => {
		const fixture = epubFixture()
		expect(await plugin.detect(fixture.api)).toMatchObject({ ok: true })
	})

	it("lists only the image pages, skipping markup and container files", async () => {
		const fixture = epubFixture()
		const result = await plugin.listFiles?.(fixture.api)
		expect(result?.map((f) => f.filename)).toEqual([
			"OEBPS/Images/001.jpg",
			"OEBPS/Images/002.jpg",
		])
		expect(result?.[0]).toMatchObject({
			source: "cache",
			chapterTitle: "Images",
		})
	})

	it("resolves the cover as a virtual path to the first image", async () => {
		const fixture = epubFixture()
		expect(await plugin.coverLocal?.(fixture.api)).toBe(
			"book.epub!OEBPS/Images/001.jpg",
		)
	})
})
