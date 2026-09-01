import type { PluginSchema } from "@hoardodile/sdk-types"
import { isRecord } from "@hoardodile/sdk-web"
import type { MangaSourceShape } from "./core/format"

/**
 * One readable page. For archive resources the `filename` is the
 * container-qualified `outer!inner` path (e.g. `book.cbz!Ch1/001.jpg`),
 * matching the `coverLocal`/`imageHashes` scopes and what the reader
 * needs to address the page (`resolveFileUrl`); the anchor `filename`
 * uses the same form.
 *
 * `source` is a descriptive tag, not a routing decision: every page —
 * bare file, zip virtual entry or materialized non-zip entry — resolves
 * through the single `resolveFileUrl`. `"file"` marks rendered entries
 * (including non-zip entries served from the host's extraction cache);
 * `"cache"` is only used for sourceMeta count pages, which are never
 * rendered.
 */
export type MangaPage = {
	readonly filename: string
	readonly type: "image"
	readonly width?: number
	readonly height?: number
	readonly preview: boolean
	readonly chapterIndex: number
	/** Directory basename of the page's chapter; `undefined` = untitled
	 *  leading chapter (a flat book). */
	readonly chapterTitle: string | undefined
	readonly source: "file" | "cache"
}

export type MangaSourceMeta = {
	/** First-frame previews of the reading start. */
	readonly previews?: readonly MangaPage[]
	readonly width?: number
	readonly height?: number
	readonly chapterCount?: number
	readonly pageCount?: number
}

export type MangaSearchMeta = {
	readonly v: number
	readonly facets?: {
		readonly image?: boolean
		readonly animation?: boolean
	}
}

export interface MangaSchema extends PluginSchema {
	readonly file: MangaPage
	readonly sourceMeta: MangaSourceMeta
	readonly searchMeta: MangaSearchMeta
	/**
	 * The resource shape computed once by `detect` and handed to the
	 * other hooks as `api.context.detect` — no per-hook rescanning.
	 */
	readonly detect: MangaSourceShape
	readonly anchor: MangaPageAnchor
}

/**
 * Comment anchor pinning a message to one page of the manga: the
 * container-qualified filename (`outer!inner` for archives, the plain
 * path for page folders — unique per resource), the chapter index and
 * the page index *within* that chapter. Version 2 — anchors created
 * before chapters carried `{ filename, page }` with a linear page and
 * fail this decode (dropped from per-page buckets).
 */
export type MangaPageAnchor = {
	readonly filename: string
	readonly chapter: number
	readonly page: number
}

/** Validate incoming anchor data against {@link MangaPageAnchor}. */
export function decodeMangaPageAnchor(
	data: unknown,
): MangaPageAnchor | undefined {
	if (!isRecord(data)) return undefined
	const { filename, chapter, page } = data
	if (
		typeof filename !== "string" ||
		typeof chapter !== "number" ||
		typeof page !== "number" ||
		!Number.isFinite(chapter) ||
		!Number.isFinite(page)
	) {
		return undefined
	}
	return { filename, chapter, page }
}
