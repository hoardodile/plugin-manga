# Manga

A manga reader for hoardodile: chapter books with scroll and paged modes,
per-page messages, and reading-position restore — in the app's own viewer.

## Features

- Chapter directories: page folders (subdirectories become chapters) and
  single-file comic archives — CBZ/zip, CBR/rar, CB7/7z, CBT/tar, EPUB —
  whose pages are materialized on first preview through the host's
  `extractArchive` (non-zip formats need the bundled 7-Zip binary).
- Scroll and paged views with zoom; first-frame previews; per-chapter
  progress and position restore.
- Per-page messages anchored to the current page.
- Resources are filterable by content (image / animation) in the library
  search filters; pages are hashed for duplicate detection.

## Requirements

- hoardodile ≥ 0.1.9 (see the repository README for details).
- Trust the repository before installing — plugin code runs server-side in a
  restricted sandbox.
