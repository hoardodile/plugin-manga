import type { Virtualizer } from "@tanstack/react-virtual"
import { useCallback, useEffect, useRef, useState } from "react"

/**
 * The two measurement-driven state machines behind the scroll view.
 * Both exist because the reader is measured *after* it is told where to
 * go — the iframe may still be hidden, and images above the target load
 * late — so a single imperative scroll is never enough. Pulling them
 * out of the view leaves the component as layout plus a render loop.
 */

/**
 * Upper bound for re-asserting a scroll target against measurement
 * corrections; generous enough for a full page-load cascade, small
 * enough to never spin forever.
 */
export const MAX_SCROLL_ASSERTS = 60
/** Settle window after a width change before restoring the page. */
const RESIZE_SETTLE_MS = 150

type ScrollVirtualizer = Virtualizer<HTMLDivElement, Element>
/**
 * The virtualizer is created after these hooks (it depends on the width
 * they measure), so they only ever reach it through a ref that is still
 * empty on the very first render pass.
 */
type ScrollVirtualizerRef = React.RefObject<ScrollVirtualizer | undefined>

/**
 * Track the container width and, when it changes, put the reader back
 * on the page the user was reading. A width change reflows every page
 * height, so the raw `scrollTop` is meaningless afterwards.
 *
 * `isResizing` stays true across the restore so the view can suppress
 * page-visible reports that would otherwise record whatever page the
 * reflow happened to expose.
 */
export function useContainerWidth(opts: {
	readonly containerRef: React.RefObject<HTMLDivElement | null>
	readonly virtualizerRef: ScrollVirtualizerRef
	readonly activePageRef: React.RefObject<number>
	/** Re-asserts a pending scroll target once real dimensions arrive. */
	readonly onMeasure: () => void
}): {
	readonly containerWidth: number
	readonly isResizingRef: React.RefObject<boolean>
} {
	const { containerRef, virtualizerRef, activePageRef, onMeasure } = opts
	const [containerWidth, setContainerWidth] = useState(0)
	const widthRef = useRef(0)
	const pendingRestoreRef = useRef<number | undefined>(undefined)
	const settleTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
		undefined,
	)
	const isResizingRef = useRef(false)
	const onMeasureRef = useRef(onMeasure)
	onMeasureRef.current = onMeasure

	useEffect(
		function trackContainerWidth() {
			const root = containerRef.current
			if (root === null) return

			function update() {
				if (root === null) return
				// The iframe may have been hidden on mount; a pending scroll
				// target becomes reachable as soon as real dimensions arrive.
				onMeasureRef.current()
				if (widthRef.current > 0 && root.clientWidth !== widthRef.current) {
					scheduleRestore()
				}
				widthRef.current = root.clientWidth
				setContainerWidth(root.clientWidth)
			}

			function scheduleRestore() {
				pendingRestoreRef.current ??= activePageRef.current
				isResizingRef.current = true
				if (settleTimerRef.current !== undefined) {
					clearTimeout(settleTimerRef.current)
				}
				settleTimerRef.current = setTimeout(() => {
					const target = pendingRestoreRef.current
					if (target === undefined) return
					pendingRestoreRef.current = undefined
					virtualizerRef.current?.scrollToIndex(target, { align: "start" })
					// Two frames: one for the scroll to apply, one for the
					// virtualizer's measurement pass to settle behind it.
					requestAnimationFrame(() => {
						requestAnimationFrame(() => {
							isResizingRef.current = false
						})
					})
				}, RESIZE_SETTLE_MS)
			}

			update()
			const observer = new ResizeObserver(update)
			observer.observe(root)
			return () => {
				observer.disconnect()
				if (settleTimerRef.current !== undefined) {
					clearTimeout(settleTimerRef.current)
				}
			}
		},
		[containerRef, virtualizerRef, activePageRef],
	)

	return { containerWidth, isResizingRef }
}

export type ScrollTargetController = {
	/** Re-assert the pending target; safe to call on every measurement. */
	readonly assertTarget: () => void
	/** Begin converging on `index`. */
	readonly requestTarget: (index: number) => void
	/** Clear the target once `activeIndex` has reached it, or give up. */
	readonly settle: (activeIndex: number) => void
	readonly hasPendingTarget: () => boolean
}

/**
 * Converge on a scroll target across measurement corrections.
 *
 * Two hazards make a single `scrollToIndex` insufficient:
 *  - the host keeps the iframe `display:none` until it finishes
 *    positioning it, where any scroll is a silent no-op;
 *  - images above the target load *after* the jump, and the virtualizer
 *    applies size corrections via `transform` — which the browser's
 *    scroll anchoring does not compensate — so content drifts under a
 *    static `scrollTop`.
 */
export function useScrollTargetAssert(opts: {
	readonly containerRef: React.RefObject<HTMLDivElement | null>
	readonly virtualizerRef: ScrollVirtualizerRef
	readonly onHandled: () => void
}): ScrollTargetController {
	const { containerRef, virtualizerRef, onHandled } = opts
	const pendingRef = useRef<number | undefined>(undefined)
	const assertsRef = useRef(0)
	const onHandledRef = useRef(onHandled)
	onHandledRef.current = onHandled

	const finish = useCallback(() => {
		pendingRef.current = undefined
		onHandledRef.current()
	}, [])

	const assertTarget = useCallback(() => {
		const target = pendingRef.current
		if (target === undefined) return
		const root = containerRef.current
		const virtualizer = virtualizerRef.current
		// A zero-height container means the iframe is still hidden; the
		// next measurement will try again.
		if (root === null || root.clientHeight === 0) return
		if (virtualizer === undefined) return
		// Bound the convergence loop; giving up is safe because reporting
		// resumes from the actually-visible page.
		if (assertsRef.current >= MAX_SCROLL_ASSERTS) {
			finish()
			return
		}
		assertsRef.current += 1
		virtualizer.scrollToIndex(target, { align: "start" })
	}, [containerRef, finish, virtualizerRef])

	const requestTarget = useCallback(
		(index: number) => {
			pendingRef.current = index
			assertsRef.current = 0
			assertTarget()
		},
		[assertTarget],
	)

	const settle = useCallback(
		(activeIndex: number) => {
			const target = pendingRef.current
			if (target === undefined) return
			if (activeIndex === target) {
				finish()
				return
			}
			assertTarget()
		},
		[assertTarget, finish],
	)

	return {
		assertTarget,
		requestTarget,
		settle,
		hasPendingTarget: () => pendingRef.current !== undefined,
	}
}
