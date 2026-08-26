import { ScrollArea } from "@hoardodile/ui/components/scroll-area"
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@hoardodile/ui/components/sheet"
import type { MangaBook } from "../core/book.ts"
import { chapterEnd, chapterStart } from "../core/book.ts"
import { useTranslation } from "../i18n"

/**
 * Chapter directory drawer: every chapter with its page range and read
 * progress, jumpable in one tap. The current chapter is highlighted.
 */
export function MangaChapterList(props: {
	readonly open: boolean
	readonly onOpenChange: (open: boolean) => void
	readonly book: MangaBook
	readonly currentChapter: number
	/** chapterIndex → pages seen (from the reader position hook). */
	readonly chapterProgress: Readonly<Record<number, number>>
	readonly onJump: (chapterIndex: number) => void
}) {
	const { open, onOpenChange, book, currentChapter, chapterProgress, onJump } =
		props
	const { t } = useTranslation()
	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent side="right" className="w-80 bg-black/95 text-white">
				<SheetHeader>
					<SheetTitle className="text-sm text-white">
						{t("chapters")}
					</SheetTitle>
					<SheetDescription className="text-xs text-white/50">
						{t("chaptersCount", { total: book.chapterCount })}
					</SheetDescription>
				</SheetHeader>
				<ScrollArea className="h-full">
					<ol
						className="flex flex-col gap-1 p-2"
						data-testid="manga-chapter-list"
					>
						{book.chapters.map((chapter) => {
							const seen = chapterProgress[chapter.index] ?? 0
							const finished = seen >= chapter.pageCount
							const current = chapter.index === currentChapter
							const range = `${chapterStart(book, chapter.index) + 1}–${chapterEnd(book, chapter.index)}`
							return (
								<li key={chapter.index}>
									<button
										type="button"
										onClick={() => onJump(chapter.index)}
										data-testid={`manga-chapter-${chapter.index}`}
										className={`flex w-full items-center justify-between gap-2 rounded px-3 py-2 text-left text-sm transition-colors hover:bg-white/10 ${
											current ? "bg-white/15 text-white" : "text-white/80"
										}`}
									>
										<span className="truncate">
											{chapter.title ?? t("chapterDefault")}
										</span>
										<span className="flex shrink-0 items-center gap-2 text-xs tabular-nums text-white/50">
											{finished ? (
												<span
													className="text-emerald-400"
													data-testid="manga-chapter-read"
												>
													{t("chapterRead")}
												</span>
											) : seen > 0 ? (
												<span className="text-white/60">
													{t("chapterProgress", {
														current: seen,
														total: chapter.pageCount,
													})}
												</span>
											) : (
												<span className="tabular-nums">
													{chapter.pageCount}
												</span>
											)}
											<span className="tabular-nums">{range}</span>
										</span>
									</button>
								</li>
							)
						})}
					</ol>
				</ScrollArea>
			</SheetContent>
		</Sheet>
	)
}
