# hoardodile plugin-manga

Manga reader content plugin: `detect` → `sourceMeta` → iframe render. Serves manga archives (CBZ/CBR/CB7/CBT) as chaptered, scrolled/paged image readers with per-page messages and position restore.

## Commands

- `pnpm build` — build `dist/` (client + server bundle + manifest).
- `pnpm dev` — watch-build + serve the workbench at http://127.0.0.1:5199 (data from `testdata/pages`, one sandboxed `detect` on startup).
- `pnpm test` — Vitest against the in-memory fixture API; `pnpm run detect:smoke` — sandboxed `detect` against `testdata/pages` (needs a build first).
- `pnpm testdata` — generate the synthetic `testdata/pages` fixtures; `pnpm testdata:real` — download + verify real-world archive samples.
- `pnpm lint` — `biome check .` + `tsc --noEmit`; `pnpm format` — `biome check --write`; `pnpm lint-staged` — the pre-commit biome pass.
- `hoardodile plugin <run|package|dev>` — run hooks through the same worker sandbox the server uses (`run`), zip `dist/` into `release/<id>-<version>.zip` (`package`), or the offline dev workbench (`dev`).
- `pnpm readme:check` — gate the marketplace `readme/` folder (flat, ships one `README.md` fallback per locale). `pnpm release <version>` — release-it bumps version, writes `CHANGELOG.md`, tags `v<version>`, and the tag workflow builds/packages/uploads the GitHub release assets.

Git hooks (`lefthook.yml`, installed by `postinstall` when this is a git repo): `commit-msg` enforces the Conventional Commits format that feeds the changelog; `pre-commit` runs biome + `tsc` on staged files.

## Structure

```
src/main.ts               server-side definition (definePlugin): detect + sourceMeta + searchMeta
src/shared.ts             PluginSchema typed once, shared server ↔ client
src/render/hooks.ts       typed plugin API (definePluginAPI) for the client
src/render/MangaReader.tsx  iframe client (createPluginRoot @hoardodile/sdk-react)
src/core/                 detect/format/records/chapters book logic
src/render/               readers (PagedView/ScrollView), helpers, hooks
testdata/pages/           default data root for `hoardodile plugin dev` + detect:smoke
src/__tests__/            unit tests
```

## Architecture

- **Contract:** `manifest.json` + server `main.js` (`definePlugin`) + sandboxed iframe client. `manifest.ui.card`/`.search`/`.message` declare host-rendered `{{...}}` templates; the CLI lints them at build time.
- **Archive addressing:** every page is addressed as `outer!inner` (e.g. `book.cbz!Ch1/001.jpg`) and resolved through the single `resolveFileUrl` (0.1.8 `/files` addressing) — non-zip entries are materialized by `extractArchive` and served from the extraction cache.
- **SDK closure:** plugin code may import only `@hoardodile/{i18n,ui,sdk-*}`; terminal packages (`cli`, `host`, `host-web`, `workbench`) are never imported by a plugin.

## Testing

Vitest unit tests use `createResourceAPIFixture` (in-memory); the sandboxed path is exercised via `hoardodile plugin run detect testdata/pages --plugin-dir dist` — the exact production execution path.
