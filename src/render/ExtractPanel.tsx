import {
	Progress,
	ProgressIndicator,
	ProgressTrack,
} from "@hoardodile/ui/components/progress"
import { useTranslation } from "../i18n"

/**
 * First-materialization progress panel for an archive resource, shown
 * while the host extracts pages. The reader only renders it for the
 * `extracting` state; `idle`/`done` map to "no panel".
 */
export function MangaExtractPanel(props: {
	readonly done: number
	readonly total: number
	/** Transparent reader background: composite through to the host page. */
	readonly transparent?: boolean
}) {
	const { done, total, transparent = false } = props
	const { t } = useTranslation()
	const pct = total > 0 ? Math.min(100, (done / total) * 100) : 0
	return (
		<div
			className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center"
			data-testid="manga-extract-progress"
			style={{ background: transparent ? "transparent" : "var(--background)" }}
		>
			<span className="text-sm text-secondary-foreground">
				{t("extracting")}
			</span>
			<Progress value={pct} className="w-56">
				<ProgressTrack>
					<ProgressIndicator />
				</ProgressTrack>
			</Progress>
			<span className="tabular-nums text-xs text-muted-foreground">
				{done} / {total}
			</span>
		</div>
	)
}
