#!/usr/bin/env node
/**
 * Regenerate the `testdata/` fixture volumes the manga plugin is
 * developed against (`pnpm dev`, `pnpm detect:smoke`, `hoardodile plugin
 * bench`). The generated pages are committed, so this only needs running
 * when the fixture itself should change.
 *
 * The pages are synthetic: a tinted background plus one marker bar per
 * page number, so the current page is readable at a glance in the
 * workbench. Filenames deliberately mix widths (`1`, `2`, `10`) to keep
 * the natural-sort path honest.
 *
 * Layout: every fixture volume stays a flat directory (a resource holds
 * either a page folder or a single archive, never both), grouped under
 * the single `testdata/` root: `pages/`, `book/`, `cbz/`, `cbz-stored/`,
 * `cbz-nasty/`.
 *
 * Usage: node scripts/make-testdata.mjs
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { crc32, deflateRawSync, deflateSync } from "node:zlib"

const OUT_ROOT = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"..",
	"testdata",
)
const PAGES_OUT_DIR = join(OUT_ROOT, "pages")

const PAGE_WIDTH = 240
const PAGE_HEIGHT = 340
const PAGE_COUNT = 10

function pngChunk(type, data) {
	const body = Buffer.concat([Buffer.from(type, "latin1"), data])
	const out = Buffer.alloc(body.length + 8)
	out.writeUInt32BE(data.length, 0)
	body.copy(out, 4)
	out.writeUInt32BE(crc32(body), body.length + 4)
	return out
}

/**
 * Minimal 8-bit truecolour PNG. `shade(x, y)` returns `[r, g, b]`; each
 * scanline uses filter type 0 (none), which keeps the encoder to a
 * single deflate call.
 */
function encodePng(width, height, shade) {
	const stride = width * 3 + 1
	const raw = Buffer.alloc(stride * height)
	for (let y = 0; y < height; y++) {
		const rowStart = y * stride
		for (let x = 0; x < width; x++) {
			const [r, g, b] = shade(x, y)
			raw[rowStart + 1 + x * 3] = r
			raw[rowStart + 2 + x * 3] = g
			raw[rowStart + 3 + x * 3] = b
		}
	}
	const ihdr = Buffer.alloc(13)
	ihdr.writeUInt32BE(width, 0)
	ihdr.writeUInt32BE(height, 4)
	ihdr[8] = 8 // bit depth
	ihdr[9] = 2 // colour type: truecolour
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		pngChunk("IHDR", ihdr),
		pngChunk("IDAT", deflateSync(raw, { level: 9 })),
		pngChunk("IEND", Buffer.alloc(0)),
	])
}

const BAR_TOP = 40
const BAR_HEIGHT = 28
const BAR_WIDTH = 16
const BAR_GAP = 6
const BAR_LEFT = 24

/** Page background plus `page` marker bars along the top edge. */
function pageShader(page) {
	const tint = 200 - page * 12
	return (x, y) => {
		const inBarRow = y >= BAR_TOP && y < BAR_TOP + BAR_HEIGHT
		if (inBarRow && x >= BAR_LEFT) {
			const slot = Math.floor((x - BAR_LEFT) / (BAR_WIDTH + BAR_GAP))
			const offset = (x - BAR_LEFT) % (BAR_WIDTH + BAR_GAP)
			if (slot < page && offset < BAR_WIDTH) return [20, 20, 20]
		}
		return [tint, tint, 235]
	}
}

/**
 * Minimal zip writer. Defaults to DEFLATE compression (real-world CBZs
 * compress their pages) with STORED available for boundary tests — the
 * host must handle both, and the committed fixture should exercise the
 * mainstream path.
 */
function zipBuffer(entries, opts = {}) {
	const method = opts.method ?? 8
	const localParts = []
	const records = []
	let offset = 0
	for (const entry of entries) {
		const name = Buffer.from(entry.name, "utf8")
		const raw =
			method === 8 ? deflateRawSync(entry.data, { level: 6 }) : entry.data
		const crc = crc32(entry.data)
		const local = Buffer.alloc(30)
		local.writeUInt32LE(0x04034b50, 0)
		local.writeUInt16LE(20, 4)
		local.writeUInt16LE(0x0800, 6) // UTF-8 name flag
		local.writeUInt16LE(method, 8)
		local.writeUInt32LE(crc, 14)
		local.writeUInt32LE(raw.length, 18)
		local.writeUInt32LE(entry.data.length, 22)
		local.writeUInt16LE(name.length, 26)
		local.writeUInt16LE(0, 28)
		localParts.push(local, name, raw)
		const cd = Buffer.alloc(46)
		cd.writeUInt32LE(0x02014b50, 0)
		cd.writeUInt16LE(20, 4)
		cd.writeUInt16LE(20, 6)
		cd.writeUInt16LE(0x0800, 8)
		cd.writeUInt16LE(method, 10)
		cd.writeUInt32LE(crc, 16)
		cd.writeUInt32LE(raw.length, 20)
		cd.writeUInt32LE(entry.data.length, 24)
		cd.writeUInt16LE(name.length, 28)
		cd.writeUInt32LE(offset, 42)
		records.push(Buffer.concat([cd, name]))
		offset += local.length + name.length + raw.length
	}
	const cdStart = localParts.reduce((sum, p) => sum + p.length, 0)
	const cdBytes = Buffer.concat(records)
	const eocd = Buffer.alloc(22)
	eocd.writeUInt32LE(0x06054b50, 0)
	eocd.writeUInt16LE(entries.length, 8)
	eocd.writeUInt16LE(entries.length, 10)
	eocd.writeUInt32LE(cdBytes.length, 12)
	eocd.writeUInt32LE(cdStart, 16)
	return Buffer.concat([...localParts, cdBytes, eocd])
}

