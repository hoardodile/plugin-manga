#!/usr/bin/env node
/**
 * Run every real-world sample in `testdata-real/` through the built
 * plugin sandbox (`hoardodile plugin run`), and print a feature report.
 * Each sample is a directory containing a single archive / page folder,
 * matching the resource shape the plugin is invoked with.
 *
 * Requires `dist/main.js` (run `pnpm build` first). Exits non-zero when
 * any sample fails a hook.
 *
 * Usage: node scripts/verify-real-samples.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const DIST_DIR = join(ROOT, "dist")
const REAL_DIR = join(ROOT, "testdata-real")
const MANIFEST_PATH = join(REAL_DIR, "samples.json")

if (!existsSync(join(DIST_DIR, "main.js"))) {
	console.error("[verify] dist/main.js missing — run `pnpm build` first")
	process.exit(1)
}

/**
 * Resolve the hoardodile CLI entry by reading its package.json directly
 * (the package does not export `./package.json`). pnpm links the
 * workspace package into the plugin's node_modules, so the path exists
 * even though @hoardodile/cli is a devDependency of the plugin toolchain.
 */
function cliEntry() {
	const pkgPath = join(
		ROOT,
		"node_modules",
		"@hoardodile",
		"cli",
		"package.json",
	)
	const pkg = JSON.parse(readFileSync(pkgPath, "utf8"))
	const bin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.hoardodile
	return join(dirname(pkgPath), bin ?? "bin/hoardodile.mjs")
}

function runHook(hook, dir) {
	const out = execFileSync(
		process.execPath,
		[cliEntry(), "plugin", "run", hook, dir, "--plugin-dir", DIST_DIR],
		{ encoding: "utf8" },
	)
	return JSON.parse(out)
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"))
let failed = 0
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
	const row = { name: sample.name, features: sample.features.join(",") }
	try {
		const detect = runHook("detect", dir)
		row.detect =
			detect.result?.ok === true
				? "ok"
				: (detect.result?.reasons?.join(",") ?? "fail")
		const meta = runHook("sourceMeta", dir)
		if (meta.result !== undefined && meta.result !== null) {
			row.chapters = meta.result.chapterCount ?? "?"
			row.pages = meta.result.pageCount ?? "?"
		} else {
			row.pages = "0"
		}
		const files = runHook("listFiles", dir)
		row.pages = Array.isArray(files.result) ? files.result.length : "?"
		row.first =
			Array.isArray(files.result) && files.result.length > 0
				? files.result[0].filename
				: "-"
		row.chapters = Array.isArray(files.result)
			? Math.max(0, ...files.result.map((f) => f.chapterIndex + 1))
			: 0
	} catch (err) {
		row.error = err instanceof Error ? err.message : String(err)
	}
	const ok = row.detect === "ok" && row.error === undefined
	if (!ok) failed++
	console.log(`${ok ? "✓" : "✕"} ${row.name}  [${row.features}]`)
	console.log(
		`    detect=${row.detect ?? "?"}  pages=${row.pages}  chapters=${row.chapters}  first=${row.first ?? "-"}`,
	)
	if (row.error !== undefined) console.log(`    error: ${row.error}`)
}
console.log("─────────────────────────────────────────────────────")
console.log(
	`${manifest.samples.length - failed}/${manifest.samples.length} samples passed`,
)
process.exit(failed === 0 ? 0 : 1)
