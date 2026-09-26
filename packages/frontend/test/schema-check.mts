/**
 * Schema validation: every post's WYSIWYG document must actually be a legal
 * ProseMirror document for the editor's schema — otherwise `setContent`
 * silently drops or corrupts content at runtime. `markdownToProse` producing
 * nice JSON is not enough; this builds the real schema from the extensions and
 * round-trips every post through `Node.fromJSON`.
 *
 * Run: bun run test/schema-check.mts
 */
// ---- browser shims (must exist before any app module is imported) ------
const g = globalThis as unknown as Record<string, unknown>;
g.window = globalThis;
g.matchMedia = () => ({
  matches: false,
  media: '',
  onchange: null,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {},
  dispatchEvent: () => false,
});
g.requestAnimationFrame = (cb: () => void) => setTimeout(cb, 0) as never;

const fs = await import('node:fs');
const path = await import('node:path');
const StarterKit = (await import('@tiptap/starter-kit')).default;
const Placeholder = (await import('@tiptap/extension-placeholder')).default;
const Table = (await import('@tiptap/extension-table')).Table;
const TableRow = (await import('@tiptap/extension-table-row')).TableRow;
const TableHeader = (await import('@tiptap/extension-table-header')).TableHeader;
const TableCell = (await import('@tiptap/extension-table-cell')).TableCell;
const getSchema = (await import('@tiptap/core')).getSchema;
const { markdownToProse, proseToMarkdown } = await import('../src/render/prose.ts');
const { RawBlock } = await import('../src/features/editor/RawBlock.tsx');
const { Hl } = await import('../src/features/editor/extensions/hl.ts');
const { Ruby } = await import('../src/features/editor/extensions/ruby.ts');
const { MathInline } = await import('../src/features/editor/extensions/math-inline.tsx');
const { Qmoji } = await import('../src/features/editor/extensions/qmoji.tsx');
const { Image } = await import('../src/features/editor/extensions/image.ts');
const POST_DIR = process.env.BLOG_ROOT
  ? path.join(process.env.BLOG_ROOT, 'content')
  : path.resolve(import.meta.dir, '../../../fixtures/blog/content');
const FM_SPLIT = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

const schema = getSchema([
  StarterKit.configure({ strike: {} }),
  Placeholder,
  Hl,
  Ruby,
  MathInline,
  Qmoji,
  Image,
  Table,
  TableRow,
  TableHeader,
  TableCell,
  RawBlock,
]);

let failed = 0;
const posts: { lang: string; name: string; body: string }[] = [];
for (const lang of ['zh', 'en']) {
  for (const name of fs.default.readdirSync(`${POST_DIR}/${lang}/post`)) {
    if (!name.endsWith('.md')) continue;
    const raw = fs.default.readFileSync(`${POST_DIR}/${lang}/post/${name}`, 'utf8');
    const m = FM_SPLIT.exec(raw);
    posts.push({ lang, name, body: m ? m[2] : raw });
  }
}

console.log(`schema-check: ${posts.length} posts`);
for (const p of posts) {
  const doc = markdownToProse(p.body);
  let err: string | null = null;
  try {
    schema.nodeFromJSON(doc);
    // The round-tripped document must validate too.
    schema.nodeFromJSON(markdownToProse(proseToMarkdown(doc)));
  } catch (e) {
    err = e instanceof Error ? e.message : String(e);
  }
  if (err) {
    console.error(`  FAIL ${p.lang}/${p.name}: ${err.split('\n')[0]}`);
    failed++;
  } else {
    console.log(`  ok   ${p.lang}/${p.name}`);
  }
}
if (failed) {
  console.error(`schema-check: ${failed} FAILURE(S)`);
  process.exitCode = 1;
} else {
  console.log('schema-check: all assertions passed');
}
