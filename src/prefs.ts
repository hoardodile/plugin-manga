export type MangaReadingMode = "scroll" | "paged"

export type MangaPageDirection = "ltr" | "rtl"

/** How a page is fitted inside the paged view. */
export type MangaFitMode = "page" | "width"

/** Reading-canvas background. */
export type MangaBackground = "black" | "theme" | "transparent"

export type MangaSettings = {
	readonly v: 2
	readonly defaultMode: MangaReadingMode
	readonly pageDirection: MangaPageDirection
	readonly showComments: boolean
	/** Paged mode: show two pages as a spread when the book is landscape. */
	readonly spread: boolean
	/** Paged mode fit strategy. */
	readonly fitMode: MangaFitMode
	/** Reading canvas background. */
	readonly background: MangaBackground
}

export const MANGA_SETTINGS_KEY = "settings"

export const MANGA_SETTINGS_DEFAULT: MangaSettings = {
	v: 2,
	defaultMode: "scroll",
	pageDirection: "ltr",
	showComments: true,
	spread: false,
	fitMode: "page",
	background: "transparent",
}

export function encodeMangaSettings(value: MangaSettings): string {
	return JSON.stringify(value)
}

/**
 * Field-by-field tolerant decode. Older persisted settings (v1, and the
 * first v2 release before `spread`/`fitMode`/`background` existed) merge
 * onto the defaults, so a stored object that is missing a field or carries
 * an unrecognised value never crashes the reader — it falls back to the
 * default for that field. Legacy `pageDirection` values still decode.
 */
export function decodeMangaSettings(raw: string): MangaSettings | undefined {
	try {
		const parsed = JSON.parse(raw) as Partial<MangaSettings>
		if (typeof parsed !== "object" || parsed === null) return undefined
		return {
			v: 2,
			defaultMode: parsed.defaultMode === "paged" ? "paged" : "scroll",
			pageDirection: parsed.pageDirection === "rtl" ? "rtl" : "ltr",
			showComments: parsed.showComments !== false,
			spread: parsed.spread === true,
			fitMode: parsed.fitMode === "width" ? "width" : "page",
			background:
				parsed.background === "transparent"
					? "transparent"
					: parsed.background === "theme"
						? "theme"
						: parsed.background === "black"
							? "black"
							: MANGA_SETTINGS_DEFAULT.background,
		}
	} catch {
		return undefined
	}
}
