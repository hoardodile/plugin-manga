import { useCallback, useRef } from "react"

/**
 * Pointer-press tracker that reports taps. A press that drifts more
 * than `tolerancePx` in any direction becomes a drag and is swallowed,
 * so panning or pinching a page never fires a tap.
 *
 * Extracted from the paged view so the press bookkeeping (tracker
 * lifecycle, abort-on-drag, leave handling) stays in one place while
 * the component only decides what a tap means.
 */

type PressTracker = {
	readonly x: number
	readonly y: number
	aborted: boolean
}

export type TapPressHandlers = {
	readonly onPointerDown: (e: React.PointerEvent<HTMLElement>) => void
	readonly onPointerMove: (e: React.PointerEvent<HTMLElement>) => void
	readonly onPointerUp: (e: React.PointerEvent<HTMLElement>) => void
	readonly onPointerLeave: () => void
}

export function useTapTracker(opts: {
	readonly onTap: (e: React.PointerEvent<HTMLElement>) => void
	/** Movement past this (px) turns a press into a drag, not a tap. */
	readonly tolerancePx?: number
}): TapPressHandlers {
	const { onTap, tolerancePx = 8 } = opts
	const pressRef = useRef<PressTracker | undefined>(undefined)
	// Handlers are stable (the ref pattern below), so the latest tap
	// callback stays readable without resubscribing.
	const onTapRef = useRef(onTap)
	onTapRef.current = onTap
	const toleranceRef = useRef(tolerancePx)
	toleranceRef.current = tolerancePx

	const onPointerDown = useCallback(function onPointerDown(
		e: React.PointerEvent<HTMLElement>,
	) {
		if (e.pointerType === "mouse" && e.button !== 0) return
		pressRef.current = { x: e.clientX, y: e.clientY, aborted: false }
	}, [])

	const onPointerMove = useCallback(function onPointerMove(
		e: React.PointerEvent<HTMLElement>,
	) {
		const tracker = pressRef.current
		if (tracker === undefined || tracker.aborted) return
		const dx = Math.abs(e.clientX - tracker.x)
		const dy = Math.abs(e.clientY - tracker.y)
		if (dx > toleranceRef.current || dy > toleranceRef.current) {
			tracker.aborted = true
		}
	}, [])

	const onPointerUp = useCallback(function onPointerUp(
		e: React.PointerEvent<HTMLElement>,
	) {
		const tracker = pressRef.current
		pressRef.current = undefined
		if (tracker === undefined || tracker.aborted) return
		onTapRef.current(e)
	}, [])

	const onPointerLeave = useCallback(function onPointerLeave() {
		pressRef.current = undefined
	}, [])

	return { onPointerDown, onPointerMove, onPointerUp, onPointerLeave }
}
