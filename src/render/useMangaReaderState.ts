import { useCacheWriter } from "@hoardodile/sdk-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { chapterOf, type MangaBook } from "../core/book.ts"
import {
	clampPosition,
	decodeMangaPosition,
	decodeMangaProgress,
	encodeMangaPosition,
	encodeMangaProgress,
	type MangaProgress,
	recordChapterProgress,
} from "../core/position.ts"
import {
	decodeMangaSettings,
	encodeMangaSettings,
	MANGA_SETTINGS_DEFAULT,
	MANGA_SETTINGS_KEY,
	type MangaSettings,
} from "../prefs"
import { usePluginAPI } from "./hooks"

/**
 * Reader state that is persisted rather than transient: the plugin-wide
 * settings pref, the per-resource reading position (chapter + page) and
 * the per-chapter progress marks. Each is a codec round-trip over a host
 * API, which reads far better as three named rules than as interleaved
 * effects inside the reader component.
 */

/** Plugin-wide reader settings, stored as one JSON pref. */
export function useMangaSettings(): {
	readonly settings: MangaSettings
	readonly updateSettings: (patch: Partial<MangaSettings>) => void
} {
	const api = usePluginAPI()
	const [raw, setRaw] = api.usePref(
		MANGA_SETTINGS_KEY,
		encodeMangaSettings(MANGA_SETTINGS_DEFAULT),
	)
	const settings = useMemo(
		() => decodeMangaSettings(raw) ?? MANGA_SETTINGS_DEFAULT,
		[raw],
	)
	const updateSettings = useCallback(
		(patch: Partial<MangaSettings>) => {
			setRaw(encodeMangaSettings({ ...settings, ...patch }))
		},
		[setRaw, settings],
	)
	return { settings, updateSettings }
}

export type MangaPositionState = {
	/** Linear index of the current page (book-relative). */
	readonly currentPageIndex: number
	readonly setCurrentPageIndex: (index: number) => void
	/** Set while a restore or manual jump is being applied by the view. */
	readonly scrollToPage: number | undefined
	readonly requestScrollTo: (index: number) => void
	readonly clearScrollRequest: () => void
	/** Chapter progress marks for the drawer: chapterIndex → pages seen. */
	readonly chapterProgress: Readonly<Record<number, number>>
}

/**
 * Per-resource reading position: hydrated once from the resource-scoped
 * cache, then written back (debounced) as the reader moves. Hydration
 * is one-shot on purpose — re-applying a cached position after the user
 * has started reading would yank them back. The stored position is
 * chapter-relative (`{ chapterIndex, pageIndex }`); the linear index is
 * derived from the current book.
 */
export function useMangaPosition(
	book: MangaBook | undefined,
): MangaPositionState {
	const api = usePluginAPI()
	const cachedPosition = useMemo(() => {
		return decodeMangaPosition(api.getCache("position"))
	}, [api])
	const cachedProgress = useMemo(() => {
		return decodeMangaProgress(api.getCache("chapterProgress"))
	}, [api])

	const [currentPageIndex, setCurrentPageIndex] = useState(0)
	const [scrollToPage, setScrollToPage] = useState<number | undefined>(
		undefined,
	)
	const [chapterProgress, setChapterProgress] = useState<
		Readonly<Record<number, number>>
	>(cachedProgress?.progress ?? {})
	const progressState: MangaProgress = useMemo(
		() => ({ v: 1, progress: chapterProgress }),
		[chapterProgress],
	)
	const hasHydratedRef = useRef(false)

	useEffect(
		function hydrateOnce() {
			if (hasHydratedRef.current || book === undefined) return
			const { linear } = clampPosition(cachedPosition, book)
			setCurrentPageIndex(linear)
			if (linear > 0) setScrollToPage(linear)
			hasHydratedRef.current = true
		},
		[cachedPosition, book],
	)

	useCacheWriter({
		key: "position",
		value: currentPageIndex,
		encode: encodePageIndexFromBook(book),
		disabled: !hasHydratedRef.current,
	})

	useCacheWriter({
		key: "chapterProgress",
		value: progressState,
		encode: encodeMangaProgress,
		disabled: !hasHydratedRef.current,
	})

	// Record progress whenever the reader lands on a page: the chapter
	// gains credit up to the furthest page seen (scroll-back does not
	// regress a chapter's mark).
	useEffect(
		function markChapterProgress() {
			if (book === undefined) return
			const { chapterIndex, pageInChapter } = chapterOf(book, currentPageIndex)
			setChapterProgress((prev) => {
				const seen = prev[chapterIndex] ?? 0
				const next = pageInChapter + 1
				if (next <= seen) return prev
				return recordChapterProgress(
					{ v: 1, progress: prev },
					chapterIndex,
					next,
				).progress
			})
		},
		[book, currentPageIndex],
	)

	const requestScrollTo = useCallback((index: number) => {
		setScrollToPage(index)
	}, [])
	const clearScrollRequest = useCallback(() => {
		setScrollToPage(undefined)
	}, [])

	return {
		currentPageIndex,
		setCurrentPageIndex,
		scrollToPage,
		requestScrollTo,
		clearScrollRequest,
		chapterProgress,
	}
}

function encodePageIndexFromBook(book: MangaBook | undefined) {
	return (pageIndex: number): string => {
		if (book === undefined)
			return encodeMangaPosition({ v: 2, chapterIndex: 0, pageIndex })
		const location = chapterOf(book, pageIndex)
		return encodeMangaPosition({
			v: 2,
			chapterIndex: location.chapterIndex,
			pageIndex: location.pageInChapter,
		})
	}
}
