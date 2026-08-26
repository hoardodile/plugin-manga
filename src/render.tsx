import "./index.css"

import { createPluginRoot } from "@hoardodile/sdk-react"
import { PluginAPIProvider } from "./render/hooks"
import { MangaReader } from "./render/MangaReader"

// No visibility gate: the host's preview window pre-paints parked
// neighbor slots offscreen so a flip is a style swap — rendering an
// empty tree while invisible would defeat that prerender. The reader
// has no media playback that would need pausing.
function MangaPreview() {
	return <MangaReader />
}

createPluginRoot({ provider: PluginAPIProvider, render: MangaPreview })
