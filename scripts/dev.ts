/** Run the backend and frontend dev servers in parallel (bun-native). */
import { spawn } from 'bun';

/**
 * Parse a `--host` flag out of the CLI args. Accepts all three spellings:
 * `--host`, `--host=0.0.0.0` and `--host 0.0.0.0`. A bare `--host` mirrors
 * Vite and means "listen on every interface" (0.0.0.0).
 *
 * Returns `undefined` when the flag is absent so both servers keep their
 * default (loopback only).
 */
function parseHost(argv: string[]): string | undefined {
  const inline = argv.find((a) => a.startsWith('--host='));
  if (inline) return inline.slice('--host='.length) || '0.0.0.0';

  const i = argv.indexOf('--host');
  if (i === -1) return undefined;

  const next = argv[i + 1];
  return !next || next.startsWith('-') ? '0.0.0.0' : next;
}

const host = parseHost(process.argv.slice(2));

/**
 * Both children read the address from the environment: the API server already
 * reads `HOST`, and Vite picks `DEV_HOST` up in vite.config.ts. Passing it via
 * the environment avoids depending on how `bun run --filter` forwards args.
 */
const env = { ...process.env };
if (host) {
  env.HOST = host;
  env.DEV_HOST = host;
}

const commands: string[][] = [
  ['bun', 'run', '--filter', '@blog-writer/server-node', 'dev'],
  ['bun', 'run', '--filter', '@blog-writer/frontend', 'dev'],
];

if (host) {
  const shown = host === '0.0.0.0' ? 'all interfaces (0.0.0.0)' : host;
  console.log(`[dev] exposing dev servers on ${shown}`);
}

const procs = commands.map((cmd) =>
  spawn({ cmd, env, stdout: 'inherit', stderr: 'inherit' }),
);

const killAll = () => {
  for (const p of procs) p.kill();
  process.exit(0);
};
process.on('SIGINT', killAll);
process.on('SIGTERM', killAll);

Promise.all(procs.map((p) => p.exited)).then((codes) => {
  if (codes.some((c) => c !== 0)) process.exit(1);
});
