/**
 * Chapter grouping. A chapter is a run of consecutive pages that share a
 * parent directory (inside the resource folder or inside the archive);
 * root pages form untitled runs. The supplied reading order is preserved,
 * including custom upload order and directories appearing more than once.
 *
 * The reader renders the whole book linearly — chapters are purely an
 * index over the page list — so every chapter is a contiguous
 * run `[firstPage, firstPage + pageCount)`.
 */

export type MangaChapter = {
	readonly index: number
	/** Directory basename; `undefined` for root-level pages (a single
	 *  flat book, or the loose pages before the first chapter). */
	readonly title: string | undefined
	/** Linear index of the chapter's first page. */
	readonly firstPage: number
	readonly pageCount: number
}

export type ChapterIndex = {
	readonly chapters: readonly MangaChapter[]
	/** Chapter index of every page, in page order. */
	readonly pageToChapter: readonly number[]
}

/** Parent directory of a path, or `undefined` when it is root-level. */
export function parentDir(path: string): string | undefined {
	const slash = path.lastIndexOf("/")
	return slash <= 0 ? undefined : path.slice(0, slash)
}

/** Natural-order comparator for directory paths. */
export function compareNatural(a: string, b: string): number {
	return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
}

/**
 * The path used for chapter grouping. Archive pages carry a
 * container-qualified `outer!inner` filename (e.g. `book.cbz!Ch1/001.jpg`);
 * the container qualifier (everything up to the first `!`) is not part of
 * the archive's inner directory structure, so it is stripped before the
 * parent directory (and therefore the chapter title) is derived. File
 * paths with no `!` (page-folder resources) pass through unchanged.
 */
function chapterPathOf(path: string): string {
	const bang = path.indexOf("!")
	return bang === -1 ? path : path.slice(bang + 1)
}

/** The display title of a chapter directory (its basename). */
export function chapterTitleOf(dir: string | undefined): string | undefined {
	if (dir === undefined) return undefined
	const slash = dir.lastIndexOf("/")
	return slash === -1 ? dir : dir.slice(slash + 1)
}

/**
 * Group a page list (already in reading order) into chapters. Consecutive
 * pages sharing a parent directory form one chapter; root-level runs
 * form untitled chapters wherever they appear.
 */
export function buildChapterIndex(pagePaths: readonly string[]): ChapterIndex {
	const chapters: MangaChapter[] = []
	const pageToChapter: number[] = []
	let previousDir: string | undefined
	for (const [index, path] of pagePaths.entries()) {
		const dir = parentDir(chapterPathOf(path))
		const last = chapters.at(-1)
		if (last === undefined || dir !== previousDir) {
			chapters.push({
				index: chapters.length,
				title: chapterTitleOf(dir),
				firstPage: index,
				pageCount: 1,
			})
		} else {
			chapters[chapters.length - 1] = { ...last, pageCount: last.pageCount + 1 }
		}
		pageToChapter.push(chapters.length - 1)
		previousDir = dir
	}
	return { chapters, pageToChapter }
}
