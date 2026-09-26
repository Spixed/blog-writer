# Contributing

Thanks for your interest in contributing!

## Setup

```bash
bun install
cp .env.example .env   # point BLOG_ROOT at a Hugo blog you own
bun dev
```

Requires Bun ≥ 1.2. Hugo is needed only for the 校验/预览 buttons and the
render tests.

## Before you open a PR

```bash
bun run typecheck
bun test
```

If your change touches the frontend render pipeline, also run the checks
listed in the README's [Testing](README.md#testing) section from
`packages/frontend`.

## The round-trip guarantee

This project's core invariant is that **reading a post and writing it back
must leave the file byte identical** (see the README). If your change can
affect markdown parsing, front-matter handling, or serialization, make sure
the round-trip tests still pass — byte drift is a bug, not a tradeoff.

## Scope

- `packages/shared` — types and contracts shared by every adapter
- `packages/server-node` — Fastify backend; keep it shell-agnostic
- `packages/frontend` — React UI; talk only to the `WorkspaceApi` contract,
  never to the backend directly
