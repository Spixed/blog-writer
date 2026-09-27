import { build } from 'bun';
const result = await build({ entrypoints: ['packages/server-node/src/server.ts'], outdir: 'electron/dist', naming: 'server.mjs', target: 'node', format: 'esm', external: ['fsevents'], sourcemap: 'external' });
if (!result.success) process.exit(1);
