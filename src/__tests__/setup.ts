import "@testing-library/jest-dom/vitest"
import { vi } from "vitest"

class ResizeObserverStub {
	observe(): void {}
	unobserve(): void {}
	disconnect(): void {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub)

// The Sheet component's mobile-back-to-close hook probes matchMedia on
// mount; jsdom does not implement it.
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
	window.matchMedia = (query: string) =>
		({
			matches: false,
			media: query,
			onchange: null,
			addListener: () => {},
			removeListener: () => {},
			addEventListener: () => {},
			removeEventListener: () => {},
			dispatchEvent: () => false,
		}) as MediaQueryList
}

// Base UI's dialog backdrop animation asks the viewport for running
// animations; jsdom has no animation API.
if (
	typeof Element !== "undefined" &&
	Element.prototype.getAnimations === undefined
) {
	Element.prototype.getAnimations = () => []
}
