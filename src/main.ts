import {
	PLUGIN_ANIMATION_SCAN_BATCH,
	PLUGIN_IMAGE_PROBE_CONCURRENCY,
} from "@hoardodile/sdk-types/plugin"
import { SEARCH_META_VERSION } from "@hoardodile/sdk-types/resource"

import {
	type Detection,
	definePlugin,
	type FileType,
	files as fileHelpers,
	type ResourceAPI,
} from "@hoardodile/sdk-server"
import {
	imageHashesForFile,
	mapConcurrent,
	probeImageFile,
} from "@hoardodile/sdk-server/helpers"
import { classifySource, type MangaSourceShape } from "./core/format.ts"
import {
	assignChapters,
	buildSourceMeta,
	pagesFromExtraction,
	pagesFromListing,
	sortPagePaths,
} from "./core/records.ts"
import type { MangaPage, MangaSchema, MangaSearchMeta } from "./shared"

const PREVIEW_COUNT = 3

/**
 * Extensions that identify a zip-based archive. Zip containers support
 * zero-cost virtual addressing (`outer!inner` from the central
 * directory), so cover/hash reads never materialize them; non-zip
 * containers (rar/7z/tar) need a materialized extraction first — the
 * host serves extracted files through the same virtual path once the
 * manifest exists.
 */
const ZIP_ARCHIVE_EXTS = new Set([".cbz", ".zip", ".epub"])

function isZipArchiveType(type: FileType | undefined): boolean {
	if (type === undefined) return false
	return type.mime.endsWith("zip") || ZIP_ARCHIVE_EXTS.has(type.ext)
}

export default definePlugin<MangaSchema>({
	detect,
	sourceMeta,
	searchMeta,
	coverLocal: localCover,
	listFiles: fileList,
	// Archives can hold hundreds of pages — hash only the first page so
	// the rebuild stays cheap. Per-page similarity for comic content is a
	// plugin-policy call, and this plugin's answer is "cover only".
	imageHashes,
})

/**
 * Fresh shape classification — the `detect` path only. Other hooks read
 * the detect payload from the session context instead of rescanning.
 */
async function classifyShape(
	api: ResourceAPI,
): Promise<MangaSourceShape | undefined> {
	return classifySource(await api.listFileNames(), (name) => api.sniff(name))
}

/**
 * The shape of a matched resource for non-detect hooks: the payload of
 * the session's successful `detect` when one exists, a fresh
 * classification otherwise (fresh worker, or a host that does not
 * inject context).
 */
async function shapeOf(
	api: ResourceAPI<MangaSchema>,
): Promise<MangaSourceShape | undefined> {
	const fromContext = api.context.detect
	if (fromContext !== undefined) return fromContext
	return classifyShape(api)
}

/**
 * The archive branch of the shape, when present. Page-folder hooks use
 * `undefined` here to fall back to image-page behaviour even when the
 * folder carries stray non-image files — detect stays strict (every file
 * must be an image), but listing and metadata tolerate sidecars.
 */
async function archiveOf(
	api: ResourceAPI<MangaSchema>,
): Promise<
	Extract<MangaSourceShape, { readonly kind: "archive" }> | undefined
> {
	const shape = await shapeOf(api)
	return shape?.kind === "archive" ? shape : undefined
}

/**
 * A manga resource is either a multi-page image archive (every file an
 * image, subdirectories allowed) or a single container entry (CBZ/CBT)
 * holding at least two image pages. Content decides, so a scan named
 * `001` with no extension still reads as a page. The classified shape
 * rides on the match (`ok(shape)`) so the other hooks never rescan.
 */
async function detect(api: ResourceAPI): Promise<Detection<MangaSourceShape>> {
	const shape = await classifyShape(api)
	if (shape === undefined) {
		return { ok: false, reasons: ["page-image"] }
	}
	if (shape.kind === "archive") {
		const listing = await api.listContainer(shape.filename)
		const imageCount = listing.entries.filter((e) => e.kind === "image").length
		if (imageCount < 2) {
			return { ok: false, reasons: ["page-image"] }
		}
	}
	return { ok: true, ...shape }
}

