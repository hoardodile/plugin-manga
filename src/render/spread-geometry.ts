/**
 * Spread (two-page) geometry for the paged view.
 *
 * A manga "spread" (見開き) is the artist's two-page unit. When the reader
 * shows spreads, consecutive pages are paired into a single screen. A page
 * whose own aspect ratio is already landscape-wide (`width/height >=
 * NATIVE_SPREAD_RATIO`) is treated as a pre-joined spread and occupies a
 * screen alone — the reader never splits a page that is already a spread.
 *
 * Everything here is pure so the pairing rules are testable without a DOM.
 * Reading direction (LTR/RTL) does not change which pages pair — it only
 * decides which page sits on the left/right in that screen, which the view
 * resolves at render time.
 */

/** Aspect ratio at or above which a page is its own spread. */
export const NATIVE_SPREAD_RATIO = 1.5

/** One screen of the paged view: a page range in reading order. */
export type SpreadScreen = {
	/** Reading-order index of the first page in the screen. */
	readonly first: number
	/** Reading-order index of the last page (`=== first` for a single page). */
	readonly last: number
}

/** True when the page is already a spread (landscape-wide). */
export function isNativeSpread(
	page: { readonly width?: number; readonly height?: number } | undefined,
): boolean {
	if (page === undefined) return false
	const { width: w, height: h } = page
	if (w === undefined || h === undefined || w <= 0 || h <= 0) return false
	return w / h >= NATIVE_SPREAD_RATIO
}

/**
 * Pair consecutive pages into screens. A native-width page takes a screen
 * alone; otherwise two consecutive (non-native) pages pair, and a trailing
 * orphan page gets a single-page screen.
 */
export function buildScreens(
	pages: readonly (
		| { readonly width?: number; readonly height?: number }
		| undefined
	)[],
): { readonly screens: readonly SpreadScreen[]; readonly screenCount: number } {
	const screens: SpreadScreen[] = []
	let i = 0
	while (i < pages.length) {
		if (isNativeSpread(pages[i])) {
			screens.push({ first: i, last: i })
			i += 1
			continue
		}
		const next = i + 1
		if (next < pages.length && !isNativeSpread(pages[next])) {
			screens.push({ first: i, last: next })
			i += 2
		} else {
			screens.push({ first: i, last: i })
			i += 1
		}
	}
	return { screens, screenCount: screens.length }
}

/**
 * The screen containing a reading-order page index. Screens are contiguous
 * and ascending by `first`, so we binary-search on the first page.
 */
export function screenOf(
	screens: readonly SpreadScreen[],
	pageIndex: number,
): number {
	if (screens.length === 0) return 0
	let lo = 0
	let hi = screens.length - 1
	while (lo < hi) {
		const mid = (lo + hi + 1) >> 1
		if (screens[mid]!.first <= pageIndex) lo = mid
		else hi = mid - 1
	}
	return lo
}

/** Number of pages a screen holds (1 or 2). */
export function screenPageCount(screen: SpreadScreen): number {
	return screen.last - screen.first + 1
}
