/**
 * Tap geometry for the paged view. The viewport splits into a centre
 * strip and two wings; the strip is reserved for double-click zoom,
 * and a tap on a wing turns the page. Pure on purpose so the zone
 * rules (and the reading-direction flip) are testable without a DOM.
 */

/** Share of the viewport width reserved as the centre zoom strip. */
export const CENTER_STRIP_FRACTION = 1 / 3

export type TapZone = "center" | "left" | "right"

/** Which zone an x-offset inside a `width`-wide viewport lands in. */
export function tapZoneFor(width: number, offsetX: number): TapZone {
	const centerHalf = (width * CENTER_STRIP_FRACTION) / 2
	const middle = width / 2
	if (offsetX >= middle - centerHalf && offsetX <= middle + centerHalf) {
		return "center"
	}
	return offsetX < middle ? "left" : "right"
}

/**
 * Which page a tap in `zone` should turn to, honouring the reading
 * direction: in RTL the left wing advances instead of going back.
 * `undefined` for the centre strip (dwell to double-click, no flip).
 */
export function turnForZone(
	direction: "ltr" | "rtl",
	zone: TapZone,
): "prev" | "next" | undefined {
	if (zone === "center") return undefined
	const left = direction === "rtl" ? "next" : "prev"
	return zone === "left" ? left : direction === "rtl" ? "prev" : "next"
}
