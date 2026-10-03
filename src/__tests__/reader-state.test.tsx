import { useCacheWriter } from "@hoardodile/sdk-react"
import { act, renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { buildBook } from "../core/book.ts"
import { useMangaPosition } from "../render/useMangaReaderState"

vi.mock("@hoardodile/sdk-react", () => ({ useCacheWriter: vi.fn() }))
const visibility = vi.hoisted(() => ({
	visible: true,
	listeners: new Set<() => void>(),
	setCache: vi.fn(),
}))
vi.mock("@hoardodile/sdk-web", () => ({
	getVisibilitySnapshot: () => visibility.visible,
	subscribeToVisibility: (listener: () => void) => {
		visibility.listeners.add(listener)
		return () => visibility.listeners.delete(listener)
	},
}))
vi.mock("../render/hooks", () => {
	const api = { getCache: () => undefined, setCache: visibility.setCache }
	return { usePluginAPI: () => api }
})

describe("reading position after a page jump", () => {
	it("flushes the latest page when the host hides the iframe", () => {
		const book = buildBook(["c.png", "b.png", "a.png"])
		const { result, unmount } = renderHook(() => useMangaPosition(book))
		act(() => result.current.requestScrollTo(2))
		act(() => {
			visibility.visible = false
			for (const listener of visibility.listeners) listener()
		})
		expect(visibility.setCache).toHaveBeenCalledWith(
			"position",
			JSON.stringify({ v: 2, chapterIndex: 0, pageIndex: 2 }),
		)
		unmount()
	})
	it("persists the requested page before the scroll observer settles", () => {
		const book = buildBook(["c.png", "b.png", "a.png"])
		const { result } = renderHook(() => useMangaPosition(book))
		act(() => result.current.requestScrollTo(2))
		expect(result.current.currentPageIndex).toBe(2)
		expect(result.current.scrollToPage).toBe(2)
		const write = vi
			.mocked(useCacheWriter)
			.mock.calls.findLast(([options]) => options.key === "position")?.[0]
		expect(write?.value).toBe(2)
		expect(write?.encode(2)).toBe(
			JSON.stringify({ v: 2, chapterIndex: 0, pageIndex: 2 }),
		)
	})
})
