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
 * state, jumpable in one tap. The current chapter is highlighted; each
 * chapter reads as unread / in-progress / read.
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
			<SheetContent side="right" className="w-80 bg-card text-card-foreground">
				<SheetHeader>
					<SheetTitle className="text-sm">{t("chapters")}</SheetTitle>
					<SheetDescription className="text-xs text-muted-foreground">
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
										className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-accent ${
											current
												? "bg-accent text-accent-foreground"
												: "text-foreground"
										}`}
									>
										<span className="truncate">
											{chapter.title ?? t("chapterDefault")}
										</span>
										<span className="flex shrink-0 items-center gap-2 text-xs tabular-nums text-muted-foreground">
											{finished ? (
												<span
													className="text-secondary-foreground"
													data-testid="manga-chapter-read"
												>
													{t("chapterRead")}
												</span>
											) : seen > 0 ? (
												<span className="text-secondary-foreground">
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
