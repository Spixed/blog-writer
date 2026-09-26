// Local debug: simulate the API round-trip without touching the server.
import fs from 'node:fs/promises';
import { dumpFile, dumpFrontmatter, parseFile } from '../src/frontmatter-io.js';

const file = 'D:\\Projects\\blog\\content\\zh\\post\\qmoji-showcase.md';

async function main() {
  const raw = await fs.readFile(file, 'utf8');
  const parsed = parseFile(raw);
  console.log(
    'parsed.date type:',
    parsed.frontmatter.date?.constructor.name,
    JSON.stringify(parsed.frontmatter.date),
  );

  // What the API sends back to the UI (Date -> ISO string over JSON):
  const overWire = JSON.parse(JSON.stringify(parsed.frontmatter));
  console.log('over-the-wire date:', JSON.stringify(overWire.date));

  // What the canonical dump of each side looks like:
  const canonicalParsed = dumpFrontmatter(parsed.frontmatter);
  const canonicalNext = dumpFrontmatter(overWire);
  console.log('canonical equal:', canonicalParsed === canonicalNext);
  if (canonicalParsed !== canonicalNext) {
    console.log(`--- canonicalParsed ---\n${canonicalParsed}`);
    console.log(`--- canonicalNext ---\n${canonicalNext}`);
  }

  const out = dumpFile(parsed, { frontmatter: overWire, body: parsed.body });
  console.log('round-trip identical:', out === raw);
  if (out !== raw) {
    console.log(`--- output head ---\n${out.slice(0, 400)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
