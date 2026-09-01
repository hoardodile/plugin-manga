import type { Message } from "@hoardodile/sdk-web"
import { Spinner } from "@hoardodile/ui/components/spinner"
import type { Virtualizer } from "@tanstack/react-virtual"
import { useVirtualizer } from "@tanstack/react-virtual"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { MangaPage } from "../shared"
import {
	clampZoom,
	estimatePageHeight,
	resolveActiveIndex,
	resolveRenderWidth,
} from "./helpers"
import { MangaPageCommentOverlay } from "./PageCommentOverlay"
import { useMangaKeyboard } from "./useMangaKeyboard"
import {
	useContainerWidth,
	useScrollTargetAssert,
} from "./useScrollMeasurement"

/**
 * Vertical-scroll page layout with skeleton placeholders.
 *
 * The list is virtualised via `@tanstack/react-virtual` so that long
 * manga only mount the `<img>` elements inside the viewport (plus a
 * small overscan buffer). Each page gets a skeleton placeholder of a
 * fixed estimated height; when the image actually loads it expands
 * naturally. The scrollbar is therefore approximate — acceptable in
 * exchange for zero metadata dependency and minimal layout-shift.
 *
 * The measurement-driven parts (width tracking with page restore, and
 * converging on a scroll target) live in `useScrollMeasurement`.
 *
 * Zoom is delegated to ctrl+wheel.
 */

const MIN_ZOOM = 1
const MAX_ZOOM = 4
const ZOOM_STEP = 0.1
/** Hard cap for the page column width at zoom = 1, in CSS pixels. */
const MAX_RENDER_WIDTH = 900
/** Number of off-screen pages to keep mounted at each end of the window. */
const OVERSCAN = 3
/** Pages within this distance of the active one load eagerly. */
const EAGER_RADIUS = 3

export type MangaScrollViewProps = {
	readonly pages: readonly MangaPage[]
	readonly useOriginal: boolean
	readonly currentPageIndex: number
	readonly onPageVisible: (index: number) => void
	readonly perPageComments: ReadonlyMap<string, readonly Message[]>
	readonly showComments: boolean
	/** Triggers a smooth scroll to a specific page; resets to undefined after. */
	readonly scrollToPage: number | undefined
	readonly onScrollHandled: () => void
	readonly pageSrc: (page: MangaPage) => string
	/**
	 * Pre-known total page count from `fileStats.count`. Used to size
	 * the virtualizer's scrollbar before all `pages` have loaded.
	 */
	readonly expectedCount?: number
}

