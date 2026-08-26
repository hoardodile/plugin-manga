import type { FileType } from "@hoardodile/sdk-server"

/**
 * Source-shape classification: a manga resource is either a folder of
 * image pages (subdirectories become chapters) or a single container
 * entry (zip/rar/7z/tar, e.g. CBZ/CBR/CB7/CBT) whose inner entries are
 * the pages. Everything downstream (detect, sourceMeta, listFiles,
 * cover, hashes) branches once on this shape.
 */

/** MIME types that identify an archive the plugin can unpack. */
export const ARCHIVE_MIMES = new Set([
	"application/zip",
	"application/vnd.comicbook+zip",
	"application/epub+zip",
	"application/x-tar",
	"application/vnd.comicbook-rar",
	"application/vnd.rar",
	"application/x-rar-compressed",
	"application/x-7z-compressed",
])

/** Extensions that identify an unpackable archive even without magic. */
export const ARCHIVE_EXTS = new Set([
	".cbz",
	".zip",
	".epub",
	".cbt",
	".tar",
	".cbr",
	".rar",
	".7z",
	".cb7",
])

export type MangaSourceShape =
	| { readonly kind: "pages" }
	| { readonly kind: "archive"; readonly filename: string }

/** True when the sniffed type is a container the plugin can unpack. */
export function isArchiveType(type: FileType | undefined): boolean {
	if (type === undefined) return false
	if (ARCHIVE_MIMES.has(type.mime)) return true
	return ARCHIVE_EXTS.has(type.ext)
}

/**
 * Classify a resource's file list. A single unpackable archive wins
 * outright (one entry, container semantics); otherwise the resource is a
 * page folder when it holds at least two images and nothing else.
 */
export function classifySource(
	files: readonly string[],
	typeOf: (
		filename: string,
	) => FileType | undefined | Promise<FileType | undefined>,
): Promise<MangaSourceShape | undefined> {
	return classifySourceImpl(files, typeOf)
}

async function classifySourceImpl(
	files: readonly string[],
	typeOf: (
		filename: string,
	) => FileType | undefined | Promise<FileType | undefined>,
): Promise<MangaSourceShape | undefined> {
	if (files.length === 1) {
		const only = files[0]!
		if (isArchiveType(await typeOf(only))) {
			return { kind: "archive", filename: only }
		}
		return undefined
	}
	if (files.length < 2) return undefined
	const types = await Promise.all(files.map((f) => typeOf(f)))
	if (types.every((t) => t?.kind === "image")) return { kind: "pages" }
	return undefined
}
