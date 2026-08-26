import type { Message } from "@hoardodile/sdk-web"
import { useCallback, useEffect, useRef } from "react"
import {
	type ReactZoomPanPinchRef,
	TransformComponent,
	TransformWrapper,
} from "react-zoom-pan-pinch"
import type { MangaPage } from "../shared"
import { MangaPageCommentOverlay } from "./PageCommentOverlay"
import { tapZoneFor, turnForZone } from "./paged-geometry"
import { useTapTracker } from "./useTapTracker"

/**
 * Single-page view. The `react-zoom-pan-pinch` wrapper handles
 * two-finger pinch on touch devices and mouse-wheel zoom. The
 * library's built-in double-click-zoom is disabled in favour of a
 * dedicated central strip: only double-clicks landing inside the
 * middle third of the viewport zoom; double-clicks on the left /
 * right wings turn the page like a single tap, so the user cannot
 * accidentally zoom while flipping pages quickly. Page navigation
 * is driven by tapping the left or right wing (with `direction`
 * deciding which side advances); arrow keys mirror the same intent.
 */
export function MangaPagedView(props: {
	readonly pages: readonly MangaPage[]
	readonly currentPageIndex: number
	readonly onChangePage: (index: number) => void
	readonly perPageComments: ReadonlyMap<string, readonly Message[]>
	readonly showComments: boolean
	readonly direction: "ltr" | "rtl"
	readonly pageSrc: (page: MangaPage) => string
}) {
	const {
		pages,
		currentPageIndex,
		onChangePage,
		perPageComments,
		showComments,
		direction,
		pageSrc,
	} = props
	const transformRef = useRef<ReactZoomPanPinchRef | null>(null)
	const containerRef = useRef<HTMLDivElement | null>(null)
	const page = pages[currentPageIndex]
	// Reset zoom whenever the active page changes so each page starts
	// fit-to-view; without this the panned offset of the previous page
	// would carry over.
	useEffect(() => {
		transformRef.current?.resetTransform(0)
	}, [currentPageIndex])
	// Eagerly fetch the immediate neighbours so flipping forward /
	// backward swaps the `<img>` src against an already-warm browser
	// cache. We only preload ±1 here; the user's intent on the next
	// keystroke is one neighbour away, anything farther is speculation
	// and would just waste bandwidth on huge volumes.
	useEffect(
		function preloadNeighbours() {
			const targets: number[] = []
			if (currentPageIndex + 1 < pages.length) {
				targets.push(currentPageIndex + 1)
			}
			if (currentPageIndex - 1 >= 0) targets.push(currentPageIndex - 1)
			const imgs = targets.map(function preload(idx) {
				const p = pages[idx]
				if (p === undefined) return undefined
				const img = new Image()
				img.decoding = "async"
				img.src = pageSrc(p)
				return img
			})
			return function cancelPreload() {
				for (const img of imgs) {
					if (img !== undefined) img.src = ""
				}
			}
		},
		[pages, currentPageIndex, pageSrc],
	)
	const goPrev = useCallback(
		function goPrev() {
			if (currentPageIndex > 0) onChangePage(currentPageIndex - 1)
		},
		[currentPageIndex, onChangePage],
	)
	const goNext = useCallback(
		function goNext() {
			if (currentPageIndex < pages.length - 1) {
				onChangePage(currentPageIndex + 1)
			}
		},
		[currentPageIndex, pages.length, onChangePage],
	)
	useEffect(() => {
		function onKey(e: KeyboardEvent) {
			if (e.key === "ArrowRight") {
				if (direction === "rtl") goPrev()
				else goNext()
			} else if (e.key === "ArrowLeft") {
				if (direction === "rtl") goNext()
				else goPrev()
			}
		}
		window.addEventListener("keydown", onKey)
		return () => window.removeEventListener("keydown", onKey)
	}, [goPrev, goNext, direction])

	const tapHandlers = useTapTracker({
		onTap: function handleTap(e) {
			const root = containerRef.current
			if (root === null) return
			const rect = root.getBoundingClientRect()
			const zone = tapZoneFor(rect.width, e.clientX - rect.left)
			const turn = turnForZone(direction, zone)
			// The centre strip is reserved for click-to-zoom
			// (double-click); a single tap there is a no-op so the user
			// can dwell to double-click without page-flipping by accident.
			if (turn === "prev") goPrev()
			else if (turn === "next") goNext()
		},
	})

	const handleDoubleClick = useCallback(function handleDoubleClick(
		e: React.MouseEvent<HTMLDivElement>,
	) {
		const root = containerRef.current
		if (root === null) return
		const rect = root.getBoundingClientRect()
		if (tapZoneFor(rect.width, e.clientX - rect.left) !== "center") return
		const api = transformRef.current
		if (api === undefined || api === null) return
		// Toggle: if already zoomed in, reset; otherwise zoom toward
		// the click point so the gesture mirrors the library's old
		// `doubleClick.mode = "zoomIn"` behaviour but constrained to
		// the central strip.
		const scale = api.state.scale
		if (scale > 1.01) api.resetTransform()
		else api.zoomIn(2)
	}, [])
	if (page === undefined) return null
	return (
		<div
			ref={containerRef}
			className="relative h-full w-full bg-black"
			data-testid="manga-paged-view"
			onPointerDown={tapHandlers.onPointerDown}
			onPointerMove={tapHandlers.onPointerMove}
			onPointerUp={tapHandlers.onPointerUp}
			onPointerLeave={tapHandlers.onPointerLeave}
			onDoubleClick={handleDoubleClick}
		>
			<TransformWrapper
				ref={transformRef}
				initialScale={1}
				minScale={1}
				maxScale={4}
				doubleClick={{ disabled: true }}
				wheel={{ step: 0.2 }}
				pinch={{ step: 5 }}
				panning={{ velocityDisabled: true }}
				centerOnInit
			>
				<TransformComponent
					wrapperClass="h-full! w-full!"
					contentClass="flex! h-full! w-full! items-center! justify-center!"
				>
					<div className="relative flex h-full w-full items-center justify-center">
						<img
							src={pageSrc(page)}
							alt={page.filename}
							// At minScale=1 the image must fully fit inside the
							// viewport (no tiling, no spread). `object-contain`
							// inside a `h-full w-full` parent does that
							// uniformly for both portrait and landscape pages;
							// the user can still pinch / wheel-zoom past 1×.
							className="h-full w-full select-none object-contain"
							draggable={false}
						/>
						<MangaPageCommentOverlay
							comments={perPageComments.get(page.filename) ?? []}
							enabled={showComments}
						/>
					</div>
				</TransformComponent>
			</TransformWrapper>
		</div>
	)
}
