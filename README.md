<div align="center">

# Blog Writer

**A desktop-quality editor for Hugo blogs, built around the polymer theme.**

Three editing modes · Floating front-matter panel · Full post management

[![CI](https://github.com/Spixed/blog-writer-web/actions/workflows/ci.yml/badge.svg)](https://github.com/Spixed/blog-writer-web/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Bun](https://img.shields.io/badge/runtime-Bun%20%E2%89%A5%201.2-f472b6)](https://bun.sh)

English · [简体中文](README.zh-CN.md)

</div>

---

A web UI first: the same frontend is reusable in an Electron / Tauri shell
later (and, one day, gpui). The frontend talks exclusively to the
`WorkspaceApi` contract, so switching shells only means swapping the adapter
in `src/api/index.ts`.

## Features

- **Three editing modes**
  - **WYSIWYG** — a Notion-style TipTap surface: prose blocks are edited
    directly, with a hover handle to drag-reorder, a gutter `+` to insert, a
    fixed formatting toolbar, a selection bubble menu, and a slash command
    panel (`/`) with grouped items, text filtering and arrow-key navigation.
  - **Split render** — plain Markdown | live render, synced scroll.
  - **Bilingual** — two WYSIWYG surfaces with synced scroll, and
    rename/delete aware of bilingual post pairing.
- **Non-text blocks are editable, not opaque** — inline `{{< qq-emoji >}}`
  and `{{< ruby >}}` are inline atoms rendered by the same pipeline (lottie
  included), inline `{{% hl %}}` is a coloured mark, images display inline
  with the theme's figure styling and `?width=` support, GFM tables are real
  TipTap tables, and Qmoji atoms support inline and block presentation.
  Multi-line `hl`, block math, raw HTML and indented code stay verbatim
  `rawBlock` atoms rendered through the preview pipeline — so they look
  exactly like the blog and round-trip byte-exact.
- **Byte-exact round-trip guarantee** — reading a post and writing it back
  must leave the file byte identical, including CRLF files and the
  Date-vs-string drift that JSON introduces. In WYSIWYG modes, prose blocks
  re-serialize canonically while complex blocks carry verbatim source.
- **Front matter** — a draggable floating panel available in every mode,
  with a visual form kept in sync with the Raw YAML view.
- **Post management** — search / filter / sort, new / rename / delete with
  bilingual pairing, undoable (Ctrl+Z / Ctrl+Shift+Z) via the post list's
  context menu.
- **Render pipeline** — markdown-it in a Web Worker with the theme's three
  shortcodes (`hl`, `qq-emoji`, `ruby`), MathJax v4, Shiki (Chroma/Monokai),
  image figures and `<!--more-->`.
- **Theme-faithful styling** — content is styled by the theme's own CSS,
  font stack and drop-cap sizing (re-measured per edit, resize and font
  load), so the editor and the live render match the blog. The theme follows
  the system colour scheme.
- **Source mode** — CodeMirror 6 with Markdown and shortcode completion,
  visible whitespace, indentation, and its built-in find/replace panel.
- **Backend** — Fastify + WebSocket: posts CRUD, config, taxonomy, file
  watching (posts, media, data, configuration, theme — add / change / unlink
  and conflict states, never silently overwriting a dirty draft), Hugo
  integration, media library and upload flow.
- **Details** — slugs accept any Unicode letter or digit
  (`birthday_δ-me13` works), autosave is configurable (250–10,000 ms,
  default 1,000 ms, off by default; Ctrl/Cmd+S always available), split mode
  hides meaningless blank lines above the first block without touching the
  file, and multiple workspaces are supported.

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

## Requirements

- [Bun](https://bun.sh) ≥ 1.2
- [Hugo](https://gohugo.io) (optional — needed for the 校验/预览 buttons and
  the render tests)

## Getting started

```bash
bun install
bun dev
```

- Backend: <http://127.0.0.1:7841> (Fastify + WebSocket)
- Frontend: <http://localhost:5173> (Vite, proxies `/api` and `/ws`)

To reach the dev servers from another device (e.g. a tablet on the same
LAN), pass `--host`:

```bash
bun dev --host                # bind both servers to 0.0.0.0
bun dev --host 192.168.1.10   # bind to one specific address
```

`--host` on its own equals `--host 0.0.0.0`. Without it both servers stay on
loopback.

## Configuration

The blog root is configured in `.env` (`BLOG_ROOT`, see
[`.env.example`](.env.example)) and is used to pre-register the default
workspace on first run. You can also pick a directory in the UI; that choice
is persisted to `~/.blog-writer/config.json`. Multiple workspaces are
supported.

## Project layout

```
packages/
  shared/        types, WorkspaceApi contract, front-matter schema, shortcode specs
  frontend/      React + Vite UI (reused verbatim by Electron/Tauri)
  server-node/   Fastify backend (reused by Electron's main process)
  electron/      (P5)
  tauri/         (P5)
```

## Testing

```bash
bun test                                     # byte-identical round-trip over every post (local, safe)
bun run --filter @blog-writer/server-node test:api   # same, through the HTTP layer

# from packages/frontend:
bun run test:blocks    # every block renders identically to Hugo, edits are byte-exact no-ops
bun run test:prose     # every post: Markdown -> WYSIWYG -> Markdown is stable and lossless
bun run test:schema    # every post's WYSIWYG document is a legal ProseMirror doc
bun run test:render    # full Hugo build + per-block HTML diff (needs Hugo)
bun run test:ui        # SSR smoke test of all three editor modes
bun test test/editor-regressions.test.ts # source completion / heading scroll regressions
```

Browser regressions (start `bun dev` first; scripts use Playwright CLI):

```bash
playwright-cli -s=ui open http://localhost:5173/
playwright-cli -s=ui run-code --filename=packages/frontend/test/browser-layout.js
playwright-cli -s=ui run-code --filename=packages/frontend/test/browser-editor.js
playwright-cli -s=ui run-code --filename=packages/frontend/test/browser-interactions.js
playwright-cli -s=ui run-code --filename=packages/frontend/test/browser-performance.js
playwright-cli -s=ui run-code --filename=packages/frontend/test/browser-performance-p4.js
```

The scripts exercise media stability, heading alignment in both directions,
caption and language editing, Qmoji replacement, slash commands, and save
debouncing. Write requests in editing/save tests are intercepted; the blog
files are not test fixtures to modify. They expect the configured sample
blog.

The P4 perf probe creates a 62 KiB mixed document, types and scrolls it, and
records `longtask` entries. A local run measured 0.4 ms median, 0.7 ms p95,
2.7 ms maximum insertion time, and no long task. It is a repeatable local
acceptance probe; hardware and browser differences can change the numbers.

## Editing controls

- Type `/` at the start of a paragraph or after whitespace, click `/` in the
  toolbar, or hover a block and click its gutter `+`. Arrow keys choose
  commands, Enter inserts, and Escape dismisses. Drag the gutter grip to
  reorder a block.
- `hl` and `ruby` are in the bubble menu and the slash panel; `qq-emoji` is
  only in the slash panel and opens a searchable visual picker over the
  site's emoji mapping.
- Select a Qmoji to replace it or change inline/block presentation in the
  toolbar. Select Ruby text to edit its text and annotation. Images expose an
  editable caption; selecting the image also exposes its URL and title.
- Put the caret in a code block to choose its language or type a custom name.
- In source mode, `{{<` / `{{%` and `/` offer syntax snippets, Tab indents,
  and Ctrl/Cmd+F opens find/replace.
- Autosave defaults to **off**. When enabled, the header exposes a
  250–10,000 ms delay (1,000 ms by default); Ctrl/Cmd+S and the save button
  remain available.
- The image dialog includes a media library and upload flow.

The interaction references are
[Lexical](https://github.com/facebook/lexical) (keyboard-driven component
picker), [BlockSuite](https://github.com/toeverything/BlockSuite) (block
affordances and contextual controls), and
[Editor.js](https://github.com/codex-team/editor.js) (block insertion and
settings). The editor continues to use ProseMirror/Tiptap so its existing
Markdown and Hugo shortcode representation remains reusable.

## Roadmap

| Phase | Scope | Status |
| --- | --- | --- |
| P0 | Infrastructure: monorepo, Workspace API contract, Fastify backend, Vite shell | ✅ |
| P1 | Post management + visual front matter, autosave, Ctrl+S | ✅ |
| P2 | Render pipeline: Web Worker, shortcodes, MathJax, Shiki, Hugo checks (14 posts / 900 blocks) | ✅ |
| P3 | Three modes, floating front-matter panel, undoable rename/delete | 🔧 |
| P4 | Media manager, find & replace, perf pass | ⏳ |
| P5 | Electron / Tauri shells | ⏳ |
| P6 | gpui native (when the ecosystem is ready) | ⏳ |

Pixel-level visual parity between the WYSIWYG surface and the live render is
not yet an automated acceptance guarantee.

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for setup,
the checks to run before opening a PR, and the round-trip guarantee that
changes to parsing or serialization must preserve.

## License

[MIT](LICENSE)
