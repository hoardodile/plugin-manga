/**
 * Chapter grouping. A chapter is a run of consecutive pages that share a
 * parent directory (inside the resource folder or inside the archive);
 * pages at the root form the leading chapter without a title. Ordering
 * is natural sort of the directory path, matching how a human numbers
 * `Chapter 1/`, `Chapter 2/` (or `第1话/`, `第2话/`).
 *
 * The reader renders the whole book linearly — chapters are purely an
 * index over the sorted page list — so every chapter is a contiguous
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
 * pages sharing a parent directory form one chapter; root-level pages
 * form an untitled leading chapter.
 */
export function buildChapterIndex(pagePaths: readonly string[]): ChapterIndex {
	const dirs: string[] = []
	const dirSet = new Set<string | undefined>()
	for (const path of pagePaths) {
		const dir = parentDir(chapterPathOf(path))
		if (dirSet.has(dir)) continue
		dirSet.add(dir)
		if (dir !== undefined) dirs.push(dir)
	}
	// Root pages always come first (the natural sort of "" precedes any
	// directory), then directories in natural order.
	dirs.sort(compareNatural)
	const ordered: readonly (string | undefined)[] = dirSet.has(undefined)
		? [undefined, ...dirs]
		: dirs

	const chapters: MangaChapter[] = []
	const pageToChapter: number[] = []
	let chapterIndex = 0
	for (const dir of ordered) {
		const firstPage = pageToChapter.length
		let count = 0
		for (const path of pagePaths) {
			if (parentDir(chapterPathOf(path)) !== dir) continue
			pageToChapter.push(chapterIndex)
			count += 1
		}
		if (count > 0) {
			chapters.push({
				index: chapterIndex,
				title: chapterTitleOf(dir),
				firstPage,
				pageCount: count,
			})
			chapterIndex += 1
		}
	}
	return { chapters, pageToChapter }
}
