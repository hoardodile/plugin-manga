import type { Message } from "@hoardodile/sdk-web"
import type { MangaPage, MangaSourceMeta } from "../shared"
import { decodeMangaPageAnchor } from "../shared"

/**
 * Natural-order comparator for filenames, so `page2.jpg` sorts before
 * `page10.jpg` (vs. lexical sort that puts `page10` first). Used by
 * the manga reader to lay pages out in a predictable order matching
 * how a human numbers files.
 */
export function compareFilenamesNatural(a: string, b: string): number {
	return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
}

/**
 * Filter a resource's file list down to image pages (the manga reader
 * ignores side-cars, READMEs, etc.) and sort by natural filename
 * order so `02.jpg` precedes `10.jpg`.
 */
export function selectMangaPages(
	files: readonly MangaPage[],
): readonly MangaPage[] {
	const pages = files.filter((f) => f.type === "image")
	return [...pages].sort((a, b) =>
		compareFilenamesNatural(a.filename, b.filename),
	)
}

/**
 * First-paint preview hint written by `sourceMeta` into the
 * resource's `sourceMeta.previews`: up to 3 {@link MangaPage} entries
 * in natural sort order, available synchronously from `api.resource.sourceMeta`
 * before `api.useFileList()` resolves.
 */
export function readMangaPreviews(
	meta: MangaSourceMeta | undefined,
): readonly MangaPage[] | undefined {
	const raw = meta?.previews
	if (raw === undefined) return undefined
	return raw
}

/**
 * Aspect-ratio fallback used when a page record has no dimensions
 * yet. Matches a generic manga page (B5-ish, ~1:1.4); used by the
 * scroll virtualizer for placeholder slots whose `MangaPage` hasn't
 * arrived yet, as well as for the initial size estimate of loaded
 * pages — once the `<img>` mounts, the virtualizer's own measurement
 * supersedes this.
 */
export const FALLBACK_PAGE_ASPECT = 1.4

/**
 * Predict the rendered height of a manga page before any image has
 * loaded, so the scroll virtualizer can lay out a stable scrollbar
 * over the entire document. Uses the metadata `width` / `height`
 * captured at upload time when present, falling back to a generic
 * portrait aspect ratio otherwise. `undefined` (a placeholder slot
 * whose `MangaPage` hasn't arrived yet) takes the same fallback.
 */
export function estimatePageHeight(
	page: MangaPage | undefined,
	renderWidth: number,
): number {
	if (renderWidth <= 0) return 0
	const w = page?.width
	const h = page?.height
	if (w !== undefined && h !== undefined && w > 0 && h > 0) {
		return Math.round((renderWidth * h) / w)
	}
	return Math.round(renderWidth * FALLBACK_PAGE_ASPECT)
}

/**
 * Group page-anchored comments by the file they point at. Comments
 * without a decodable page anchor belong to no page and are dropped.
 */
export function buildPerPageComments(
	all: readonly Message[],
): ReadonlyMap<string, readonly Message[]> {
	const byFilename = new Map<string, Message[]>()
	for (const comment of all) {
		if (comment.anchor === undefined) continue
		const anchor = decodeMangaPageAnchor(comment.anchor.data)
		if (anchor === undefined) continue
		const bucket = byFilename.get(anchor.filename) ?? []
		bucket.push(comment)
		byFilename.set(anchor.filename, bucket)
	}
	return byFilename
}

/**
 * Rendered page column width. The column is capped so pages never
 * stretch across an ultra-wide viewport, and zoom scales that cap —
 * but never past the container, which would clip the page.
 */
export function resolveRenderWidth(opts: {
	readonly containerWidth: number
	readonly zoom: number
	readonly maxWidth: number
}): number {
	const { containerWidth, zoom, maxWidth } = opts
	if (containerWidth <= 0) return 0
	const base = Math.min(containerWidth, maxWidth)
	return Math.min(containerWidth, base * zoom)
}

export function clampZoom(value: number, min: number, max: number): number {
	if (value < min) return min
	if (value > max) return max
	return value
}

/**
 * The file URL for a manga page: the downscaled `preview` variant when
 * the server marked the page as preview-worthy and the reader is not
 * showing originals, the raw file otherwise. Shared by the scroll and
 * paged views (and the paged view's neighbour preload) so the
 * preview/original decision lives in one place.
 */
export function pageImageUrl(
	resolve: (filename: string, size: "preview" | "original") => string,
	page: MangaPage,
	useOriginal: boolean,
): string {
	const size =
		!useOriginal && page.type === "image" && page.preview
			? "preview"
			: "original"
	return resolve(page.filename, size)
}

/**
 * The renderable URL of a page. Every page — a bare file, a
 * virtually-addressed zip container entry, or a non-zip archive entry
 * served from the host's extraction cache — resolves through the single
 * `resolveFileUrl(filename, variant)`, where `filename` carries the
 * container-qualified `outer!inner` form (e.g. `book.cbz!Ch1/001.jpg`).
 * The preview/original decision (`pageImageUrl`) is the only branch.
 */
export function pageSrcOf(
	resolveFile: (filename: string, size?: "preview" | "original") => string,
	page: MangaPage,
	useOriginal: boolean,
): string {
	return pageImageUrl(resolveFile, page, useOriginal)
}

/**
 * The first page whose bottom edge is still below the scroll position.
 * Given the virtualizer's visible items, this is where the reader
 * considers the user to be.
 */
export function resolveActiveIndex(
	scrollTop: number,
	items: readonly { readonly index: number; readonly end: number }[],
): number {
	if (items.length === 0) return 0
	for (const item of items) {
		if (scrollTop < item.end) return item.index
	}
	return items[items.length - 1]?.index ?? 0
}
