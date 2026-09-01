import { Button } from "@hoardodile/ui/components/button"
import { Icon } from "@hoardodile/ui/components/icon"
import { Input } from "@hoardodile/ui/components/input"
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@hoardodile/ui/components/popover"
import {
	Book,
	ChatRoundDots,
	ChatRoundLine,
	Gallery,
	ListVertical,
	Settings,
} from "@hoardodile/ui/icons/registry"
import { useEffect, useState } from "react"
import { useTranslation } from "../i18n"
import type { MangaReadingMode, MangaSettings } from "../prefs"
import { MangaSettingsPopover } from "./SettingsPopover"

/**
 * Reader chrome: chapter label with directory button, page indicator
 * with jump field, reading-mode toggle, comment toggle, the
 * original/preview switch and a settings popover. All surfaces follow
 * the host theme via design-system tokens.
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
	readonly settings: MangaSettings
	readonly onOpenChapters: () => void
	readonly onToggleMode: () => void
	readonly onToggleComments: () => void
	readonly onToggleOriginal: () => void
	readonly onUpdateSettings: (patch: Partial<MangaSettings>) => void
	readonly onJump: (index: number) => void
}

const TOOL_BUTTON_CLASS =
	"h-7 gap-1 px-2 text-xs text-secondary-foreground hover:bg-accent"

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
		settings,
		onOpenChapters,
		onToggleMode,
		onToggleComments,
		onToggleOriginal,
		onUpdateSettings,
		onJump,
	} = props
	const { t } = useTranslation()
	return (
		<div className="h-nav shrink-0 border-b border-border bg-background">
			<div className="flex h-full items-center justify-between gap-2 px-3">
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
						active={mode === "paged"}
						onClick={onToggleMode}
						className={TOOL_BUTTON_CLASS}
						data-testid="manga-mode-toggle"
						aria-pressed={mode === "paged"}
					>
						{mode === "scroll" ? (
							<Icon icon={ListVertical} />
						) : (
							<Icon icon={Gallery} />
						)}
						{t(mode === "scroll" ? "modeScroll" : "modePaged")}
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						active={showComments}
						onClick={onToggleComments}
						className={TOOL_BUTTON_CLASS}
						data-testid="manga-comments-toggle"
						aria-pressed={showComments}
					>
						{showComments ? (
							<Icon icon={ChatRoundLine} />
						) : (
							<Icon icon={ChatRoundDots} />
						)}
					</Button>
					<Popover closeOnBlur>
						<PopoverTrigger
							render={
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className={TOOL_BUTTON_CLASS}
									data-testid="manga-settings-toggle"
									aria-label={t("settings")}
								/>
							}
						>
							<Icon icon={Settings} />
						</PopoverTrigger>
						<PopoverContent align="end" side="bottom" sideOffset={4}>
							<MangaSettingsPopover
								settings={settings}
								onChange={onUpdateSettings}
							/>
						</PopoverContent>
					</Popover>
				</div>
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
			className="flex items-center gap-1 text-xs text-muted-foreground"
			data-testid="manga-page-indicator"
		>
			<Input
				type="text"
				inputMode="numeric"
				size="sm"
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
				className="w-12 text-center tabular-nums"
				aria-label={t("page")}
				data-testid="manga-page-jump-input"
			/>
			<span>{t("pageCount", { total: pageCount })}</span>
		</span>
	)
}