export function MangaScrollView(props: MangaScrollViewProps) {
	const {
		pages,
		onPageVisible,
		perPageComments,
		showComments,
		scrollToPage,
		onScrollHandled,
		pageSrc,
		expectedCount,
	} = props
	const containerRef = useRef<HTMLDivElement | null>(null)
	const [zoom, setZoom] = useState(1)
	const activePageRef = useRef(0)

	const virtualizerRef = useRef<
		Virtualizer<HTMLDivElement, Element> | undefined
	>(undefined)
	const scrollTarget = useScrollTargetAssert({
		containerRef,
		virtualizerRef,
		onHandled: onScrollHandled,
	})
	const { containerWidth, isResizingRef } = useContainerWidth({
		containerRef,
		virtualizerRef,
		activePageRef,
		onMeasure: scrollTarget.assertTarget,
	})

	const renderWidth = useMemo(
		() =>
			resolveRenderWidth({
				containerWidth,
				zoom,
				maxWidth: MAX_RENDER_WIDTH,
			}),
		[containerWidth, zoom],
	)
	const estimateSize = useCallback(
		function estimateSize(index: number) {
			return estimatePageHeight(pages[index], renderWidth)
		},
		[pages, renderWidth],
	)
	const virtualizer = useVirtualizer({
		count: Math.max(pages.length, expectedCount ?? 0),
		getScrollElement: () => containerRef.current,
		estimateSize,
		overscan: OVERSCAN,
		getItemKey: (index) => pages[index]?.filename ?? index,
		measureElement: (el) => Math.floor(el.getBoundingClientRect().height),
	})
	virtualizerRef.current = virtualizer

	const virtualItems = virtualizer.getVirtualItems()
	const activePageIndex = useMemo(
		() =>
			resolveActiveIndex(containerRef.current?.scrollTop ?? 0, virtualItems),
		[virtualItems],
	)
	useEffect(() => {
		activePageRef.current = activePageIndex
	}, [activePageIndex])

	useEffect(
		function settleScrollTarget() {
			scrollTarget.settle(activePageIndex)
		},
		[activePageIndex, virtualItems, scrollTarget],
	)
	useEffect(
		function reportActive() {
			// A reflow-driven position is not the user's position, and a
			// pending jump must not be overwritten by the drift under it.
			if (isResizingRef.current) return
			if (scrollTarget.hasPendingTarget()) return
			onPageVisible(activePageIndex)
		},
		[activePageIndex, onPageVisible, isResizingRef, scrollTarget],
	)
	useEffect(
		function jumpToTarget() {
			if (scrollToPage === undefined) return
			scrollTarget.requestTarget(scrollToPage)
		},
		[scrollToPage, scrollTarget],
	)
	useEffect(function bindCtrlWheelZoom() {
		const root = containerRef.current
		if (root === null) return
		function onWheel(e: WheelEvent) {
			if (!e.ctrlKey) return
			e.preventDefault()
			const step = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
			setZoom((z) => clampZoom(z + step, MIN_ZOOM, MAX_ZOOM))
		}
		root.addEventListener("wheel", onWheel, { passive: false })
		return () => root.removeEventListener("wheel", onWheel)
	}, [])

	const scrollDown = useCallback(() => {
		const root = containerRef.current
		if (root === null) return
		root.scrollBy({ top: root.clientHeight * 0.9 })
	}, [])
	const scrollUp = useCallback(() => {
		const root = containerRef.current
		if (root === null) return
		root.scrollBy({ top: -root.clientHeight * 0.9 })
	}, [])
	const scrollToTop = useCallback(() => {
		containerRef.current?.scrollTo({ top: 0 })
	}, [])
	const scrollToBottom = useCallback(() => {
		const root = containerRef.current
		if (root === null) return
		root.scrollTo({ top: root.scrollHeight })
	}, [])
	const zoomStep = useCallback((dir: 1 | -1) => {
		setZoom((z) => clampZoom(z + ZOOM_STEP * dir, MIN_ZOOM, MAX_ZOOM))
	}, [])
	const resetZoom = useCallback(() => setZoom(1), [])
	const keyboardHandlers = useMemo(
		() => ({
			prev: scrollUp,
			next: scrollDown,
			first: scrollToTop,
			last: scrollToBottom,
			zoomIn: () => zoomStep(1),
			zoomOut: () => zoomStep(-1),
			fit: resetZoom,
		}),
		[scrollUp, scrollDown, scrollToTop, scrollToBottom, zoomStep, resetZoom],
	)
	useMangaKeyboard({ handlers: keyboardHandlers, enabled: pages.length > 0 })

	// Width starts at 0 before the first layout (and while the host keeps
	// the iframe hidden); rendering items then would size every estimate
	// from a bogus width and guarantee a correction wave once the real
	// width arrives.
	const showItems = renderWidth > 0

	return (
		<div
			ref={containerRef}
			className="manga-scrollbar relative h-full w-full overflow-y-auto"
			style={{ scrollbarGutter: "stable" }}
			data-testid="manga-scroll-view"
		>
			<div
				className="relative mx-auto"
				style={{
					height: `${virtualizer.getTotalSize()}px`,
					width: renderWidth > 0 ? `${renderWidth}px` : "100%",
				}}
			>
				{showItems &&
					virtualItems.map((vi) => {
						const page = pages[vi.index]
						if (page === undefined) return null
						return (
							<div
								key={vi.key}
								data-index={vi.index}
								data-page-index={vi.index}
								ref={virtualizer.measureElement}
								className="absolute left-0 w-full"
								style={{
									transform: `translateY(${vi.start}px)`,
									lineHeight: 0,
								}}
							>
								<MangaPageImage
									page={page}
									pageSrc={pageSrc}
									renderWidth={renderWidth}
									loading={
										Math.abs(vi.index - activePageIndex) <= EAGER_RADIUS
											? "eager"
											: "lazy"
									}
								/>
								<MangaPageCommentOverlay
									comments={perPageComments.get(page.filename) ?? []}
									enabled={showComments && vi.index === activePageIndex}
								/>
							</div>
						)
					})}
			</div>
		</div>
	)
}

function MangaPageImage(props: {
	readonly page: MangaPage
	readonly pageSrc: (page: MangaPage) => string
	readonly renderWidth: number
	readonly loading?: "eager" | "lazy"
}) {
	const { page, pageSrc, renderWidth, loading } = props
	const [loaded, setLoaded] = useState(false)
	const skeletonHeight = useMemo(
		() => estimatePageHeight(page, renderWidth),
		[page, renderWidth],
	)
	return (
		<div
			className="relative w-full"
			style={loaded ? undefined : { minHeight: skeletonHeight }}
		>
			{!loaded && (
				<div
					className="manga-page-skeleton absolute inset-0"
					data-testid="manga-page-skeleton"
				>
					{/* A full-page opacity pulse repaints the whole viewport every
					    frame and saturates the renderer while pages stream in;
					    the loading cue stays, shrunk to a tiny composited icon. */}
					<Spinner className="absolute left-1/2 top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 animate-spin text-neutral-600" />
				</div>
			)}
			<img
				src={pageSrc(page)}
				alt={page.filename}
				loading={loading ?? "lazy"}
				decoding="async"
				className="block w-full select-none"
				draggable={false}
				onLoad={() => setLoaded(true)}
			/>
		</div>
	)
}
