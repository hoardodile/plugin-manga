import { useExtractProgress } from "@hoardodile/sdk-react"
import { booleanCodec } from "@hoardodile/sdk-web"
import { useCallback, useMemo, useState } from "react"
import { chapterOf, chapterStart, linearIndexOf } from "../core/book.ts"
import { useTranslation } from "../i18n"
import { MangaChapterList } from "./ChapterList"
import { MangaCommentSendBar } from "./CommentSendBar"
import { buildPerPageComments, pageSrcOf } from "./helpers"
import { useAnchorJump, usePluginAPI } from "./hooks"
import { MangaPagedView } from "./PagedView"
import { MangaScrollView } from "./ScrollView"
import { MangaTopBar } from "./TopBar"
import { useMangaBook } from "./useMangaBook"
import { useMangaPosition, useMangaSettings } from "./useMangaReaderState"

/**
 * Manga reader. Routes between scroll and paged view, and wires the
 * persisted reader state (settings pref, per-resource chapter+page
 * position, per-chapter progress) to page-anchored comments rendered as
 * a bullet-screen marquee and a chapter directory drawer.
 */
export function MangaReader() {
	const api = usePluginAPI()
	const { t } = useTranslation()
	const [useOriginal, setUseOriginal] = api.usePref(
		"viewOriginal",
		false,
		booleanCodec(),
	)
	const toggleUseOriginal = useCallback(() => {
		setUseOriginal(!useOriginal)
	}, [setUseOriginal, useOriginal])

	const { book, pages, expectedCount } = useMangaBook()
	const { settings, updateSettings } = useMangaSettings()
	const position = useMangaPosition(book)
	const {
		currentPageIndex,
		setCurrentPageIndex,
		scrollToPage,
		requestScrollTo,
		clearScrollRequest,
		chapterProgress,
	} = position
	const [chaptersOpen, setChaptersOpen] = useState(false)

	// First materialization of an archive resource happens inside the
	// `listFiles` hook — surface it while the query is still loading.
	// (The SDK hook reports `idle`/`done` when nothing is being
	// materialized; both map to "no progress panel".)
	const extractState = useExtractProgress()
	const extractProgress =
		extractState.state === "extracting" ? extractState : undefined

	// Reactive list, refreshed via the host's `messages` invalidation.
	const commentsQuery = api.useMessageList()
	const perPageComments = useMemo(
		() => buildPerPageComments(commentsQuery.data ?? []),
		[commentsQuery.data],
	)

	const mode = settings.defaultMode
	const toggleMode = useCallback(() => {
		updateSettings({ defaultMode: mode === "scroll" ? "paged" : "scroll" })
	}, [mode, updateSettings])
	const toggleComments = useCallback(() => {
		updateSettings({ showComments: !settings.showComments })
	}, [settings.showComments, updateSettings])

	// Page → URL resolution: every page resolves through the single
	// `resolveFileUrl` (originals vs. the preview variant), whether it is a
	// bare file, a zip virtual entry or a materialized non-zip entry.
	const pageSrc = useCallback(
		(page: (typeof pages)[number]) =>
			pageSrcOf(api.resolveFileUrl, page, useOriginal),
		[api, useOriginal],
	)

	const jumpToPage = useCallback(
		(index: number) => {
			const clamped = Math.max(0, Math.min(pages.length - 1, index))
			setCurrentPageIndex(clamped)
			// The paged view renders the current index directly; only the
			// scroll view needs to be told to travel there.
			if (mode === "scroll") requestScrollTo(clamped)
		},
		[pages.length, mode, setCurrentPageIndex, requestScrollTo],
	)

	const jumpToChapter = useCallback(
		(chapterIndex: number) => {
			if (book === undefined) return
			jumpToPage(chapterStart(book, chapterIndex))
			setChaptersOpen(false)
		},
		[book, jumpToPage],
	)

	useAnchorJump(function handleAnchorJump(anchor) {
		const byFilename = pages.findIndex((p) => p.filename === anchor.filename)
		if (byFilename !== -1) {
			jumpToPage(byFilename)
			return
		}
		if (book !== undefined) {
			jumpToPage(linearIndexOf(book, anchor.chapter, anchor.page))
		}
	})

	const currentFile = pages[currentPageIndex]
	const currentLocation =
		book === undefined
			? { chapterIndex: 0, pageInChapter: currentPageIndex }
			: chapterOf(book, currentPageIndex)
	const currentChapter = book?.chapters[currentLocation.chapterIndex]
	const showOriginalToggle = currentFile?.preview === true

	return (
		<div className="relative flex h-full w-full flex-col bg-black text-white">
			<MangaTopBar
				pageIndex={currentPageIndex}
				pageCount={expectedCount}
				chapterIndex={currentLocation.chapterIndex}
				chapterCount={book?.chapterCount ?? 0}
				chapterTitle={currentChapter?.title}
				mode={mode}
				showComments={settings.showComments}
				useOriginal={useOriginal}
				// The toggle is a no-op for pages without a preview variant
				// (small or already-efficient files always serve the original)
				// — hide it there instead of offering a dead button.
				showOriginalToggle={showOriginalToggle}
				onOpenChapters={() => setChaptersOpen(true)}
				onToggleMode={toggleMode}
				onToggleComments={toggleComments}
				onToggleOriginal={toggleUseOriginal}
				onJump={jumpToPage}
			/>
			<div className="relative flex-1 overflow-hidden">
				{extractProgress !== undefined ? (
					<div
						className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-white/70"
						data-testid="manga-extract-progress"
					>
						<span>{t("extracting")}</span>
						<span className="tabular-nums text-white/50">
							{extractProgress.done} / {extractProgress.total}
						</span>
					</div>
				) : mode === "scroll" ? (
					<MangaScrollView
						pages={pages}
						useOriginal={useOriginal}
						currentPageIndex={currentPageIndex}
						onPageVisible={setCurrentPageIndex}
						perPageComments={perPageComments}
						showComments={settings.showComments}
						scrollToPage={scrollToPage}
						onScrollHandled={clearScrollRequest}
						pageSrc={pageSrc}
						expectedCount={expectedCount}
					/>
				) : (
					<MangaPagedView
						pages={pages}
						currentPageIndex={currentPageIndex}
						onChangePage={setCurrentPageIndex}
						perPageComments={perPageComments}
						showComments={settings.showComments}
						direction={settings.pageDirection}
						pageSrc={pageSrc}
					/>
				)}
			</div>
			{currentFile !== undefined ? (
				<div className="border-t border-white/10 bg-black/60 p-2">
					<MangaCommentSendBar
						filename={currentFile.filename}
						chapter={currentLocation.chapterIndex}
						page={currentLocation.pageInChapter}
					/>
				</div>
			) : null}
			{book !== undefined ? (
				<MangaChapterList
					open={chaptersOpen}
					onOpenChange={setChaptersOpen}
					book={book}
					currentChapter={currentLocation.chapterIndex}
					chapterProgress={chapterProgress}
					onJump={jumpToChapter}
				/>
			) : null}
		</div>
	)
}
