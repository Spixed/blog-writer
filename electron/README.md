# Electron shell

The shell starts the existing Fastify server on a loopback port and serves
the production Vite build from the same origin, preserving the `WorkspaceApi`
contract. No second API: all post operations still flow through the backend,
so web and desktop behavior share the same tests.

## Commands

```bash
bun run electron:dev     # build frontend + server bundle, open an Electron window
bun run electron:dist    # package installers via electron-builder
```

`electron:dist` runs `electron:prepare` first, which vendors the theme fonts
(`scripts/fetch-fonts.mjs` → `packages/frontend/public/fonts`) and downloads
Hugo extended 0.166.0 (`electron/fetch-hugo.mjs` → `electron/resources/hugo`,
mirror-friendly via the `HUGO_MIRROR` env var). Both steps are idempotent.

## What the shell adds

- **Persisted loopback port** — the bound port is saved in userData and
  reused on later launches, so localStorage-backed UI preferences keep their
  origin across restarts.
- **Bundled Hugo** — the packaged app ships `hugo`/`hugo.exe` as an extra
  resource, so check/preview works without a local Hugo install
  (`BLOG_HUGO_BIN` overrides this in dev).
- **Native folder picker** — a minimal sandboxed preload bridge
  (`window.blogWriter.chooseDirectory`); under the plain dev server, folder
  picking degrades to typing a path.
- **Portable data home** — Windows portable builds keep user data next to
  the exe (`user-data/`); `BLOG_WRITER_HOME` overrides the location.

## Artifacts

| OS | Targets |
| --- | --- |
| Windows | NSIS installer + portable exe |
| macOS | dmg + zip (x64 and arm64) |
| Linux | AppImage + deb (x64 and arm64) |

Output lands in `electron/release/`. Tag pushes (`v*`) build all five
platform targets in CI
([.github/workflows/electron.yml](../.github/workflows/electron.yml)) and
attach the artifacts to the GitHub release.

Set `BLOG_ROOT` before launching to pre-register a Hugo site on first run.
