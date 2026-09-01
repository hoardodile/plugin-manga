import type { Message } from "@hoardodile/sdk-web"
import { Button } from "@hoardodile/ui/components/button"
import { Icon } from "@hoardodile/ui/components/icon"
import {
	MagnifierZoomIn,
	MagnifierZoomOut,
	Scale,
} from "@hoardodile/ui/icons/registry"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
	type ReactZoomPanPinchRef,
	TransformComponent,
	TransformWrapper,
} from "react-zoom-pan-pinch"
import { useTranslation } from "../i18n"
import type { MangaFitMode, MangaPageDirection } from "../prefs"
import type { MangaPage } from "../shared"
import { layoutScreen } from "./helpers"
import { MangaPageCommentOverlay } from "./PageCommentOverlay"
import { tapZoneFor, turnForZone } from "./paged-geometry"
import { buildScreens, screenOf } from "./spread-geometry"
import { useMangaKeyboard } from "./useMangaKeyboard"
import { useTapTracker } from "./useTapTracker"

/**
 * Single-page / spread view with fit and zoom.
 *
 * Navigation is driven by tapping the left / right wing (`direction`
 * decides which side advances) and by arrow keys; the centre strip is
 * reserved for double-click zoom so a user can dwell to double-click
 * without page-flipping by accident. With `spread` on, consecutive pages
 * pair into a two-page screen (a wide page is its own screen); otherwise
 * each page is its own screen.
 *
 * `react-zoom-pan-pinch` handles two-finger pinch and wheel zoom; the
 * content block is laid out by `layoutScreen` so fit (page/width) and the
 * spread pair both render at their natural box without distortion.
 */
