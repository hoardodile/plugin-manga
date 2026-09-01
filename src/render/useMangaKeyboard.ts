import { useEffect } from "react"

type KeyboardAction =
	| "prev"
	| "next"
	| "first"
	| "last"
	| "zoomIn"
	| "zoomOut"
	| "fit"

type Handlers = Partial<Record<KeyboardAction, () => void>>

/**
 * Binds the reader's keyboard shortcuts for the active view. Only the
 * mounted view (paged or scroll) runs this, so exactly one handler is
 * live at a time. Keys are never swallowed while the user is typing in
 * an input or navigating an open dialog/menu/popover.
 */
export function useMangaKeyboard(opts: {
	readonly handlers: Handlers
	readonly enabled: boolean
}) {
	const { handlers, enabled } = opts
	useEffect(() => {
		if (!enabled) return
		function onKey(e: KeyboardEvent) {
			const target = e.target
			const editable =
				target instanceof HTMLElement &&
				(target.isContentEditable ||
					/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
			const inOverlay =
				target instanceof Element &&
				target.closest(
					'[role="dialog"], [role="menu"], [role="listbox"], [role="tooltip"]',
				) !== null
			if (editable || inOverlay) return
			switch (e.key) {
				case "ArrowRight":
					handlers.next?.()
					break
				case "ArrowLeft":
					handlers.prev?.()
					break
				case "ArrowDown":
					handlers.next?.()
					e.preventDefault()
					break
				case "ArrowUp":
					handlers.prev?.()
					e.preventDefault()
					break
				case " ":
					handlers.next?.()
					e.preventDefault()
					break
				case "PageDown":
					handlers.next?.()
					e.preventDefault()
					break
				case "PageUp":
					handlers.prev?.()
					e.preventDefault()
					break
				case "Home":
					handlers.first?.()
					break
				case "End":
					handlers.last?.()
					break
				case "+":
				case "=":
					handlers.zoomIn?.()
					break
				case "-":
					handlers.zoomOut?.()
					break
				case "0":
				case "f":
				case "F":
					handlers.fit?.()
					break
			}
		}
		window.addEventListener("keydown", onKey)
		return () => window.removeEventListener("keydown", onKey)
	}, [handlers, enabled])
}
