#!/usr/bin/env node
/**
 * Fetch (or verify) the real-world samples in `testdata-real/` — small
 * public-domain comics and EPUBs downloaded from the Internet Archive,
 * exercised against the built plugin during development. Nothing here is
 * committed (the directory is git-ignored); the sample manifest below is
 * the single source of truth for what a "real" run covers.
 *
 * Idempotent: an existing sample whose file size matches the manifest is
 * left untouched; missing or mismatched samples are (re)downloaded.
 * Every run rewrites `samples.json` with name, source URL, byte size,
 * feature tags and the fetch date.
 *
 * Usage: node scripts/fetch-real-samples.mjs [--verify-only]
 */
import {
	existsSync,
	mkdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const OUT_DIR = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"..",
	"testdata-real",
)

/**
 * The sample manifest. `dir` is the subdirectory under `testdata-real/`
 * (a resource holds exactly one archive / folder, so each sample gets its
 * own); `file` the on-disk name; `size` the expected byte size for
 * idempotence checks; `features` tags surfaced in the verification
 * report.
 */
const SAMPLES = [
	{
		name: "jp2-comic",
		dir: "cbz",
		file: "real-comic.cbz",
		url: "https://archive.org/download/antirix_kai_simfonix_gr_cbz/%CE%91%CE%BD%CF%84%CE%B9%CF%81%CE%AF%CE%BE%20%CE%BA%CE%B1%CE%B9%20%CE%A3%CF%85%CE%BC%CF%86%CE%BF%CE%BD%CE%AF%CE%BE%20%CE%91%2025_jp2.zip",
		size: 11043620,
		features: ["jp2-pages", "cjk-free-utf8-names", "50-pages"],
	},
	{
		name: "gutenberg-epub",
		dir: "epub",
		file: "real-book.epub",
		url: "https://archive.org/download/wantedahusbandan44326gut/pg44326-images.epub",
		size: 719243,
		features: ["epub", "text-first-image-poor"],
	},
]

const MANIFEST_PATH = join(OUT_DIR, "samples.json")

function existingManifest() {
	try {
		return JSON.parse(readFileSync(MANIFEST_PATH, "utf8"))
	} catch {
		return { v: 1, samples: [] }
	}
}

async function download(url, destPath, expectedSize) {
	const res = await fetch(url)
	if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
	const bytes = new Uint8Array(await res.arrayBuffer())
	if (bytes.byteLength !== expectedSize) {
		throw new Error(
			`size mismatch for ${destPath}: expected ${expectedSize}, got ${bytes.byteLength}`,
		)
	}
	writeFileSync(destPath, bytes)
}

async function main() {
	const verifyOnly = process.argv.includes("--verify-only")
	mkdirSync(OUT_DIR, { recursive: true })
	const manifest = existingManifest()
	const seen = new Set(manifest.samples.map((s) => s.name))

	for (const sample of SAMPLES) {
		const dir = join(OUT_DIR, sample.dir)
		const dest = join(dir, sample.file)
		const existing =
			existsSync(dest) && statSync(dest).isFile()
				? statSync(dest).size
				: undefined
		if (existing === sample.size) {
			console.log(`[samples] ok (cached): ${sample.name}`)
		} else if (verifyOnly) {
			console.error(
				`[samples] MISSING or stale: ${sample.name} (expected ${sample.size}, found ${existing ?? "none"}) — run without --verify-only`,
			)
			process.exitCode = 1
			continue
		} else {
			console.log(`[samples] downloading: ${sample.name} …`)
			mkdirSync(dir, { recursive: true })
			try {
				await download(sample.url, dest, sample.size)
			} catch (err) {
				console.error(`[samples] failed: ${sample.name}: ${err.message}`)
				process.exitCode = 1
				continue
			}
		}
		seen.add(sample.name)
		manifest.samples = manifest.samples.filter((s) => s.name !== sample.name)
		manifest.samples.push({
			...sample,
			path: `${sample.dir}/${sample.file}`,
			fetchedAt: new Date().toISOString(),
		})
	}

	manifest.samples.sort((a, b) => a.name.localeCompare(b.name))
	writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`)
	console.log(
		`[samples] manifest: ${manifest.samples.length} sample(s) -> ${MANIFEST_PATH}`,
	)
}

void main()
