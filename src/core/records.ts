import type {
	ArchiveExtraction,
	ContainerListing,
} from "@hoardodile/sdk-server"
import type { MangaPage, MangaSourceMeta } from "../shared"
import { buildChapterIndex, compareNatural } from "./chapters.ts"

/**
 * Build {@link MangaPage} records from the pieces the hooks hand over —
 * a container listing (archive resources, no dimensions) or an
 * extraction manifest (archive resources after materialization) — or
 * probed file entries (page-folder resources). Ordering, chapter
 * assignment and the preview/original decision all live here so the
 * hooks stay thin and the reader's book model is deterministic.
 */

/** Natural-order comparator for page paths (shares the chapter sorter). */
export function comparePagePaths(a: string, b: string): number {
	return compareNatural(a, b)
}

/** Sort page paths into reading order (natural filename order). */
export function sortPagePaths(paths: readonly string[]): string[] {
	return [...paths].sort(comparePagePaths)
}

/** Image pages of a container listing, in reading order (no dims yet). */
export function pagesFromListing(
	listing: ContainerListing,
): readonly MangaPage[] {
	const images = listing.entries.filter((e) => e.kind === "image")
	return sortPagePaths(images.map((e) => e.path)).map((path) => ({
		filename: path,
		type: "image" as const,
		preview: false,
		chapterIndex: 0,
		chapterTitle: undefined,
		source: "cache" as const,
	}))
}

/** Image pages of an extraction manifest, in reading order. */
export function pagesFromExtraction(
	extraction: ArchiveExtraction,
): readonly MangaPage[] {
	const images = extraction.entries.filter((e) => e.kind === "image")
	const byPath = new Map(images.map((e) => [e.path, e]))
	return sortPagePaths(images.map((e) => e.path)).map((path) => {
		const entry = byPath.get(path)
		return {
			filename: path,
			type: "image" as const,
			width: entry?.width,
			height: entry?.height,
			// Extracted files have no downscaled variant — originals only.
			preview: false,
			chapterIndex: 0,
			chapterTitle: undefined,
			source: "cache" as const,
		}
	})
}

/** Assign chapter indices/titles to a page list in reading order. */
export function assignChapters(
	pages: readonly MangaPage[],
): readonly MangaPage[] {
	const { chapters, pageToChapter } = buildChapterIndex(
		pages.map((p) => p.filename),
	)
	return pages.map((page, i) => {
		const chapterIndex = pageToChapter[i] ?? 0
		return {
			...page,
			chapterIndex,
			chapterTitle: chapters[chapterIndex]?.title,
		}
	})
}

/**
 * Build the source metadata for a resource from its (chapters-assigned)
 * pages: first page dimensions for the card, plus chapter/page counts.
 * `previews` are only meaningful for page-folder resources (real files
 * with preview variants); archive resources pass none.
 */
export function buildSourceMeta(opts: {
	readonly pages: readonly MangaPage[]
	readonly previews?: readonly MangaPage[]
}): MangaSourceMeta | undefined {
	const { pages, previews } = opts
	const first = pages[0]
	if (first === undefined) return undefined
	const chapterCount = pages.reduce(
		(acc, p) => Math.max(acc, p.chapterIndex + 1),
		0,
	)
	return {
		previews,
		width: first.width,
		height: first.height,
		chapterCount,
		pageCount: pages.length,
	}
}
