/**
 * Block-splitter verification for the inline (Typora-style) editor.
 *
 *  1. Block ranges tile the source exactly (no line lost or duplicated).
 *  2. Rendering with markers emits exactly one marker per block.
 *  3. Markers are inert: stripping them yields byte-identical HTML to a plain
 *     render, proving the editable preview shows the same document.
 *
 * Run: bun run test/blocks-check.mts
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { editBlockText, replaceBlock, simpleTextBlock, splitBlocks } from '../src/render/blocks.js';
import { renderSource } from '../src/render/md.js';

const BLOG = process.env.BLOG_ROOT ?? path.resolve(import.meta.dir, '../../../fixtures/blog');

function splitBody(raw: string): string {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  return m ? m[2] : raw;
}

async function readBodies(): Promise<string[]> {
  const out: string[] = [];
  for (const lang of ['zh', 'en'] as const) {
    const dir = path.join(BLOG, 'content', lang, 'post');
    const names = (await fs.readdir(dir)).filter((n) => n.endsWith('.md'));
    for (const name of names) {
      out.push(splitBody(await fs.readFile(path.join(dir, name), 'utf8')));
    }
  }
  return out;
}

async function readQmoji() {
  return JSON.parse(
    await fs.readFile(path.join(BLOG, 'themes/polymer/data/qmoji/mapping.json'), 'utf8'),
  );
}

let failed = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error(`  FAIL ${msg}`);
    failed++;
  } else {
    console.log(`  ok   ${msg}`);
  }
}

const qmoji = await readQmoji();
const bodies = await readBodies();

let totalBlocks = 0;
for (let bi = 0; bi < bodies.length; bi++) {
  const body = bodies[bi];
  const blocks = splitBlocks(body);

  // 1. Contiguous tiling.
  let ok =
    blocks.length > 0 &&
    blocks[0].start === 0 &&
    blocks[blocks.length - 1].end === body.split('\n').length;
  for (let i = 1; i < blocks.length; i++) {
    if (blocks[i].start !== blocks[i - 1].end) ok = false;
  }
  assert(ok, `post #${bi}: ${blocks.length} blocks tile the source`);

  // 2 + 3. Markers: one per block, and inert. markdown-it joins top-level
  // blocks with a single newline, so the marker plus its trailing newline are
  // removed for the comparison.
  const marked = await renderSource(body, { qmoji }, { markers: true });
  const plain = await renderSource(body, { qmoji });
  const count = (marked.html.match(/<p data-blk-marker="\d+"><\/p>/g) ?? []).length;
  assert(count === blocks.length, `post #${bi}: ${count} markers for ${blocks.length} blocks`);
  const stripped = marked.html.replace(/<p data-blk-marker="\d+"><\/p>\n?/g, '');
  assert(stripped === plain.html, `post #${bi}: markers leave the render unchanged`);

  // 4. Editing nothing must change nothing: every block, spliced back over
  //    itself, reproduces the source byte for byte (incl. CRLF endings).
  // 5. Simple-text blocks round-trip: prefix + text is the original line.
  const lines = body.split('\n');
  let noop = 0;
  let simple = 0;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (replaceBlock(body, i, lines.slice(b.start, b.end).join('\n')) === body) noop++;
    const st = simpleTextBlock(lines, b);
    if (st) {
      simple++;
      const crlf = body.includes('\r\n');
      if (st.prefix + st.text + (crlf ? '\r' : '') !== lines[b.start]) {
        // The content line may be preceded by the block's blank lines.
        let ci = b.start;
        while (ci < b.end && /^[ \t]*\r?$/.test(lines[ci])) ci++;
        if (st.prefix + st.text + (crlf ? '\r' : '') !== lines[ci]) {
          assert(false, `post #${bi} block ${i}: simple-text prefix+text != source line`);
          break;
        }
      }
      // Editing the text back over itself must reproduce the file byte for byte.
      if (editBlockText(body, i, st.text) !== body) {
        assert(false, `post #${bi} block ${i}: text edit is not a byte-exact no-op`);
        break;
      }
    }
  }
  assert(
    noop === blocks.length,
    `post #${bi}: every block is a byte-exact no-op edit (${simple} simple-text blocks)`,
  );
  totalBlocks += blocks.length;
}

console.log(`blocks-check: ${bodies.length} posts, ${totalBlocks} blocks`);

// Splitter unit cases (regressions that previously fused many blocks into one
// giant raw block): an ATX heading always starts its own block, even right
// after a list item, and a GFM table keeps its own block.
{
  // Each case locates the block containing `find` and asserts the exact source
  // lines it spans, so a fused heading/list block fails loudly.
  const cases: { name: string; src: string; find: string; want: string }[] = [
    {
      name: 'ATX heading after a list is its own block',
      src: '- a\n- b\n# H\n',
      find: '# H',
      want: '# H',
    },
    {
      name: 'ATX heading right after a tight list item',
      src: '- a\n# H\n',
      find: '# H',
      want: '# H',
    },
    {
      name: 'a GFM table stays a single block',
      src: '| a | b |\n|---|---|\n| 1 | 2 |\n',
      find: '| 1 | 2 |',
      want: '| a | b |\n|---|---|\n| 1 | 2 |',
    },
  ];
  for (const c of cases) {
    const lines = c.src.split('\n');
    const blocks = splitBlocks(c.src);
    const at = lines.indexOf(c.find);
    const b = blocks.find((x) => x.start <= at && at < x.end);
    const got = b ? lines.slice(b.start, b.end).join('\n') : '<none>';
    assert(
      got === c.want,
      `${c.name}: block is ${JSON.stringify(got)}, want ${JSON.stringify(c.want)}`,
    );
  }
}

if (failed) {
  console.error(`blocks-check: ${failed} FAILURE(S)`);
  process.exit(1);
}
console.log('blocks-check: all assertions passed');
process.exit(0);
