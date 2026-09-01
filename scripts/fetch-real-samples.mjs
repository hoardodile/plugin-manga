#!/usr/bin/env node
/**
 * Fetch (or verify) the real-world samples in `testdata-real/` — small
 * public-domain comics and EPUBs downloaded from the Internet Archive,
 * exercised against the built plugin during development. Nothing here is
 * committed (the directory is git-ignored); the sample manifest below is
 * the single source of truth for what a "real" run covers.
 *
 * Sizes are resolved dynamically from the Internet Archive metadata API
 * (`/metadata/<item>`) so a sample whose source file changed size is
 * re-fetched instead of failing a stale-size check. An `archive` source
 * is downloaded with its file name URL-encoded; a plain `url` source is
 * fetched as-is. Idempotent: an existing sample whose byte size matches
 * the resolved size is left untouched. Every run rewrites `samples.json`
 * with name, source URL, byte size, feature tags and the fetch date.
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
 * own); `file` the on-disk name; `size` the expected byte size fallback
 * (overridden by the metadata-resolved value when the sample lives on the
 * Internet Archive); `features` tags surfaced in the verification report.
 */
const SAMPLES = [
	{
		name: "jp2-comic",
		dir: "cbz",
		file: "real-comic.cbz",
		// Public-domain comic on archive.org. Deliberately jp2-based:
		// archive.org serves comic scans as Single Page Processed JP2 ZIP,
		// which the browser cannot decode natively — the real-world case
		// behind "the archive card renders a cover but the pages are blank".
		archive: {
			item: "mouse-p.-i.-for-hire-comic-book",
			file: "MOUSE P.I. For Hire Comic Book_jp2.zip",
		},
		size: 1048065,
		features: ["jp2-pages", "real-public-domain", "archive"],
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

/** Resolve an archive.org sample's current size/md5/URL from its metadata. */
async function resolveArchiveSource(sample) {
	const { item, file } = sample.archive
	const meta = await fetch(`https://archive.org/metadata/${item}`).then((res) =>
		res.json(),
	)
	const rec = (meta.files ?? []).find((f) => f.name === file)
	if (rec === undefined) {
		throw new Error(
			`archive.org item "${item}" has no file "${file}" (sample ${sample.name})`,
		)
	}
	const size = Number(rec.size)
	if (!Number.isFinite(size) || size <= 0) {
		throw new Error(
			`item "${item}" file "${file}" has no usable size (sample ${sample.name})`,
		)
	}
	return {
		url: `https://archive.org/download/${item}/${encodeURIComponent(file)}`,
		size,
		md5: typeof rec.md5 === "string" ? rec.md5 : undefined,
	}
}

function download(sample) {
	if (sample.archive !== undefined) return resolveArchiveSource(sample)
	return {
		url: sample.url,
		size: sample.size,
		md5: undefined,
	}
}

async function fetchBytes(url) {
	const res = await fetch(url)
	if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
	return { bytes: new Uint8Array(await res.arrayBuffer()) }
}

async function main() {
	const verifyOnly = process.argv.includes("--verify-only")
	mkdirSync(OUT_DIR, { recursive: true })
	const manifest = existingManifest()
	const seen = new Set(manifest.samples.map((s) => s.name))

	for (const sample of SAMPLES) {
		const dir = join(OUT_DIR, sample.dir)
		const dest = join(dir, sample.file)
		let resolved
		try {
			resolved = await download(sample)
		} catch (err) {
			console.error(
				`[samples] could not resolve ${sample.name}: ${err.message}`,
			)
			process.exitCode = 1
			continue
		}
		const existing =
			existsSync(dest) && statSync(dest).isFile()
				? statSync(dest).size
				: undefined
		if (existing === resolved.size) {
			console.log(`[samples] ok (cached): ${sample.name}`)
		} else if (verifyOnly) {
			console.error(
				`[samples] MISSING or stale: ${sample.name} (expected ${resolved.size}, found ${existing ?? "none"}) — run without --verify-only`,
			)
			process.exitCode = 1
			continue
		} else {
			console.log(`[samples] downloading: ${sample.name} …`)
			mkdirSync(dir, { recursive: true })
			try {
				const { bytes } = await fetchBytes(resolved.url)
				if (bytes.byteLength !== resolved.size) {
					throw new Error(
						`size mismatch for ${dest}: expected ${resolved.size}, got ${bytes.byteLength}`,
					)
				}
				writeFileSync(dest, bytes)
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
			url: resolved.url,
			size: resolved.size,
			md5: resolved.md5,
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
