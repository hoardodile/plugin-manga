import type { Message } from "@hoardodile/sdk-web"
import type { MangaFitMode } from "../prefs"
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

/** Horizontal gap inside a two-page spread, in CSS pixels. */
export const SPREAD_GAP = 2

/**
 * Aspect ratio used for layout, falling back to the generic portrait when
 * a page has no dimensions yet (archive listing) or the dimensions are
 * unusable.
 */
export function pageAspectOf(
	page: { readonly width?: number; readonly height?: number } | undefined,
): number {
	const w = page?.width
	const h = page?.height
	if (w !== undefined && h !== undefined && w > 0 && h > 0) return w / h
	return FALLBACK_PAGE_ASPECT
}

/** One page's computed render box, relative to the screen content origin. */
export type LayoutPageBox = {
	readonly x: number
	readonly y: number
	readonly width: number
	readonly height: number
}

export type ScreenLayout = {
	readonly contentW: number
	readonly contentH: number
	readonly boxes: readonly LayoutPageBox[]
}

/**
 * Lay a screen's content out inside a container of `containerW x
 * containerH`.
 *
 * - Single page, `fit === "page"`: contain — the page scales to fit both
 *   dimensions.
 * - Single page, `fit === "width"`: fill width — the page is `containerW`
 *   wide and may overflow vertically (pannable), so wide/tall pages are
 *   read as a scroll.
 * - Two-page spread: contain the pair — both pages share the same height
 *   and scale so the whole spread is visible, with a hairline gap between
 *   them.
 *
 * Pure on purpose; the view feeds the result to the transform content so
 * `@hoardodile/ui` geometry stays testable without a DOM.
 */
export function layoutScreen(opts: {
	readonly pages: readonly {
		readonly width?: number
		readonly height?: number
	}[]
	readonly fit: MangaFitMode
	readonly direction?: "ltr" | "rtl"
	readonly containerW: number
	readonly containerH: number
}): ScreenLayout {
	const { pages, fit, direction, containerW, containerH } = opts
	if (containerW <= 0 || containerH <= 0 || pages.length === 0) {
		return { contentW: 0, contentH: 0, boxes: [] }
	}
	if (pages.length >= 2) {
		// Spread: contain the pair. The reading-order first page sits on
		// the right in RTL (Japanese manga) and on the left in LTR.
		const [a, b] = pages
		const a1 = pageAspectOf(a)
		const a2 = pageAspectOf(b)
		const pairAspect = a1 + a2
		const h = Math.min(containerH, containerW / pairAspect)
		const w1 = a1 * h
		const w2 = a2 * h
		const rtl = direction === "rtl"
		const first = rtl
			? { x: w2 + SPREAD_GAP, y: 0, width: w1, height: h }
			: { x: 0, y: 0, width: w1, height: h }
		const second = rtl
			? { x: 0, y: 0, width: w2, height: h }
			: { x: w1 + SPREAD_GAP, y: 0, width: w2, height: h }
		return {
			contentW: w1 + SPREAD_GAP + w2,
			contentH: h,
			boxes: [first, second],
		}
	}
	const page = pages[0]
	const aspect = pageAspectOf(page)
	if (fit === "width") {
		const w = containerW
		const h = w / aspect
		return {
			contentW: w,
			contentH: h,
			boxes: [{ x: 0, y: 0, width: w, height: h }],
		}
	}
	const h = Math.min(containerH, containerW / aspect)
	const w = aspect * h
	return {
		contentW: w,
		contentH: h,
		boxes: [{ x: 0, y: 0, width: w, height: h }],
	}
}

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
