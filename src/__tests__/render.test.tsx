import { createWebPluginAPI, PluginAPIProvider } from "@hoardodile/sdk-react"
import { act, render, waitFor } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { MangaReader } from "../render/MangaReader"
import type { MangaPage } from "../shared"

function page(filename: string, overrides: Partial<MangaPage> = {}): MangaPage {
	return {
		filename,
		type: "image",
		preview: true,
		chapterIndex: 0,
		chapterTitle: undefined,
		source: "file",
		...overrides,
	}
}

function wrapWithAPI(
	api: ReturnType<typeof createWebPluginAPI>,
	children: React.ReactNode,
) {
	return <PluginAPIProvider value={api}>{children}</PluginAPIProvider>
}

describe("manga render", () => {
	it("module can be imported", async () => {
		const mod = await import("../render.tsx")
		expect(mod).toBeDefined()
	})

	it("shows skeleton when files list is loading", async () => {
		const api = createWebPluginAPI({
			resource: {
				id: "r-test",
				name: "test",
				sourceMeta: {
					previews: [page("01.jpg"), page("02.jpg"), page("03.jpg")],
				},
				searchMeta: undefined,
				fileStats: { count: 200 },
				contentPluginId: "p-test",
			},
			useFileList: () => ({
				data: undefined,
				isLoading: true,
				isError: false,
				error: null,
			}),
		})
		const { queryByTestId } = render(wrapWithAPI(api, <MangaReader />))
		// Top bar is visible during skeleton; the page content area is skeleton
		await waitFor(() => {
			expect(queryByTestId("manga-mode-toggle")).not.toBeNull()
			expect(queryByTestId("manga-page-indicator")).not.toBeNull()
		})
	})

	it("renders the chrome when files list has resolved", async () => {
		const api = createWebPluginAPI({
			resource: {
				...createWebPluginAPI().resource,
				fileStats: { count: 3 },
			},
			useFileList: () => ({
				data: [page("01.jpg"), page("02.jpg"), page("03.jpg")],
				isLoading: false,
				isError: false,
				error: null,
			}),
		})
		const { queryByTestId } = render(wrapWithAPI(api, <MangaReader />))
		await waitFor(() =>
			expect(queryByTestId("manga-mode-toggle")).not.toBeNull(),
		)
	})

	it("shows the full page count from fileStats before files list resolves", async () => {
		const api = createWebPluginAPI({
			resource: {
				id: "r-test",
				name: "test",
				sourceMeta: {
					previews: [page("01.jpg"), page("02.jpg"), page("03.jpg")],
				},
				searchMeta: undefined,
				fileStats: { count: 200 },
				contentPluginId: "p-test",
			},
			useFileList: () => ({
				data: undefined,
				isLoading: true,
				isError: false,
				error: null,
			}),
		})
		const { getByTestId } = render(wrapWithAPI(api, <MangaReader />))
		await waitFor(() =>
			expect(getByTestId("manga-page-indicator")).toHaveTextContent("/ 200"),
		)
	})

	it("shows the chapter button and opens the chapter drawer", async () => {
		const chapters = [
			"Chapter 1/001.jpg",
			"Chapter 1/002.jpg",
			"Chapter 2/001.jpg",
		]
		const api = createWebPluginAPI({
			resource: {
				id: "r-test",
				name: "test",
				sourceMeta: undefined,
				searchMeta: undefined,
				fileStats: { count: 3 },
				contentPluginId: "p-test",
			},
			useFileList: () => ({
				data: chapters.map((filename) =>
					page(filename, { chapterTitle: filename.split("/")[0] }),
				),
				isLoading: false,
				isError: false,
				error: null,
			}),
		})
		const { getByTestId, findByTestId } = render(
			wrapWithAPI(api, <MangaReader />),
		)
		const button = await findByTestId("manga-chapter-button")
		button.click()
		const list = await findByTestId("manga-chapter-list")
		expect(list).not.toBeNull()
		expect(list.textContent).toContain("Chapter 1")
		expect(list.textContent).toContain("Chapter 2")
		// Top bar still shows its chrome.
		expect(getByTestId("manga-mode-toggle")).not.toBeNull()
	})

	it("exposes the reading-mode toggle", async () => {
		const api = createWebPluginAPI({
			resource: {
				...createWebPluginAPI().resource,
				fileStats: { count: 3 },
			},
			useFileList: () => ({
				data: [page("01.jpg"), page("02.jpg"), page("03.jpg")],
				isLoading: false,
				isError: false,
				error: null,
			}),
		})
		const { findByTestId } = render(wrapWithAPI(api, <MangaReader />))
		const button = await findByTestId("manga-mode-toggle")
		expect(button).toHaveAttribute("aria-pressed", "false")
	})

	it("opens the settings popover", async () => {
		const api = createWebPluginAPI({
			resource: {
				...createWebPluginAPI().resource,
				fileStats: { count: 3 },
			},
			useFileList: () => ({
				data: [page("01.jpg"), page("02.jpg"), page("03.jpg")],
				isLoading: false,
				isError: false,
				error: null,
			}),
		})
		const { findByTestId } = render(wrapWithAPI(api, <MangaReader />))
		const trigger = await findByTestId("manga-settings-toggle")
		act(() => trigger.click())
		const panel = await findByTestId("manga-settings-panel")
		expect(panel).not.toBeNull()
	})
})
