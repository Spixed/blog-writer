/**
 * P3 acceptance test: every zh/en post survives Markdown -> WYSIWYG -> Markdown
 * without losing content, and the WYSIWYG surface actually edits prose natively
 * (not everything as a raw block).
 *
 * The guarantee is idempotency + inline-text preservation, not byte-identity:
 * prose blocks are re-serialised canonically, which is inherent to WYSIWYG.
 * Unsupported complex blocks stay verbatim raw blocks.
 *
 * Run: bun run test:prose
 */
import fs from 'node:fs';
import path from 'node:path';
import { extractFences } from '../src/render/fences.ts';
import type { ProseNode } from '../src/render/prose.ts';
import { markdownToProse, proseToMarkdown } from '../src/render/prose.ts';

const POST_DIR = process.env.BLOG_ROOT
  ? path.join(process.env.BLOG_ROOT, 'content')
  : path.resolve(import.meta.dir, '../../../fixtures/blog/content');
const FM_SPLIT = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/** Concatenated text of every editable node (raw blocks keep verbatim source). */
function textOf(doc: ProseNode): string {
  const out: string[] = [];
  const walk = (n: ProseNode): void => {
    if (n.type === 'text') out.push(n.text ?? '');
    if (n.type === 'rawBlock') out.push(String(n.attrs?.source ?? ''));
    for (const c of n.content ?? []) walk(c);
  };
  for (const c of doc.content ?? []) walk(c);
  return out.join('');
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

const posts: { lang: string; name: string; body: string }[] = [];
for (const lang of ['zh', 'en']) {
  for (const name of fs.readdirSync(`${POST_DIR}/${lang}/post`)) {
    if (!name.endsWith('.md')) continue;
    const raw = fs.readFileSync(`${POST_DIR}/${lang}/post/${name}`, 'utf8');
    const m = FM_SPLIT.exec(raw);
    posts.push({ lang, name, body: m ? m[2] : raw });
  }
}

console.log(`prose-roundtrip: ${posts.length} posts`);
for (const p of posts) {
  const doc = markdownToProse(p.body);
  const rt = proseToMarkdown(doc);
  const counts: Record<string, number> = {};
  for (const n of doc.content) counts[n.type] = (counts[n.type] ?? 0) + 1;
  const native = Object.entries(counts).filter(([k]) => k !== 'rawBlock');
  const nativeCount = native.reduce((a, [, v]) => a + v, 0);
  assert(
    nativeCount > 0,
    `${p.lang}/${p.name} has editable prose blocks (${JSON.stringify(Object.fromEntries(native))})`,
  );
  // Round trip is idempotent.
  assert(rt === proseToMarkdown(markdownToProse(rt)), `${p.lang}/${p.name} round trip is stable`);
  // No content is lost: text (incl. raw block sources) is preserved exactly.
  assert(
    textOf(doc) === textOf(markdownToProse(rt)),
    `${p.lang}/${p.name} round trip preserves all text`,
  );
}

/**
 * Targeted assertions for the non-text blocks the WYSIWYG surface edits
 * natively: shortcodes become atoms/marks, tables become real tables, and a
 * fence nested in a list is dedented to match Hugo (not left at source indent).
 */
function deepTypes(n: ProseNode, into: Record<string, number>): void {
  into[n.type] = (into[n.type] ?? 0) + 1;
  for (const c of n.content ?? []) deepTypes(c, into);
}
const byName = new Map(posts.map((p) => [p.name, p]));

// The assertions below target named posts from the sample blog. When running
// against another blog (e.g. the committed fixture) they simply don't apply.
{
  // qmoji-showcase: inline qq-emoji atoms + ruby + hl marks, no giant rawBlock.
  const p = byName.get('qmoji-showcase.md');
  if (p) {
    const doc = markdownToProse(p.body);
    const types: Record<string, number> = {};
    for (const c of doc.content ?? []) deepTypes(c, types);
    assert((types.qmoji ?? 0) > 0, `qmoji-showcase has ${types.qmoji ?? 0} inline qmoji atoms`);
    assert(
      (types.heading ?? 0) > 0,
      `qmoji-showcase splits into ${types.heading ?? 0} headings (not one rawBlock)`,
    );
    assert((types.paragraph ?? 0) > 0, `qmoji-showcase has ${types.paragraph ?? 0} paragraphs`);
    const giant = (doc.content ?? []).filter(
      (n) => n.type === 'rawBlock' && String(n.attrs?.source ?? '').split('\n').length > 20,
    );
    assert(giant.length === 0, `qmoji-showcase has no >20-line rawBlock (got ${giant.length})`);
  }
}

{
  // school.md: GFM tables are native TipTap tables.
  const p = byName.get('school.md');
  if (p) {
    const types: Record<string, number> = {};
    for (const c of markdownToProse(p.body).content ?? []) deepTypes(c, types);
    assert((types.table ?? 0) >= 1, `school.md has ${types.table ?? 0} native table(s)`);
    assert((types.tableCell ?? 0) > 0, `school.md has ${types.tableCell ?? 0} table cells`);
  }
}

{
  const source =
    '| Heading | Code | Escaped |\n| --- | --- | --- |\n| first<br>second | `<br>` literal | \\<br> literal |';
  const doc = markdownToProse(source);
  const table = doc.content.find((node) => node.type === 'table');
  const bodyCells = table?.content?.[1]?.content ?? [];
  const firstLine = bodyCells[0]?.content?.[0]?.content ?? [];
  const codeLine = bodyCells[1]?.content?.[0]?.content ?? [];
  const escapedLine = bodyCells[2]?.content?.[0]?.content ?? [];
  assert(
    firstLine.some((node) => node.type === 'hardBreak'),
    'table <br> becomes an editable line break',
  );
  assert(
    codeLine.every((node) => node.type !== 'hardBreak'),
    'code span <br> stays literal',
  );
  assert(
    escapedLine.every((node) => node.type !== 'hardBreak'),
    'escaped <br> stays literal',
  );
  const roundTrip = proseToMarkdown(doc);
  assert(roundTrip.includes('first<br>second'), 'table line break serializes as <br>');
  assert(
    roundTrip === proseToMarkdown(markdownToProse(roundTrip)),
    'table line break round trip is stable',
  );
}

{
  // process.md: a fence inside a list is a verbatim rawBlock, but the rendered
  // code must be dedented to the list indent, exactly as Hugo renders it. That
  // happens in extractFences (a pure function), so assert it directly.
  const p = byName.get('process.md');
  if (p) {
    const types: Record<string, number> = {};
    for (const c of markdownToProse(p.body).content ?? []) deepTypes(c, types);
    assert(
      (types.rawBlock ?? 0) > 0,
      `process.md keeps its list-nested fences as verbatim rawBlock (${types.rawBlock ?? 0})`,
    );
    const fr = extractFences(p.body);
    const first = fr.fences.find((f) => f.lang === 'powershell');
    const body =
      String(first?.code ?? '')
        .split('\n')
        .filter((l) => l.trim())[0] ?? '';
    const indent = body.length - body.trimStart().length;
    assert(indent === 3, `nested fence body dedented to 3 spaces like Hugo (got ${indent})`);
  }
}

if (failed) {
  console.error(`prose-roundtrip: ${failed} FAILURE(S)`);
  process.exit(1);
}
console.log('prose-roundtrip: all assertions passed');
process.exit(0);
