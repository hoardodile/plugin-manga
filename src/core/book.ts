import { buildChapterIndex, type MangaChapter } from "./chapters.ts"

/**
 * The reader's core model: a linear page list plus the chapter index
 * over it. All navigation (page turns, chapter jumps, position restore)
 * is pure arithmetic over these two structures — no React, no DOM.
 */

export type MangaBook = {
	readonly pages: readonly string[]
	readonly chapters: readonly MangaChapter[]
	/** Chapter index per page, parallel to `pages`. */
	readonly pageToChapter: readonly number[]
	readonly pageCount: number
	readonly chapterCount: number
}

/** Build a book from page paths already in reading order. */
export function buildBook(pagePaths: readonly string[]): MangaBook {
	const { chapters, pageToChapter } = buildChapterIndex(pagePaths)
	return {
		pages: pagePaths,
		chapters,
		pageToChapter,
		pageCount: pagePaths.length,
		chapterCount: chapters.length,
	}
}

export type BookLocation = {
	readonly chapterIndex: number
	readonly pageInChapter: number
}

/** Chapter + in-chapter position of a linear page index. */
export function chapterOf(book: MangaBook, linearIndex: number): BookLocation {
	const clamped = Math.max(0, Math.min(book.pageCount - 1, linearIndex))
	const chapterIndex = book.pageToChapter[clamped] ?? 0
	const chapter = book.chapters[chapterIndex]
	const pageInChapter = chapter === undefined ? 0 : clamped - chapter.firstPage
	return { chapterIndex, pageInChapter }
}

/** Linear index of a (chapter, in-chapter) position; clamps to the book. */
export function linearIndexOf(
	book: MangaBook,
	chapterIndex: number,
	pageInChapter: number,
): number {
	const last = book.chapterCount - 1
	const clampedChapter = Math.max(0, Math.min(last, chapterIndex))
	const chapter = book.chapters[clampedChapter]
	if (chapter === undefined) return 0
	const linear = chapter.firstPage + pageInChapter
	return Math.max(
		chapter.firstPage,
		Math.min(chapterEnd(book, clampedChapter) - 1, linear),
	)
}

/** Linear index of the first page of `chapterIndex`. */
export function chapterStart(book: MangaBook, chapterIndex: number): number {
	return book.chapters[chapterIndex]?.firstPage ?? 0
}

/** One past the last page of `chapterIndex`. */
export function chapterEnd(book: MangaBook, chapterIndex: number): number {
	const chapter = book.chapters[chapterIndex]
	if (chapter === undefined) return 0
	return chapter.firstPage + chapter.pageCount
}

/** Linear index of the last page of the book. */
export function lastPageIndex(book: MangaBook): number {
	return Math.max(0, book.pageCount - 1)
}

/**
 * The page a forward turn from `linearIndex` lands on. Unlike a plain
 * `+1`, this never leaves the book: at the final page of a chapter it
 * lands on the first page of the next chapter (clamped at the book's
 * end), which is exactly how paged reading flows across chapters.
 */
export function nextPageIndex(book: MangaBook, linearIndex: number): number {
	return Math.min(book.pageCount - 1, linearIndex + 1)
}

/** The page a backward turn lands on (never below 0). */
export function prevPageIndex(_book: MangaBook, linearIndex: number): number {
	return Math.max(0, linearIndex - 1)
}

/** True when `linearIndex` is the last page of its chapter. */
export function isChapterEnd(book: MangaBook, linearIndex: number): boolean {
	const { chapterIndex, pageInChapter } = chapterOf(book, linearIndex)
	return pageInChapter === (book.chapters[chapterIndex]?.pageCount ?? 1) - 1
}
