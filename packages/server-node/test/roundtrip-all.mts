// Round-trip regression test over every post in the blog.
// For each file: parse -> simulate the JSON API round-trip (Date -> ISO string)
// -> dump -> assert byte-identical output.
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseFile, dumpFile, dumpFrontmatter } from '../src/frontmatter-io.js';

// BLOG_ROOT overrides (bun auto-loads .env); otherwise the committed fixture.
const BLOG = process.env.BLOG_ROOT ?? path.resolve(import.meta.dir, '../../fixtures/blog');

async function* walk(dir: string): AsyncGenerator<string> {
  let entries: string[] = [];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const p = path.join(dir, name);
    const st = await fs.stat(p);
    if (st.isDirectory()) yield* walk(p);
    else if (name.endsWith('.md')) yield p;
  }
}

async function main() {
  let checked = 0;
  let failed = 0;
  const files: string[] = [];
  for await (const f of walk(path.join(BLOG, 'content'))) {
    if (f.includes(path.join('post'))) files.push(f);
  }

  for (const file of files) {
    const raw = await fs.readFile(file, 'utf8');
    const parsed = parseFile(raw);
    // Simulate what the UI receives and sends back.
    const overWire = JSON.parse(JSON.stringify(parsed.frontmatter));
    const out = dumpFile(parsed, { frontmatter: overWire, body: parsed.body });
    checked++;
    if (out !== raw) {
      failed++;
      console.log(`FAIL  ${path.relative(BLOG, file)}`);
      // Show the first divergence.
      const n = Math.min(out.length, raw.length);
      let i = 0;
      while (i < n && out[i] === raw[i]) i++;
      console.log(`  first diff at ${i}:`);
      console.log(`  orig: ${JSON.stringify(raw.slice(Math.max(0, i - 40), i + 60))}`);
      console.log(`  out : ${JSON.stringify(out.slice(Math.max(0, i - 40), i + 60))}`);
    }
  }

  // A body-only edit must leave the front matter untouched.
  const sample = files[0];
  if (sample) {
    const raw = await fs.readFile(sample, 'utf8');
    const parsed = parseFile(raw);
    const overWire = JSON.parse(JSON.stringify(parsed.frontmatter));
    const out = dumpFile(parsed, {
      frontmatter: overWire,
      body: `${parsed.body}\n\n<!-- body edit -->\n`,
    });
    const outParsed = parseFile(out);
    const fmUnchanged = outParsed.frontmatterRaw === parsed.frontmatterRaw;
    console.log(`body-only edit keeps FM verbatim: ${fmUnchanged} (${path.basename(sample)})`);
    if (!fmUnchanged) failed++;
  }

  console.log(`\nchecked ${checked} posts, ${failed} failures`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
