// @vitest-environment node

import { execFileSync } from "node:child_process"
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { Readable } from "node:stream"
import type { ResourceContainer } from "@hoardodile/host"
import { createPluginResourceAPI } from "@hoardodile/host"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import plugin from "../main.ts"
import type { MangaSchema } from "../shared"

/**
 * End-to-end non-zip container support through the real host runtime:
 * archives are built with the bundled 7-Zip binary, the plugin API runs
 * against an in-memory single-file container, and the full hook chain
 * (detect → sourceMeta → cover → listFiles) runs like the server would.
 * RAR needs no special-casing here — it flows through the same
 * whole-archive path, and the vendored rar5 sample is covered by the
 * host's archive tests (list/extract/validate).
 */

const requireCjs = createRequire(import.meta.url)

function sevenZipBin(): string | undefined {
	const fromEnv = process.env["7Z_BIN_PATH"]
	if (fromEnv !== undefined && fromEnv.length > 0) return fromEnv
	try {
		const mod: unknown = requireCjs("@hoardodile/7z-bin")
		return typeof mod === "string" && mod.length > 0 ? mod : undefined
	} catch {
		return undefined
	}
}

const bin = sevenZipBin()

function singleFileContainer(
	archiveBytes: Buffer,
	name: string,
): ResourceContainer {
	return {
		listEntries: async () => [name],
		readEntry: async (rel) => {
			if (rel !== name) throw new Error(`no entry ${rel}`)
			return archiveBytes
		},
		readEntrySlice: async (rel, start, end) => {
			if (rel !== name) throw new Error(`no entry ${rel}`)
			return archiveBytes.subarray(start, Math.min(end, archiveBytes.length))
		},
		openEntryStream: async (rel) => {
			if (rel !== name) throw new Error(`no entry ${rel}`)
			return {
				stream: Readable.from([archiveBytes]),
				size: archiveBytes.length,
			}
		},
		resolveByteRange: async (rel) =>
			rel === name ? { size: archiveBytes.length } : undefined,
	}
}

function makeArchive(
	format: "7z" | "tar" | "zip",
	files: readonly string[],
): Buffer {
	const root = mkdtempSync(join(tmpdir(), "manga-format-"))
	try {
		const payload = join(root, "payload")
		mkdirSync(payload, { recursive: true })
		for (const file of files) {
			const bytes = readFileSync(
				join(import.meta.dirname, "..", "..", "testdata", "pages", file),
			)
			const target = join(payload, file)
			mkdirSync(dirname(target), { recursive: true })
			writeFileSync(target, bytes)
		}
		const ext = format === "7z" ? "cb7" : format === "tar" ? "cbt" : "cbz"
		const archivePath = join(root, `book.${ext}`)
		execFileSync(bin!, ["a", `-t${format}`, archivePath, "."], {
			cwd: payload,
			stdio: "ignore",
		})
		return readFileSync(archivePath)
	} finally {
		rmSync(root, { recursive: true, force: true })
	}
}

describe.skipIf(bin === undefined)("manga non-zip archives end-to-end", () => {
	let cacheDir: string

	beforeEach(() => {
		cacheDir = mkdtempSync(join(tmpdir(), "manga-extract-"))
	})

	afterEach(() => {
		rmSync(cacheDir, { recursive: true, force: true })
	})

	function apiFor(archiveBytes: Buffer, filename: string) {
		return createPluginResourceAPI<MangaSchema>({
			view: singleFileContainer(archiveBytes, filename),
			probeImage: async () => ({ width: 320, height: 480, animated: false }),
			cacheScope: "test",
			extractCacheDir: cacheDir,
		})
	}

	async function runChain(filename: string, archiveBytes: Buffer) {
		const api = apiFor(archiveBytes, filename)
		expect(await plugin.detect?.(api)).toMatchObject({ ok: true })
		const meta = await plugin.sourceMeta?.(api)
		expect(meta).toMatchObject({ pageCount: 2, chapterCount: 1 })
		const cover = await plugin.coverLocal?.(api)
		expect(cover).toBe(`${filename}!1.png`)
		// The virtual path must read real bytes once extracted (the
		// cover call materialized the archive). `readFile` returns a
		// Uint8Array view; compare bytes, not Buffer prototypes.
		const pageBytes = Buffer.from(await api.readFile(cover!))
		expect(
			pageBytes.equals(
				readFileSync(
					join(import.meta.dirname, "..", "..", "testdata", "pages", "1.png"),
				),
			),
		).toBe(true)
		const pages = await plugin.listFiles?.(api)
		expect(pages?.map((p) => p.filename)).toEqual([
			`${filename}!1.png`,
			`${filename}!2.png`,
		])
		expect(pages?.[0]).toMatchObject({
			width: 320,
			height: 480,
			source: "file",
		})
		return api
	}

	/**
	 * Zip containers are virtually addressable: the bare cover/`listFiles`
	 * reads never materialize, pages carry no dimensions and are served
	 * through the host's `/files` stream (source "file").
	 */
	async function runZipChain(filename: string, archiveBytes: Buffer) {
		const api = apiFor(archiveBytes, filename)
		expect(await plugin.detect?.(api)).toMatchObject({ ok: true })
		const meta = await plugin.sourceMeta?.(api)
		expect(meta).toMatchObject({ pageCount: 2, chapterCount: 1 })
		const cover = await plugin.coverLocal?.(api)
		expect(cover).toBe(`${filename}!1.png`)
		// Zip entries read from the central directory — no extraction.
		const pageBytes = Buffer.from(await api.readFile(cover!))
		expect(
			pageBytes.equals(
				readFileSync(
					join(import.meta.dirname, "..", "..", "testdata", "pages", "1.png"),
				),
			),
		).toBe(true)
		const pages = await plugin.listFiles?.(api)
		expect(pages?.map((p) => p.filename)).toEqual([
			`${filename}!1.png`,
			`${filename}!2.png`,
		])
		expect(pages?.[0]).toMatchObject({
			source: "file",
			preview: false,
		})
		expect(pages?.[0]?.width).toBeUndefined()
		return api
	}

	it("streams a cbz (zip) container through the virtual file path", async () => {
		const archive = makeArchive("zip", ["1.png", "2.png"])
		await runZipChain("book.cbz", archive)
	})

	it("runs the hook chain for a cb7 (7z) container", async () => {
		const archive = makeArchive("7z", ["1.png", "2.png"])
		await runChain("book.cb7", archive)
	})

	it("runs the hook chain for a cbt (tar) container", async () => {
		const archive = makeArchive("tar", ["1.png", "2.png"])
		await runChain("book.cbt", archive)
	})
})
