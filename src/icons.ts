import { createIcon } from "@hoardodile/ui/icons/icon-style"
import { PlaneIcon as PlaneBoldWeight } from "@solar-icons/react/bold/plane"
import { PlaneIcon as PlaneBoldDuotoneWeight } from "@solar-icons/react/bold-duotone/plane"
import { PlaneIcon as PlaneLinearWeight } from "@solar-icons/react/linear/plane"

/**
 * Plugin-owned Solar glyphs, registered through the design system's
 * external registration (`createIcon` from `@hoardodile/ui/icons/icon-style`)
 * so they follow the host's icon style (duotone / grayscale / linear)
 * exactly like `@hoardodile/ui/icons/registry` exports. Glyphs the
 * central registry already provides are imported from there instead —
 * this module only hosts the ones it does not (`Plane`).
 */
export const Plane = createIcon({
	bold: PlaneBoldWeight,
	boldDuotone: PlaneBoldDuotoneWeight,
	linear: PlaneLinearWeight,
})
