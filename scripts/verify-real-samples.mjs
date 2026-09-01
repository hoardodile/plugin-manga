#!/usr/bin/env node
/**
 * Run every real-world sample in `testdata-real/` through the built
 * plugin and print a feature report, driving the hooks directly through
 * `@hoardodile/host` `createPluginResourceAPI` rather than
 * `hoardodile plugin run`.
 *
 * Why not the CLI: `plugin run` loads the plugin into the sandbox
 * without its manifest, so the sandbox denies the `container` permission
 * and every archive hook is rejected ("container permission denied") —
 * an upstream `@hoardodile/cli` limitation that would make this whole
 * report blank for comic samples. The host API used here is the same one
 * the plugin's own `formats.test.ts` exercises, so what runs is what the
 * plugin's unit tests already trust.
 *
 * Requires `dist/main.js` (run `pnpm build` first). Exits non-zero when
 * any sample fails a hook.
 *
 * Usage: node scripts/verify-real-samples.mjs
 */
import { existsSync, mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import {
	createDirectoryContainer,
	createPluginResourceAPI,
} from "@hoardodile/host"
import { mediaProbes } from "@hoardodile/host/probe"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const DIST_MAIN = join(ROOT, "dist", "main.js")
const REAL_DIR = join(ROOT, "testdata-real")
const MANIFEST_PATH = join(REAL_DIR, "samples.json")

if (!existsSync(DIST_MAIN)) {
	console.error("[verify] dist/main.js missing — run `pnpm build` first")
	process.exit(1)
}

const plugin = (await import(pathToFileURL(DIST_MAIN).href)).default

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"))
let failed = 0

function fmt(value) {
	return value === undefined ? "-" : String(value)
}

console.log("── real sample verification ─────────────────────────")
for (const sample of manifest.samples) {
	const dir = join(REAL_DIR, sample.dir)
	if (!existsSync(join(dir, sample.file))) {
		console.log(
			`✕ ${sample.name} — sample file missing (run fetch-real-samples.mjs)`,
		)
		failed++
		continue
	}
	const extractCacheDir = mkdtempSync(join(tmpdir(), "manga-real-"))
	const api = createPluginResourceAPI({
		view: createDirectoryContainer(dir),
		...mediaProbes,
		extractCacheDir,
		cacheScope: `real:${sample.name}`,
	})
	const row = { name: sample.name, features: sample.features.join(",") }
	try {
		const detect = await plugin.detect(api)
		row.detect =
			detect.ok === true ? "ok" : (detect.reasons?.join(",") ?? "fail")
		const meta = await plugin.sourceMeta?.(api)
		row.previews = meta?.previews?.length ?? 0
		row.width = meta?.width
		row.height = meta?.height
		row.chapters = meta?.chapterCount ?? "?"
		row.pages = meta?.pageCount ?? "?"
		row.cover = fmt(await plugin.coverLocal?.(api))
		const files = (await plugin.listFiles?.(api)) ?? []
		row.first = files[0]?.filename ?? "-"
		row.firstSource = files[0]?.source ?? "-"
		row.firstPreview = files[0]?.preview ?? false
		row.firstW = files[0]?.width
		row.firstH = files[0]?.height
		row.fileCount = files.length
	} catch (err) {
		row.error = err instanceof Error ? err.message : String(err)
	}
	const ok = row.detect === "ok" && row.error === undefined
	if (!ok) failed++
	console.log(`${ok ? "✓" : "✕"} ${row.name}  [${row.features}]`)
	console.log(
		`    detect=${row.detect ?? "?"}  pages=${row.pages}  chapters=${row.chapters}  previews=${row.previews}  w=${fmt(row.width)} h=${fmt(row.height)}`,
	)
	console.log(
		`    cover=${row.cover ?? "-"}  first=${row.first}  [${row.firstSource} preview=${row.firstPreview} w=${fmt(row.firstW)} h=${fmt(row.firstH)}]  fileCount=${row.fileCount}`,
	)
	if (row.error !== undefined) console.log(`    error: ${row.error}`)
}
console.log("─────────────────────────────────────────────────────")
console.log(
	`${manifest.samples.length - failed}/${manifest.samples.length} samples passed`,
)
process.exit(failed === 0 ? 0 : 1)
