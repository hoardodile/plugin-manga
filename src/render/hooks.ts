import { definePluginAPI } from "@hoardodile/sdk-react"
import { decodeMangaPageAnchor, type MangaSchema } from "../shared"

export const { PluginAPIProvider, usePluginAPI, useAnchorJump } =
	definePluginAPI<MangaSchema>({ decodeAnchor: decodeMangaPageAnchor })
