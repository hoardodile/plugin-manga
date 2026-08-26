import { useMemo } from "react"
import { buildBook, type MangaBook } from "../core/book.ts"
import type { MangaPage } from "../shared"
import { readMangaPreviews, selectMangaPages } from "./helpers"
import { usePluginAPI } from "./hooks"

/**
 * The book (pages + chapter index) the reader navigates. The `listFiles`
 * hook is authoritative, but its query resolves asynchronously — until
 * then the `sourceMeta` previews give the reader something to paint on
 * the very first frame.
 */
export function useMangaBook(): {
	readonly book: MangaBook | undefined
	/** Page records aligned with `book.pages` (same order). */
	readonly pages: readonly MangaPage[]
	/** Count shown before the book resolves (card-level knowledge). */
	readonly expectedCount: number
	/** True while the file list query has not resolved yet. */
	readonly isLoading: boolean
} {
	const api = usePluginAPI()
	const filesQuery = api.useFileList()
	const sourceMeta = api.resource.sourceMeta
	const { book, pages } = useMemo(() => {
		if (filesQuery.data !== undefined) {
			const selected = selectMangaPages(filesQuery.data)
			if (selected.length > 0) {
				return {
					pages: selected,
					book: buildBook(selected.map((p) => p.filename)),
				}
			}
			return { pages: [], book: undefined }
		}
		const previews = readMangaPreviews(sourceMeta)
		if (previews !== undefined && previews.length > 0) {
			return {
				pages: previews,
				book: buildBook(previews.map((p) => p.filename)),
			}
		}
		return { pages: [], book: undefined }
	}, [filesQuery.data, sourceMeta])

	const expectedCount = useMemo(
		() =>
			sourceMeta?.pageCount ??
			api.resource.fileStats?.count ??
			book?.pageCount ??
			0,
		[book, sourceMeta, api.resource.fileStats],
	)

	return { book, pages, expectedCount, isLoading: filesQuery.isLoading }
}
