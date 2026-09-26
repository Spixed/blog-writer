// Round-trip smoke test: read a post, write it back with a stringified date
// (as the UI sends), and verify the file on disk is byte-identical.
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';

const API = 'http://127.0.0.1:7841/api';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  for (let i = 0; i < 30; i++) {
    try {
      const h = await (await fetch(`${API}/health`)).json();
      if (h.ok) break;
    } catch {
      // waiting for server
    }
    await sleep(500);
  }

  const slug = 'qmoji-showcase';
  const file = `D:\\Projects\\blog\\content\\zh\\post\\${slug}.md`;
  const before = createHash('sha256')
    .update(await fs.readFile(file))
    .digest('hex');

  const post = await (await fetch(`${API}/posts/zh/${slug}`)).json();
  const fm = { ...post.frontmatter, date: String(post.frontmatter.date) }; // string, like the UI
  const res = await fetch(`${API}/posts/zh/${slug}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ frontmatter: fm, body: post.body }),
  });
  if (!res.ok) {
    console.log('PUT failed:', res.status, await res.text());
    process.exit(1);
  }

  const after = createHash('sha256')
    .update(await fs.readFile(file))
    .digest('hex');
  console.log('round-trip byte-identical:', before === after);

  // Second pass: an actual content change must take effect.
  const body2 = `${post.body}\n\n<!-- smoke -->\n`;
  const _res2 = await fetch(`${API}/posts/zh/${slug}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ frontmatter: fm, body: body2 }),
  });
  const afterText = await fs.readFile(file, 'utf8');
  console.log('body change applied:', afterText.includes('<!-- smoke -->'));

  // Restore original content.
  await fetch(`${API}/posts/zh/${slug}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ frontmatter: fm, body: post.body }),
  });
  const restored = createHash('sha256')
    .update(await fs.readFile(file))
    .digest('hex');
  console.log('restored to original:', restored === before);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