/** Wipe a fixture volume so regeneration starts from a clean slate. */
function resetDir(path) {
	rmSync(path, { recursive: true, force: true })
	mkdirSync(path, { recursive: true })
}

resetDir(PAGES_OUT_DIR)

for (let page = 1; page <= PAGE_COUNT; page++) {
	writeFileSync(
		join(PAGES_OUT_DIR, `${page}.png`),
		encodePng(PAGE_WIDTH, PAGE_HEIGHT, pageShader(page)),
	)
}

// A two-chapter CBZ fixture in its own directory (a resource holds
// either a page folder or a single archive, never both; a nested
// directory would also surface in the page fixture's file list):
// chapters as directories inside the archive, five pages each, page
// numbers restarting per chapter. Named with CJK chapter titles and
// carrying the side-car junk real CBZs ship with (metadata XML, OS
// thumbnails) — `listFiles` must skip those and keep only image pages.
const cbzPages = []
for (const [chapter, chapterPages] of [
	["第1话", [1, 2, 3, 4, 5]],
	["第2话", [1, 2, 3, 4, 5]],
]) {
	for (const page of chapterPages) {
		cbzPages.push({
			name: `${chapter}/${String(page).padStart(3, "0")}.png`,
			data: encodePng(PAGE_WIDTH, PAGE_HEIGHT, pageShader(page)),
		})
	}
}
cbzPages.push(
	{ name: "ComicInfo.xml", data: Buffer.from("<ComicInfo/>") },
	{ name: "Thumbs.db", data: Buffer.from([0, 1, 2, 3, 250, 255]) },
)
const CBZ_OUT_DIR = join(OUT_ROOT, "cbz")
resetDir(CBZ_OUT_DIR)
writeFileSync(join(CBZ_OUT_DIR, "chapter-book.cbz"), zipBuffer(cbzPages))

// A STORED variant of the same book in its own directory (a resource
// holds a single archive), so the fixture suite covers the uncompressed
// boundary of the container codec too.
const CBZ_STORED_OUT_DIR = join(OUT_ROOT, "cbz-stored")
resetDir(CBZ_STORED_OUT_DIR)
writeFileSync(
	join(CBZ_STORED_OUT_DIR, "chapter-book.cbz"),
	zipBuffer(cbzPages, { method: 0 }),
)

// A "nasty paths" CBZ: deep nesting, a very long directory name and
// special characters (`#`, spaces, parens) in page names — real-world
// scans ship these and the reader must survive them.
const NASTY_OUT_DIR = join(OUT_ROOT, "cbz-nasty")
resetDir(NASTY_OUT_DIR)
const LONG_DIR = `vol ${"x".repeat(80)} (scan)`
const nastyPages = []
for (const page of [1, 2, 3]) {
	nastyPages.push({
		name: `${LONG_DIR}/#${page} ${"y".repeat(100)} (edited).png`,
		data: encodePng(PAGE_WIDTH, PAGE_HEIGHT, pageShader(page)),
	})
}
writeFileSync(join(NASTY_OUT_DIR, "nasty-paths.cbz"), zipBuffer(nastyPages))

// The same book as a *folder* with chapter subdirectories — the shape a
// folder import produces (one directory item packed recursively into one
// resource). Pages are split 3/2 between the chapters.
const BOOK_OUT_DIR = join(OUT_ROOT, "book")
resetDir(BOOK_OUT_DIR)
for (const [chapter, chapterPages] of [
	["第1话", [1, 2, 3]],
	["第2话", [4, 5]],
]) {
	const dir = join(BOOK_OUT_DIR, chapter)
	mkdirSync(dir, { recursive: true })
	for (const page of chapterPages) {
		writeFileSync(
			join(dir, `${String(page).padStart(3, "0")}.png`),
			encodePng(PAGE_WIDTH, PAGE_HEIGHT, pageShader(page)),
		)
	}
}

// The fixture directory is resource content, nothing else: a stray
// README would break `detect`, which requires every file to be a page
// image. The fixture is documented in the plugin README instead.
console.log(
	`[testdata] wrote ${PAGE_COUNT} pages to ${PAGES_OUT_DIR}, chapter-book.cbz (2 chapters x 5 pages) to ${CBZ_OUT_DIR}, stored variant + folder book`,
)