async function sourceMeta(
	api: ResourceAPI<MangaSchema>,
): Promise<MangaSchema["sourceMeta"] | undefined> {
	const archive = await archiveOf(api)
	if (archive !== undefined) {
		return archiveSourceMeta(api, archive)
	}
	return pageSourceMeta(api)
}

/**
 * Archive source metadata. Zip containers are virtually addressable
 * (`book.cbz!page.png`), so the first `PREVIEW_COUNT` pages can be
 * probed through the virtual path for card previews and the first page's
 * dimensions — no materialization. Non-zip containers (rar/7z/tar) are
 * not virtually addressable, so they stay a listing-only count (the
 * card keeps covers/counts; a probe would force an extraction for a
 * cosmetic badge, and reading an unextracted virtual path is invalid).
 */
async function archiveSourceMeta(
	api: ResourceAPI<MangaSchema>,
	archive: Extract<MangaSourceShape, { readonly kind: "archive" }>,
): Promise<MangaSchema["sourceMeta"] | undefined> {
	const listing = await api.listContainer(archive.filename)
	const pages = assignChapters(pagesFromListing(listing))
	if (!isZipArchiveType(await api.sniff(archive.filename))) {
		return buildSourceMeta({ pages })
	}

	const imagePaths = sortPagePaths(
		listing.entries.filter((e) => e.kind === "image").map((e) => e.path),
	)
	if (imagePaths.length === 0) return undefined

	const previews: MangaPage[] = []
	let firstDims: { readonly width?: number; readonly height?: number } | undefined
	for (const path of imagePaths) {
		if (previews.length >= PREVIEW_COUNT) break
		let probed:
			| { readonly width?: number; readonly height?: number; readonly preview: boolean }
			| undefined
		try {
			probed = await probeImageFile(api, `${archive.filename}!${path}`)
		} catch {
			probed = undefined
		}
		previews.push({
			filename: `${archive.filename}!${path}`,
			type: "image",
			width: probed?.width,
			height: probed?.height,
			preview: probed?.preview ?? false,
			chapterIndex: 0,
			chapterTitle: undefined,
			source: "file",
		})
		if (
			firstDims === undefined &&
			(probed?.width !== undefined || probed?.height !== undefined)
		) {
			firstDims = { width: probed.width, height: probed.height }
		}
	}

	return {
		...firstDims,
		previews,
		chapterCount: pages.reduce((acc, p) => Math.max(acc, p.chapterIndex + 1), 0),
		pageCount: pages.length,
	}
}

async function pageSourceMeta(
	api: ResourceAPI,
): Promise<MangaSchema["sourceMeta"] | undefined> {
	const names = await imageNamesOf(api)
	const previews: MangaPage[] = []
	let firstDims:
		| { readonly width?: number; readonly height?: number }
		| undefined
	for (const filename of names) {
		if (previews.length >= PREVIEW_COUNT) break
		const probed = await probeImageFile(api, filename)
		previews.push({
			filename,
			type: "image",
			width: probed.width,
			height: probed.height,
			preview: probed.preview,
			chapterIndex: 0,
			chapterTitle: undefined,
			source: "file",
		})
		if (
			firstDims === undefined &&
			(probed.width !== undefined || probed.height !== undefined)
		) {
			firstDims = { width: probed.width, height: probed.height }
		}
	}
	if (previews.length === 0 || firstDims === undefined) return undefined
	const assigned = assignChapters(previews)
	return {
		...firstDims,
		previews: assigned,
		chapterCount: assigned.reduce(
			(acc, p) => Math.max(acc, p.chapterIndex + 1),
			0,
		),
		pageCount: names.length,
	}
}

async function searchMeta(
	api: ResourceAPI<MangaSchema>,
): Promise<MangaSearchMeta | undefined> {
	const archive = await archiveOf(api)
	if (archive !== undefined) {
		// A container of images: presence without per-page probing.
		return { v: SEARCH_META_VERSION, facets: { image: true, animation: false } }
	}
	const files = await api.listFileNames()
	if (files.length === 0) return undefined
	const presence = { image: false, animation: false }
	// Batched fan-out: probes run concurrently within a batch, and the
	// early-exit check between batches keeps the "found animation" short path.
	for (let i = 0; i < files.length; i += PLUGIN_ANIMATION_SCAN_BATCH) {
		const batch = files.slice(i, i + PLUGIN_ANIMATION_SCAN_BATCH)
		await Promise.all(
			batch.map(async (filename) => {
				const probed = await api.probe(filename)
				if (probed.kind !== "image") return
				presence.image = true
				if (probed.animated) presence.animation = true
			}),
		)
		if (presence.image && presence.animation) break
	}
	if (!presence.image && !presence.animation) return undefined
	return { v: SEARCH_META_VERSION, facets: presence }
}

