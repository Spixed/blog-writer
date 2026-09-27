# Contributing

Thanks for your interest in contributing to Blog Writer!

## Setup

Requirements: [Bun](https://bun.sh) ≥ 1.2. [Hugo](https://gohugo.io) is
optional — needed only for the check/preview buttons and the render tests.

```bash
bun install
cp .env.example .env   # point BLOG_ROOT at a Hugo blog you own
bun dev
```

- Backend: <http://127.0.0.1:7841> · Frontend: <http://localhost:5173>

## Project structure

| Package | Scope |
| --- | --- |
| `packages/shared` | Types and contracts shared by every adapter |
| `packages/server-node` | Fastify backend — keep it shell-agnostic |
| `packages/frontend` | React UI — talk only to the `WorkspaceApi` contract, never to the backend directly |
| `electron/` | Desktop shell — main process, sandboxed preload bridge, packaging config. No second API: everything still goes through `WorkspaceApi` |
| `scripts/` | Dev server and build helpers (`dev.ts`, `fetch-fonts.mjs`) |

## Pull request checklist

Before opening a PR, make sure all of the following pass:

```bash
bun run typecheck
bun run lint
bun test
```

If your change touches the frontend render pipeline, also run the frontend
checks listed in the README's [Testing](README.md#testing) section from
`packages/frontend`. If it touches the Electron shell or packaging, run
`bun run electron:dev` once to verify the desktop launch path.

## The round-trip guarantee

This project's core invariant: **reading a post and writing it back must
leave the file byte identical**. The editor re-serializes only the blocks you
actually edit; everything else — including CRLF line endings and Hugo
shortcodes it doesn't model — must survive verbatim.

If your change can affect markdown parsing, front-matter handling, or
serialization, make sure the round-trip tests still pass. Byte drift is a
bug, not a tradeoff.

## Code style

Formatting and linting are enforced by [Biome](https://biomejs.dev):

```bash
bun run lint      # check
bun run format    # auto-fix
```
