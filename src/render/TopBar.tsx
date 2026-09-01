import { Button } from "@hoardodile/ui/components/button"
import { Icon } from "@hoardodile/ui/components/icon"
import {
	Book,
	ChatRoundDots,
	ChatRoundLine,
	Gallery,
	List,
} from "@hoardodile/ui/icons/registry"
import { useEffect, useState } from "react"
import { useTranslation } from "../i18n"
import type { MangaReadingMode } from "../prefs"

/**
 * Reader chrome: chapter label with directory button, page indicator
 * with jump field, reading-mode toggle, comment toggle and the
 * original/preview switch.
 */
export type MangaTopBarProps = {
	readonly pageIndex: number
	readonly pageCount: number
	readonly chapterIndex: number
	readonly chapterCount: number
	readonly chapterTitle: string | undefined
	readonly mode: MangaReadingMode
	readonly showComments: boolean
	readonly useOriginal: boolean
	readonly showOriginalToggle: boolean
	readonly onOpenChapters: () => void
	readonly onToggleMode: () => void
	readonly onToggleComments: () => void
	readonly onToggleOriginal: () => void
	readonly onJump: (index: number) => void
}

const TOOL_BUTTON_CLASS = "h-7 gap-1 px-2 text-xs text-white hover:bg-white/10"

export function MangaTopBar(props: MangaTopBarProps) {
	const {
		pageIndex,
		pageCount,
		chapterIndex,
		chapterCount,
		chapterTitle,
		mode,
		showComments,
		useOriginal,
		showOriginalToggle,
		onOpenChapters,
		onToggleMode,
		onToggleComments,
		onToggleOriginal,
		onJump,
	} = props
	const { t } = useTranslation()
	return (
		<div className="flex items-center justify-between gap-2 border-b border-white/10 bg-black/60 px-3 py-2 text-sm">
			<div className="flex min-w-0 items-center gap-2">
				<MangaChapterJumpButton
					chapterIndex={chapterIndex}
					chapterCount={chapterCount}
					chapterTitle={chapterTitle}
					onOpenChapters={onOpenChapters}
				/>
				<MangaPageJumpInput
					pageIndex={pageIndex}
					pageCount={pageCount}
					onJump={onJump}
				/>
			</div>
			<div className="flex items-center gap-1">
				{showOriginalToggle ? (
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={onToggleOriginal}
						className={TOOL_BUTTON_CLASS}
						data-testid="manga-original-toggle"
					>
						{useOriginal ? t("showPreview") : t("showOriginal")}
					</Button>
				) : null}
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onClick={onToggleMode}
					className={TOOL_BUTTON_CLASS}
					data-testid="manga-mode-toggle"
				>
					{mode === "scroll" ? <Icon icon={List} /> : <Icon icon={Gallery} />}
					{t(mode === "scroll" ? "modeScroll" : "modePaged")}
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onClick={onToggleComments}
					className={TOOL_BUTTON_CLASS}
					data-testid="manga-comments-toggle"
				>
					{showComments ? (
						<Icon icon={ChatRoundLine} />
					) : (
						<Icon icon={ChatRoundDots} />
					)}
				</Button>
			</div>
		</div>
	)
}

/**
 * Chapter indicator: opens the chapter directory when the book has
 * chapters; a flat book shows nothing here.
 */
function MangaChapterJumpButton(props: {
	readonly chapterIndex: number
	readonly chapterCount: number
	readonly chapterTitle: string | undefined
	readonly onOpenChapters: () => void
}) {
	const { chapterIndex, chapterCount, chapterTitle, onOpenChapters } = props
	const { t } = useTranslation()
	if (chapterCount <= 1 && chapterTitle === undefined) return null
	const label =
		chapterTitle ??
		t("chapterLabel", { chapter: chapterIndex + 1, total: chapterCount })
	return (
		<Button
			type="button"
			variant="ghost"
			size="sm"
			onClick={onOpenChapters}
			className={`${TOOL_BUTTON_CLASS} max-w-40 justify-start`}
			data-testid="manga-chapter-button"
			title={t("chapters")}
		>
			<Icon icon={Book} />
			<span className="truncate">{label}</span>
		</Button>
	)
}

/**
 * Page number as an editable field. While focused the draft is the
 * user's, so incoming page changes from scrolling must not overwrite it.
 */
function MangaPageJumpInput(props: {
	readonly pageIndex: number
	readonly pageCount: number
	readonly onJump: (index: number) => void
}) {
	const { pageIndex, pageCount, onJump } = props
	const { t } = useTranslation()
	const [draft, setDraft] = useState("")
	const [editing, setEditing] = useState(false)
	useEffect(() => {
		if (!editing) setDraft(String(pageIndex + 1))
	}, [pageIndex, editing])

	function commit() {
		setEditing(false)
		const parsed = Number.parseInt(draft, 10)
		if (Number.isNaN(parsed)) {
			setDraft(String(pageIndex + 1))
			return
		}
		const target = Math.max(0, Math.min(pageCount - 1, parsed - 1))
		onJump(target)
		setDraft(String(target + 1))
	}

	return (
		<span
			className="flex items-center gap-1 text-xs text-white/80"
			data-testid="manga-page-indicator"
		>
			<input
				type="text"
				inputMode="numeric"
				value={draft}
				onFocus={(e) => {
					setEditing(true)
					e.currentTarget.select()
				}}
				onChange={(e) => setDraft(e.target.value)}
				onBlur={commit}
				onKeyDown={(e) => {
					if (e.key === "Enter") {
						e.currentTarget.blur()
					} else if (e.key === "Escape") {
						setDraft(String(pageIndex + 1))
						e.currentTarget.blur()
					}
				}}
				className="w-12 rounded border border-white/20 bg-transparent px-1 py-0.5 text-center tabular-nums text-white outline-hidden focus:border-white/60"
				aria-label={t("page")}
				data-testid="manga-page-jump-input"
			/>
			<span>{t("pageCount", { total: pageCount })}</span>
		</span>
	)
}