async function localCover(
	api: ResourceAPI<MangaSchema>,
): Promise<string | undefined> {
	const archive = await archiveOf(api)
	if (archive !== undefined) {
		// The cover is the first image page inside the container; address
		// it virtually so the cover pipeline reads through the view. Zip
		// reads from the central directory; non-zip formats must be
		// extracted first (idempotent — the manifest serves later reads).
		const first = await firstImageEntryOf(api, archive)
		if (first === undefined) return undefined
		if (!isZipArchiveType(await api.sniff(archive.filename))) {
			await api.extractArchive(archive.filename)
		}
		return `${archive.filename}!${first}`
	}
	return fileHelpers.firstOfKind(api, "image")
}

async function imageHashes(api: ResourceAPI<MangaSchema>) {
	const archive = await archiveOf(api)
	if (archive !== undefined) {
		const first = await firstImageEntryOf(api, archive)
		if (first === undefined) return undefined
		if (!isZipArchiveType(await api.sniff(archive.filename))) {
			await api.extractArchive(archive.filename)
		}
		const scope = `${archive.filename}!${first}`
		return { hashes: await imageHashesForFile(api, scope) }
	}
	const cover = await fileHelpers.firstOfKind(api, "image")
	if (cover === undefined) return undefined
	return { hashes: await imageHashesForFile(api, cover) }
}

async function fileList(
	api: ResourceAPI<MangaSchema>,
): Promise<readonly MangaPage[]> {
	const archive = await archiveOf(api)
	if (archive !== undefined) {
		// Zip containers stream on demand through the host's virtual
		// `/files` addressing (`outer!inner` from the central directory),
		// so the reader lists them without materializing — matching
		// `sourceMeta`/`coverLocal`/`imageHashes` and the file plugin.
		// Non-zip containers (rar/7z/tar) are extracted first; the host
		// then serves their entries through the same `/files` `outer!inner`
		// addressing from the extraction cache.
		if (isZipArchiveType(await api.sniff(archive.filename))) {
			const listing = await api.listContainer(archive.filename)
			return [...assignChapters(pagesFromListing(listing, archive.filename))]
		}
		const extraction = await api.extractArchive(archive.filename)
		return [...assignChapters(pagesFromExtraction(extraction, archive.filename))]
	}
	return pagePagesOf(api)
}

/** Image names of a page-folder resource, in reading order. */
async function imageNamesOf(api: ResourceAPI): Promise<string[]> {
	const sorted = sortPagePaths(await api.listFileNames())
	const types = await mapConcurrent(
		sorted,
		PLUGIN_IMAGE_PROBE_CONCURRENCY,
		(name) => api.sniff(name),
	)
	return sorted.filter((_, index) => types[index]?.kind === "image")
}

/** Fully probed pages of a page-folder resource, in reading order. */
async function pagePagesOf(api: ResourceAPI): Promise<readonly MangaPage[]> {
	const names = await imageNamesOf(api)
	const pages = await mapConcurrent(
		names,
		PLUGIN_IMAGE_PROBE_CONCURRENCY,
		async (filename) => {
			const probed = await probeImageFile(api, filename)
			return {
				filename,
				type: "image" as const,
				width: probed.width,
				height: probed.height,
				preview: probed.preview,
				chapterIndex: 0,
				chapterTitle: undefined,
				source: "file" as const,
			}
		},
	)
	return assignChapters(pages)
}

/** First image entry of a container, in reading order. */
async function firstImageEntryOf(
	api: ResourceAPI,
	shape: Extract<MangaSourceShape, { readonly kind: "archive" }>,
): Promise<string | undefined> {
	const listing = await api.listContainer(shape.filename)
	const first = sortPagePaths(
		listing.entries.filter((e) => e.kind === "image").map((e) => e.path),
	)[0]
	return first
}
