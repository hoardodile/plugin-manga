import type { MangaBook } from "./book.ts"

/**
 * Reading position, versioned: `{ chapterIndex, pageIndex }` with
 * `pageIndex` relative to the chapter. The linear page index is derived
 * from the book at hydrate time, so a book whose chapter layout changes
 * (re-import, plugin switch) restores as close as the new layout allows.
 */

export const MANGA_POSITION_VERSION = 2

export type MangaPosition = {
	readonly v: 2
	readonly chapterIndex: number
	readonly pageIndex: number
}

export function encodeMangaPosition(value: MangaPosition): string {
	return JSON.stringify(value)
}

export function decodeMangaPosition(
	raw: string | undefined,
): MangaPosition | undefined {
	if (raw === undefined) return undefined
	try {
		const parsed = JSON.parse(raw) as Partial<MangaPosition>
		if (
			parsed.v !== MANGA_POSITION_VERSION ||
			typeof parsed.chapterIndex !== "number" ||
			typeof parsed.pageIndex !== "number" ||
			!Number.isFinite(parsed.chapterIndex) ||
			!Number.isFinite(parsed.pageIndex)
		) {
			return undefined
		}
		return {
			v: MANGA_POSITION_VERSION,
			chapterIndex: parsed.chapterIndex,
			pageIndex: parsed.pageIndex,
		}
	} catch {
		return undefined
	}
}

/** Clamp a stored position into the current book's bounds. */
export function clampPosition(
	position: MangaPosition | undefined,
	book: MangaBook,
): {
	readonly linear: number
	readonly chapterIndex: number
	readonly pageIndex: number
} {
	if (position === undefined) {
		return { linear: 0, chapterIndex: 0, pageIndex: 0 }
	}
	const chapter = book.chapters[position.chapterIndex]
	if (chapter === undefined) {
		return { linear: 0, chapterIndex: 0, pageIndex: 0 }
	}
	const linear = Math.max(
		chapter.firstPage,
		Math.min(
			chapter.firstPage + chapter.pageCount - 1,
			chapter.firstPage + position.pageIndex,
		),
	)
	return {
		linear,
		chapterIndex: position.chapterIndex,
		pageIndex: linear - chapter.firstPage,
	}
}

/**
 * Per-chapter reading progress, persisted so the chapter list can show
 * read marks: `progress[chapterIndex]` = pages seen (1-based, capped at
 * the chapter's page count).
 */
export const MANGA_PROGRESS_VERSION = 1

export type MangaProgress = {
	readonly v: 1
	readonly progress: Readonly<Record<number, number>>
}

export function encodeMangaProgress(value: MangaProgress): string {
	return JSON.stringify(value)
}

export function decodeMangaProgress(
	raw: string | undefined,
): MangaProgress | undefined {
	if (raw === undefined) return undefined
	try {
		const parsed = JSON.parse(raw) as Partial<MangaProgress>
		if (
			parsed.v !== MANGA_PROGRESS_VERSION ||
			typeof parsed.progress !== "object"
		) {
			return undefined
		}
		return { v: 1, progress: parsed.progress }
	} catch {
		return undefined
	}
}

/** Record that `chapterIndex` has been read up to page `pagesSeen`. */
export function recordChapterProgress(
	prev: MangaProgress | undefined,
	chapterIndex: number,
	pagesSeen: number,
): MangaProgress {
	return {
		v: MANGA_PROGRESS_VERSION,
		progress: {
			...prev?.progress,
			[chapterIndex]: Math.max(
				prev?.progress[chapterIndex] ?? 0,
				Math.max(1, pagesSeen),
			),
		},
	}
}
