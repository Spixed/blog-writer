<div align="center">

# Blog Writer

**A local-first editor for Hugo blogs. WYSIWYG, split-render, and bilingual
modes — with a byte-exact round-trip guarantee.**

[![CI](https://github.com/Spixed/blog-writer/actions/workflows/ci.yml/badge.svg)](https://github.com/Spixed/blog-writer/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Bun](https://img.shields.io/badge/runtime-Bun%20%E2%89%A5%201.2-f472b6)](https://bun.sh)

English · [简体中文](README.zh-CN.md)

</div>

## Why

Hugo gives you full control over your content — but you write it in a plain
text editor and preview it through a build step. Blog Writer puts a
Notion-style editing surface directly on top of a real Hugo workspace:

- Content is rendered and styled with **your theme's own CSS**, so the editor
  looks like the published blog.
- Every save is **byte-exact**: reading a post and writing it back never
  changes the file. The editor re-serializes only what you actually edit and
  keeps everything else verbatim.
- Hugo shortcodes are **editable atoms**, not opaque text.

The project is web-first: the same frontend can later run unchanged inside an
Electron / Tauri shell, because it talks only to the `WorkspaceApi` contract —
switching shells means swapping one adapter.

## Features

- **Three editing modes** — WYSIWYG (TipTap, with drag-to-reorder blocks, a
  gutter `+`, a slash command panel and a bubble menu), split render (Markdown
  | live preview with synced scroll), and bilingual (two synced WYSIWYG
  surfaces, pairing-aware rename/delete).
- **Editable non-text blocks** — inline `{{< qq-emoji >}}` and `{{< ruby >}}`
  shortcodes, coloured `{{% hl %}}` marks, theme-styled images with
  `?width=`, and real GFM tables. Complex blocks (block math, raw HTML,
  indented code) are rendered through the preview pipeline and round-trip
  byte-exact.
- **Front-matter panel** — a draggable floating panel in every mode; the
  visual form and the raw YAML view stay in sync.
- **Post management** — search / filter / sort, bilingual-pairing-aware
  create / rename / delete, undoable via Ctrl+Z / Ctrl+Shift+Z.
- **Media manager** — media library, upload flow, and an image dialog wired
  to both.
- **Find & replace** — the Markdown source pane's built-in CodeMirror panel
  (`Ctrl/Cmd+F`), alongside Markdown and shortcode completion, visible
  whitespace and indentation.
- **Theme-faithful rendering** — markdown-it in a Web Worker with the theme's
  three shortcodes, MathJax v4, Shiki (Chroma/Monokai), image figures and
  `<!--more-->`; the theme's font stack and drop-cap sizing are re-measured
  live, and the theme follows the system colour scheme.
- **Solid backend** — Fastify + WebSocket: posts CRUD, config, taxonomy, file
  watching (posts, media, data, configuration, theme) with conflict states —
  a dirty draft is never silently overwritten — plus Hugo integration.
- **Careful details** — Unicode slugs (`birthday_δ-me13` works), configurable
  autosave (250–10,000 ms, default 1,000 ms, off by default; Ctrl/Cmd+S
  always available), and multiple workspaces.

## Screenshots

<div align="center">
<table>
  <tr>
    <td><img src="docs/screenshots/wysiwyg.png" alt="WYSIWYG mode" /></td>
    <td><img src="docs/screenshots/split.png" alt="Split render mode" /></td>
  </tr>
  <tr>
    <td align="center">WYSIWYG</td>
    <td align="center">Split render</td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/bilingual.png" alt="Bilingual mode" /></td>
    <td><img src="docs/screenshots/front-matter.png" alt="Front-matter panel" /></td>
  </tr>
  <tr>
    <td align="center">Bilingual</td>
    <td align="center">Floating front-matter panel</td>
  </tr>
</table>
</div>

## Getting started

Requirements: [Bun](https://bun.sh) ≥ 1.2. [Hugo](https://gohugo.io) is
optional — needed only for the check/preview buttons and the render tests.

```bash
bun install
bun dev
```

- Backend: <http://127.0.0.1:7841> (Fastify + WebSocket)
- Frontend: <http://localhost:5173> (Vite, proxies `/api` and `/ws`)

To reach the dev servers from another device on your LAN:

```bash
bun dev --host                # bind both servers to 0.0.0.0
bun dev --host 192.168.1.10   # bind to a specific address
```

## Configuration

Point `BLOG_ROOT` in `.env` (see [`.env.example`](.env.example)) at your Hugo
blog root — it is used to pre-register the default workspace on first run.
You can also pick a directory in the UI; that choice is persisted to
`~/.blog-writer/config.json`. Multiple workspaces are supported.

## Project structure

```
packages/
  shared/        types, WorkspaceApi contract, front-matter schema, shortcode specs
  frontend/      React + Vite UI (designed to be reused verbatim by Electron/Tauri)
  server-node/   Fastify backend (reusable by an Electron main process)
```

## Development

```bash
bun run typecheck    # TypeScript across all packages
bun run lint         # Biome
bun run format       # Biome with --write
```

### Testing

| Command | Verifies |
| --- | --- |
| `bun test` | Byte-identical round-trip over every post (local, safe) |
| `bun run --filter @blog-writer/server-node test:api` | Same, through the HTTP layer |

From `packages/frontend`:

| Command | Verifies |
| --- | --- |
| `bun run test:blocks` | Every block renders identically to Hugo; edits are byte-exact no-ops |
| `bun run test:prose` | Markdown → WYSIWYG → Markdown is stable and lossless for every post |
| `bun run test:schema` | Every WYSIWYG document is a legal ProseMirror doc |
| `bun run test:render` | Full Hugo build + per-block HTML diff (needs Hugo) |
| `bun run test:ui` | SSR smoke test of all three editor modes |
| `bun test test/editor-regressions.test.ts` | Source completion / heading-scroll regressions |

Browser regressions (start `bun dev` first; scripts use the Playwright CLI):

```bash
playwright-cli -s=ui open http://localhost:5173/
playwright-cli -s=ui run-code --filename=packages/frontend/test/browser-layout.js
playwright-cli -s=ui run-code --filename=packages/frontend/test/browser-editor.js
playwright-cli -s=ui run-code --filename=packages/frontend/test/browser-interactions.js
playwright-cli -s=ui run-code --filename=packages/frontend/test/browser-performance.js
playwright-cli -s=ui run-code --filename=packages/frontend/test/browser-performance-p4.js
```

These scripts cover media stability, heading alignment in both directions,
caption and language editing, Qmoji replacement, slash commands, and save
debouncing. Write requests in editing/save tests are intercepted — the blog
files are not test fixtures. The scripts expect the configured sample blog.

The P4 performance probe types and scrolls a 62 KiB mixed document and
records `longtask` entries. A reference local run measured 0.4 ms median /
0.7 ms p95 / 2.7 ms max insertion latency with no long task. It is a
repeatable acceptance probe; hardware and browser differences change the
numbers.

## Roadmap

| Phase | Scope | Status |
| --- | --- | --- |
| P0 | Infrastructure: monorepo, Workspace API contract, Fastify backend, Vite shell | ✅ |
| P1 | Post management, visual front matter, autosave, Ctrl+S | ✅ |
| P2 | Render pipeline: Web Worker, shortcodes, MathJax, Shiki, Hugo checks | ✅ |
| P3 | Three editing modes, floating front-matter panel, undoable rename/delete | ✅ |
| P4 | Media manager, find & replace, performance pass | ✅ |
| P5 | Electron / Tauri shells | ⏳ |
| P6 | gpui native (when the ecosystem is ready) | 🔭 |

Known limitation: pixel-level visual parity between the WYSIWYG surface and
the live render is not yet an automated acceptance guarantee.

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for setup,
the checks to run before opening a PR, and the round-trip guarantee that
parsing and serialization changes must preserve.

## Acknowledgements

The editor's interaction design draws on
[Lexical](https://github.com/facebook/lexical) (keyboard-driven component
picker), [BlockSuite](https://github.com/toeverything/BlockSuite) (block
affordances and contextual controls), and
[Editor.js](https://github.com/codex-team/editor.js) (block insertion and
settings), while continuing to build on ProseMirror / TipTap.

## License

[MIT](LICENSE)
