import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * The qmoji images the theme references live on jsDelivr
 * (github.com/Spixed/Qmoji@main), which is slow or unavailable from some
 * networks. The editor fetches them through this disk-caching proxy instead:
 * first request goes out to the first reachable mirror, the bytes are stored
 * under the app's home dir, and every later request is served from disk with
 * an immutable cache header.
 */

const QMOJI_REPO_PATH = '/gh/Spixed/Qmoji@main/res/';
/** Mirrors tried in order; all serve the same jsDelivr path space. */
const HOSTS = [
  'cdn.jsdelivr.net',
  'fastly.jsdelivr.net',
  'gcore.jsdelivr.net',
  'testingcf.jsdelivr.net',
];

const ENTRY_RE = /^([\w-]+)\/(thumb\.png|apng\.png|lottie\.json)$/;

function cacheDir(): string {
  const home = process.env.BLOG_WRITER_HOME || path.join(os.homedir(), '.blog-writer');
  return path.join(home, 'qmoji-cache');
}

/** Fetch and cache one qmoji asset; returns its bytes. */
export async function fetchQmoji(rel: string): Promise<Buffer> {
  const entry = ENTRY_RE.exec(rel);
  if (!entry) throw new Error('无效的 Qmoji 路径');
  const dest = path.join(cacheDir(), entry[1], entry[2]);
  try {
    return await fs.readFile(dest);
  } catch {
    // not cached yet: fall through to the network
  }
  const attempts = HOSTS.map(async (host) => {
    const res = await fetch(`https://${host}${QMOJI_REPO_PATH}${rel}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`${host}: HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  });
  let data: Buffer;
  try {
    data = await Promise.any(attempts);
  } catch (err) {
    const causes = err instanceof AggregateError ? err.errors : [err];
    const reason = causes
      .map((cause) => (cause instanceof Error ? cause.message : String(cause)))
      .join('; ');
    throw new Error(`Qmoji 资源下载失败（已尝试 ${HOSTS.length} 个镜像）: ${reason}`);
  }
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, data);
  return data;
}

export function qmojiContentType(rel: string): string {
  return rel.endsWith('.json') ? 'application/json' : 'image/png';
}
