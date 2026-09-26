import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from './server.js';

/**
 * Load .env from cwd, then from the monorepo root (first-run convenience).
 * Hand-rolled so it works identically under Bun and Node.
 */
function loadEnv(): void {
  const here = fileURLToPath(import.meta.url);
  const seen = new Set<string>();
  for (const dir of [process.cwd(), path.resolve(here, '../../..')]) {
    const p = path.join(dir, '.env');
    if (seen.has(p)) continue;
    seen.add(p);
    try {
      const text = readFileSync(p, 'utf8');
      for (const line of text.split(/\r?\n/)) {
        const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
        if (m && process.env[m[1]] === undefined) {
          process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
        }
      }
    } catch {
      // file missing: try next candidate
    }
  }
}

loadEnv();

const PORT = Number(process.env.PORT ?? 7841);
const HOST = process.env.HOST ?? '127.0.0.1';

async function main(): Promise<void> {
  const { close } = await createServer({
    port: PORT,
    host: HOST,
    defaultRoot: process.env.BLOG_ROOT,
    defaultName: process.env.BLOG_NAME,
  });
  // eslint-disable-next-line no-console
  console.log(`[blog-writer] server listening on http://${HOST}:${PORT}`);

  const shutdown = async () => {
    await close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