export function MangaPagedView(props: {
	readonly pages: readonly MangaPage[]
	readonly currentPageIndex: number
	readonly onChangePage: (index: number) => void
	readonly perPageComments: ReadonlyMap<string, readonly Message[]>
	readonly showComments: boolean
	readonly direction: MangaPageDirection
	readonly spread: boolean
	readonly fitMode: MangaFitMode
	readonly pageSrc: (page: MangaPage) => string
}) {
	const {
		pages,
		currentPageIndex,
		onChangePage,
		perPageComments,
		showComments,
		direction,
		spread,
		fitMode,
		pageSrc,
	} = props
	const transformRef = useRef<ReactZoomPanPinchRef | null>(null)
	const containerRef = useRef<HTMLDivElement | null>(null)
	const [size, setSize] = useState({ width: 0, height: 0 })
	const [showFabs, setShowFabs] = useState(true)
	const { t } = useTranslation()

	// The current screen: the active page's (or, with spread, the pair
	// containing it) pages.
	const screens = useMemo(
		() => (spread ? buildScreens(pages).screens : undefined),
		[pages, spread],
	)
	const screenIndex = useMemo(
		() =>
			screens === undefined
				? Math.min(currentPageIndex, pages.length - 1)
				: screenOf(screens, currentPageIndex),
		[screens, currentPageIndex, pages.length],
	)
	const screen = useMemo(() => {
		if (screens !== undefined)
			return screens[screenIndex] ?? { first: 0, last: 0 }
		const clamped = Math.max(0, Math.min(pages.length - 1, currentPageIndex))
		return { first: clamped, last: clamped }
	}, [screens, screenIndex, currentPageIndex, pages.length])
	const screenPages = useMemo(
		() => pages.slice(screen.first, screen.last + 1),
		[pages, screen],
	)

	const layout = useMemo(
		() =>
			layoutScreen({
				pages: screenPages,
				fit: fitMode,
				direction,
				containerW: size.width,
				containerH: size.height,
			}),
		[screenPages, fitMode, direction, size.width, size.height],
	)

	useEffect(() => {
		const root = containerRef.current
		if (root === null) return
		const node = root
		function update() {
			setSize({ width: node.clientWidth, height: node.clientHeight })
		}
		update()
		const observer = new ResizeObserver(update)
		observer.observe(node)
		return () => observer.disconnect()
	}, [])

	// Reset zoom whenever the active screen changes so each screen starts
	// fit-to-view; without this the panned offset of the previous screen
	// would carry over.
	useEffect(() => {
		transformRef.current?.resetTransform(0)
	}, [screenIndex])

	// Eagerly fetch the neighbouring screens so flipping forward/backward
	// swaps the `<img>` src against an already-warm browser cache. We only
	// preload ±1 screen; anything farther is speculation.
	useEffect(() => {
		const targets: number[] = []
		const add = (index: number) => {
			if (index >= 0 && index < pages.length) targets.push(index)
		}
		if (screens !== undefined) {
			const prev = screens[screenIndex - 1]
			const next = screens[screenIndex + 1]
			for (const sc of [prev, next]) {
				if (sc === undefined) continue
				for (let p = sc.first; p <= sc.last; p += 1) add(p)
			}
		} else {
			add(currentPageIndex - 1)
			add(currentPageIndex + 1)
		}
		const imgs = targets.map((index) => {
			const p = pages[index]
			if (p === undefined) return undefined
			const img = new Image()
			img.decoding = "async"
			img.src = pageSrc(p)
			return img
		})
		return () => {
			for (const img of imgs) {
				if (img !== undefined) img.src = ""
			}
		}
	}, [pages, screenIndex, screens, currentPageIndex, pageSrc])

	const goPrev = useCallback(() => {
		if (screens !== undefined) {
			const prev = screens[screenIndex - 1]
			if (prev !== undefined) onChangePage(prev.first)
			return
		}
		if (currentPageIndex > 0) onChangePage(currentPageIndex - 1)
	}, [screens, screenIndex, currentPageIndex, onChangePage])

	const goNext = useCallback(() => {
		if (screens !== undefined) {
			const next = screens[screenIndex + 1]
			if (next !== undefined) onChangePage(next.first)
			return
		}
		if (currentPageIndex < pages.length - 1) onChangePage(currentPageIndex + 1)
	}, [screens, screenIndex, currentPageIndex, pages.length, onChangePage])

	const goFirst = useCallback(() => onChangePage(0), [onChangePage])
	const goLast = useCallback(
		() => onChangePage(Math.max(0, pages.length - 1)),
		[onChangePage, pages.length],
	)
	const zoomIn = useCallback(() => transformRef.current?.zoomIn(1), [])
	const zoomOut = useCallback(() => transformRef.current?.zoomOut(1), [])
	const fit = useCallback(() => transformRef.current?.resetTransform(0), [])

	const keyboardHandlers = useMemo(
		() => ({
			prev: goPrev,
			next: goNext,
			first: goFirst,
			last: goLast,
			zoomIn,
			zoomOut,
			fit,
		}),
		[goPrev, goNext, goFirst, goLast, zoomIn, zoomOut, fit],
	)
	useMangaKeyboard({ handlers: keyboardHandlers, enabled: pages.length > 0 })

	const tapHandlers = useTapTracker({
		onTap: (e) => {
			// A press that lands on the zoom controls is a control press,
			// not a page turn — ignore it so clicking + / − / Fit never
			// flips the page.
			const target = e.target as HTMLElement | null
			if (target?.closest(".manga-zoom-fab")) return
			const root = containerRef.current
			if (root === null) return
			const rect = root.getBoundingClientRect()
			const zone = tapZoneFor(rect.width, e.clientX - rect.left)
			const turn = turnForZone(direction, zone)
			if (turn === "prev") goPrev()
			else if (turn === "next") goNext()
		},
	})

	const handleDoubleClick = useCallback(
		(e: React.MouseEvent<HTMLDivElement>) => {
			const root = containerRef.current
			if (root === null) return
			const rect = root.getBoundingClientRect()
			if (tapZoneFor(rect.width, e.clientX - rect.left) !== "center") return
			const api = transformRef.current
			if (api === undefined || api === null) return
			const scale = api.state.scale
			if (scale > 1.01) api.resetTransform()
			else api.zoomIn(2)
		},
		[],
	)

	const page = pages[currentPageIndex]
	if (page === undefined) return null

	return (
		<div
			ref={containerRef}
			className="relative h-full w-full"
			data-testid="manga-paged-view"
			onPointerDown={tapHandlers.onPointerDown}
			onPointerMove={tapHandlers.onPointerMove}
			onPointerUp={tapHandlers.onPointerUp}
			onPointerLeave={() => {
				tapHandlers.onPointerLeave()
				setShowFabs(false)
			}}
			onDoubleClick={handleDoubleClick}
			onPointerEnter={() => setShowFabs(true)}
		>
			{layout.contentW > 0 && layout.contentH > 0 ? (
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
						contentClass="flex! items-center! justify-center!"
					>
						<div
							className="relative"
							style={{ width: layout.contentW, height: layout.contentH }}
						>
							{screenPages.map((p, i) => {
								const box = layout.boxes[i]
								if (box === undefined) return null
								return (
									<div
										key={p.filename}
										className="absolute"
										style={{
											left: box.x,
											top: box.y,
											width: box.width,
											height: box.height,
										}}
									>
										<img
											src={pageSrc(p)}
											alt={p.filename}
											className="h-full w-full select-none object-contain"
											draggable={false}
										/>
										<MangaPageCommentOverlay
											comments={perPageComments.get(p.filename) ?? []}
											enabled={showComments}
										/>
									</div>
								)
							})}
						</div>
					</TransformComponent>
				</TransformWrapper>
			) : null}

			<div
				className="manga-zoom-fab absolute bottom-4 right-4 z-10 flex items-center gap-1"
				data-visible={showFabs}
			>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					onClick={zoomIn}
					className="bg-accent text-accent-foreground hover:bg-muted"
					aria-label={t("zoomIn")}
					title={t("zoomIn")}
				>
					<Icon icon={MagnifierZoomIn} />
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					onClick={zoomOut}
					className="bg-accent text-accent-foreground hover:bg-muted"
					aria-label={t("zoomOut")}
					title={t("zoomOut")}
				>
					<Icon icon={MagnifierZoomOut} />
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					onClick={fit}
					className="bg-accent text-accent-foreground hover:bg-muted"
					aria-label={t("fit")}
					title={t("fit")}
				>
					<Icon icon={Scale} />
				</Button>
			</div>
		</div>
	)
}
